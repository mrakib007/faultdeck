package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/rabbitmq/amqp091-go"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	// Simulate an application job that fails; only reviewed, sanitized fields
	// are sent to FaultDeck, never the original job payload or raw error.
	if err := sendEmail(); err == nil {
		return nil
	}

	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		return err
	}
	id[6] = (id[6] & 0x0f) | 0x40
	id[8] = (id[8] & 0x3f) | 0x80
	eventID := fmt.Sprintf("%x-%x-%x-%x-%x", id[:4], id[4:6], id[6:8], id[8:10], id[10:])
	event := map[string]any{
		"version": 1, "event_id": eventID, "job_id": "demo-email-" + eventID, "attempt": 1,
		"service": "mailer", "queue": "email.delivery", "occurred_at": time.Now().UTC().Format(time.RFC3339),
		"error":    map[string]string{"category": "ConnectionError", "message": "SMTP connection refused"},
		"metadata": map[string]string{"provider": "internal-smtp"},
	}
	body, err := json.Marshal(event)
	if err != nil {
		return err
	}
	broker, err := amqp091.Dial(os.Getenv("RABBITMQ_URL"))
	if err != nil {
		return err
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
	// Declare the destination before publishing, including when the collector
	// has not yet started. This queue is separate from application job queues.
	if _, err := channel.QueueDeclare("faultdeck.failures", true, false, false, false, nil); err != nil {
		return err
	}
	if err := channel.QueueBind("faultdeck.failures", "failure", "faultdeck.failures", false, nil); err != nil {
		return err
	}
	if err := channel.PublishWithContext(context.Background(), "faultdeck.failures", "failure", false, false,
		amqp091.Publishing{ContentType: "application/json", DeliveryMode: amqp091.Persistent, Body: body}); err != nil {
		return err
	}
	log.Printf("published failure event %s", eventID)
	return nil
}

func sendEmail() error {
	return fmt.Errorf("simulated SMTP connection failure")
}
