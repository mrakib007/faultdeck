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
	// Quarantine is independent of the existing monitoring queue's declaration,
	// so installations from batch 1 can upgrade without deleting queued events.
	if err := channel.ExchangeDeclare("faultdeck.invalid", "direct", true, false, false, false, nil); err != nil {
		return err
	}
	if _, err := channel.QueueDeclare("faultdeck.invalid", true, false, false, false, nil); err != nil {
		return err
	}
	if err := channel.QueueBind("faultdeck.invalid", "invalid", "faultdeck.invalid", false, nil); err != nil {
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
	if err := channel.Confirm(false); err != nil {
		return err
	}
	confirms := channel.NotifyPublish(make(chan amqp091.Confirmation, 1))

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
			event, occurredAt, err := parseEvent(delivery.Body)
			if err != nil {
				log.Printf("quarantining invalid failure event: %v", err)
				if err := quarantine(channel, confirms, delivery, err.Error()); err != nil {
					return err
				}
				continue
			}
			metadata := event.Metadata
			if metadata == nil {
				metadata = json.RawMessage(`{}`)
			}
			_, err = db.Exec(ctx, `INSERT INTO failure_events
				(event_id, version, job_id, attempt, service, queue, occurred_at, error_category, error_message, metadata)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (event_id) DO NOTHING`,
				event.EventID, event.Version, event.JobID, event.Attempt, event.Service, event.Queue,
				occurredAt, event.Error.Category, event.Error.Message, []byte(metadata))
			if err != nil {
				log.Printf("could not store event %s: %v", event.EventID, err)
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

func quarantine(channel *amqp091.Channel, confirms <-chan amqp091.Confirmation, delivery amqp091.Delivery, reason string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	// The original body can contain secrets. Keep it out of logs and restrict
	// broker management access. Quarantined messages expire after seven days.
	if err := channel.PublishWithContext(ctx, "faultdeck.invalid", "invalid", false, false, amqp091.Publishing{
		ContentType: "application/json", DeliveryMode: amqp091.Persistent, Body: delivery.Body,
		Expiration: "604800000",
		Headers:    amqp091.Table{"faultdeck_reason": reason},
	}); err != nil {
		return fmt.Errorf("publish invalid event: %w", err)
	}
	select {
	case confirmation, ok := <-confirms:
		if !ok || !confirmation.Ack {
			return fmt.Errorf("invalid event was not confirmed by rabbitmq")
		}
	case <-ctx.Done():
		return fmt.Errorf("timed out waiting for invalid-event publish confirmation")
	}
	// Only acknowledge the original once RabbitMQ confirms its quarantine copy.
	return delivery.Ack(false)
}
