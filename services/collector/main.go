package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rabbitmq/amqp091-go"
)

type failureEvent struct {
	Version    int            `json:"version"`
	EventID    string         `json:"event_id"`
	JobID      string         `json:"job_id"`
	Attempt    int            `json:"attempt"`
	Service    string         `json:"service"`
	Queue      string         `json:"queue"`
	OccurredAt time.Time      `json:"occurred_at"`
	Error      failureError   `json:"error"`
	Metadata   map[string]any `json:"metadata"`
}

type failureError struct {
	Category string `json:"category"`
	Message  string `json:"message"`
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	db, err := pgx.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("connect to postgres: %w", err)
	}
	defer db.Close(context.Background())

	broker, err := amqp091.Dial(os.Getenv("RABBITMQ_URL"))
	if err != nil {
		return fmt.Errorf("connect to rabbitmq: %w", err)
	}
	defer broker.Close()

	channel, err := broker.Channel()
	if err != nil {
		return err
	}
	defer channel.Close()

	if err := channel.ExchangeDeclare("faultdeck.failures", "direct", true, false, false, false, nil); err != nil {
		return err
	}
	if _, err := channel.QueueDeclare("faultdeck.failures", true, false, false, false, nil); err != nil {
		return err
	}
	if err := channel.QueueBind("faultdeck.failures", "failure", "faultdeck.failures", false, nil); err != nil {
		return err
	}
	if err := channel.Qos(1, 0, false); err != nil {
		return err
	}

	deliveries, err := channel.Consume("faultdeck.failures", "", false, false, false, false, nil)
	if err != nil {
		return err
	}
	log.Println("collector listening on faultdeck.failures")
	for {
		select {
		case <-ctx.Done():
			return nil
		case delivery, ok := <-deliveries:
			if !ok {
				return fmt.Errorf("rabbitmq delivery channel closed")
			}
			var event failureEvent
			if err := json.Unmarshal(delivery.Body, &event); err != nil || event.Version != 1 || event.EventID == "" {
				// A bounded invalid-event policy is part of the next batch.
				log.Printf("rejecting unreadable failure event")
				if err := delivery.Reject(false); err != nil {
					return err
				}
				continue
			}
			metadata := event.Metadata
			if metadata == nil {
				metadata = map[string]any{}
			}
			value, err := json.Marshal(metadata)
			if err != nil {
				return err
			}
			_, err = db.Exec(ctx, `INSERT INTO failure_events
				(event_id, version, job_id, attempt, service, queue, occurred_at, error_category, error_message, metadata)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (event_id) DO NOTHING`,
				event.EventID, event.Version, event.JobID, event.Attempt, event.Service, event.Queue,
				event.OccurredAt, event.Error.Category, event.Error.Message, value)
			if err != nil {
				log.Printf("could not store event: %v", err)
				// Closing the consumer leaves the delivery unacknowledged for broker redelivery.
				return err
			}
			if err := delivery.Ack(false); err != nil {
				return err
			}
			log.Printf("stored failure event %s", event.EventID)
		}
	}
}
