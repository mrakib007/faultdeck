package integration

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rabbitmq/amqp091-go"
)

// Run from the repository root after `docker compose up --build -d`:
// FAULTDECK_INTEGRATION=1 go test ./tests/integration -count=1 -v
// This test temporarily stops and restarts the local Compose PostgreSQL container.
func TestDelivery(t *testing.T) {
	if os.Getenv("FAULTDECK_INTEGRATION") != "1" {
		t.Skip("set FAULTDECK_INTEGRATION=1 to test the local Compose stack")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, "postgres://faultdeck:faultdeck_dev@127.0.0.1:15432/faultdeck")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	broker, err := amqp091.Dial("amqp://faultdeck:faultdeck_dev@127.0.0.1:5672")
	if err != nil {
		t.Fatal(err)
	}
	defer broker.Close()
	channel, err := broker.Channel()
	if err != nil {
		t.Fatal(err)
	}
	defer channel.Close()
	if err := channel.Confirm(false); err != nil {
		t.Fatal(err)
	}
	confirms := channel.NotifyPublish(make(chan amqp091.Confirmation, 1))
	publish := func(body []byte) {
		t.Helper()
		if err := channel.PublishWithContext(ctx, "faultdeck.failures", "failure", false, false, amqp091.Publishing{
			ContentType: "application/json", DeliveryMode: amqp091.Persistent, Body: body,
		}); err != nil {
			t.Fatal(err)
		}
		select {
		case confirmation := <-confirms:
			if !confirmation.Ack {
				t.Fatal("RabbitMQ did not confirm publish")
			}
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
	count := func(id string) int {
		t.Helper()
		var n int
		if err := db.QueryRow(ctx, "SELECT count(*) FROM failure_events WHERE event_id = $1", id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	wait := func(description string, check func() bool) {
		t.Helper()
		deadline := time.Now().Add(35 * time.Second)
		for time.Now().Before(deadline) {
			if check() {
				return
			}
			time.Sleep(250 * time.Millisecond)
		}
		t.Fatalf("timed out waiting for %s", description)
	}

	id := newID(t)
	event := newEvent(t, id)
	publish(event)
	wait("first insert", func() bool { return count(id) == 1 })
	publish(event)
	wait("duplicate delivery to be acknowledged", func() bool {
		q, err := channel.QueueInspect("faultdeck.failures")
		return err == nil && q.Messages == 0
	})
	if got := count(id); got != 1 {
		t.Fatalf("duplicate event produced %d rows", got)
	}
	// Hold the insert at PostgreSQL and observe RabbitMQ's unacknowledged
	// count: the collector must not acknowledge before the transaction commits.
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "LOCK TABLE failure_events IN ACCESS EXCLUSIVE MODE"); err != nil {
		_ = tx.Rollback(ctx)
		t.Fatal(err)
	}
	id = newID(t)
	publish(newEvent(t, id))
	wait("collector to hold unacknowledged message while insert is blocked", func() bool {
		return unacked(t) > 0
	})
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	wait("blocked insert to commit", func() bool { return count(id) == 1 })
	wait("acknowledgement after insert", func() bool { return unacked(t) == 0 })

	compose(t, ctx, "restart", "collector")
	id = newID(t)
	publish(newEvent(t, id))
	wait("insert after collector restart", func() bool { return count(id) == 1 })

	invalid := []byte(fmt.Sprintf(`{"version":2,"event_id":"%s","job_id":"bad"}`, newID(t)))
	previous, err := channel.QueueInspect("faultdeck.invalid")
	if err != nil {
		t.Fatal(err)
	}
	publish(invalid)
	wait("invalid event quarantine", func() bool {
		q, err := channel.QueueInspect("faultdeck.invalid")
		return err == nil && q.Messages > previous.Messages
	})
	var other []amqp091.Delivery
	for i := 0; i <= previous.Messages; i++ {
		quarantined, ok, err := channel.Get("faultdeck.invalid", false)
		if err != nil || !ok {
			t.Fatalf("get invalid event: ok=%v err=%v", ok, err)
		}
		if string(quarantined.Body) == string(invalid) {
			if err := quarantined.Ack(false); err != nil {
				t.Fatal(err)
			}
			break
		}
		other = append(other, quarantined)
		if i == previous.Messages {
			t.Fatal("own invalid event not found in quarantine")
		}
	}
	for _, delivery := range other {
		if err := delivery.Nack(false, true); err != nil {
			t.Fatal(err)
		}
	}

	// Keep this last because stopping Postgres also affects other local clients.
	compose(t, ctx, "stop", "postgres")
	defer func() {
		// Restore the user's stack even when an assertion fails.
		restoreCtx, restoreCancel := context.WithTimeout(context.Background(), time.Minute)
		defer restoreCancel()
		if output, err := exec.CommandContext(restoreCtx, "docker", "compose", "start", "postgres").CombinedOutput(); err != nil {
			t.Errorf("restore postgres: %v: %s", err, output)
		}
		if output, err := exec.CommandContext(restoreCtx, "docker", "compose", "up", "-d", "collector").CombinedOutput(); err != nil {
			t.Errorf("restore collector: %v: %s", err, output)
		}
	}()
	id = newID(t)
	publish(newEvent(t, id))
	wait("event to remain in monitoring queue during outage", func() bool {
		q, err := channel.QueueInspect("faultdeck.failures")
		return err == nil && q.Messages > 0
	})
	compose(t, ctx, "start", "postgres")
	compose(t, ctx, "up", "-d", "collector")
	wait("event stored after database recovery", func() bool { return count(id) == 1 })
}

func unacked(t *testing.T) int {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, "http://127.0.0.1:15672/api/queues/%2F/faultdeck.failures", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.SetBasicAuth("faultdeck", "faultdeck_dev")
	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("RabbitMQ management returned %s", response.Status)
	}
	var queue struct {
		Unacked int `json:"messages_unacknowledged"`
	}
	if err := json.NewDecoder(response.Body).Decode(&queue); err != nil {
		t.Fatal(err)
	}
	return queue.Unacked
}

func compose(t *testing.T, ctx context.Context, args ...string) {
	t.Helper()
	command := exec.CommandContext(ctx, "docker", append([]string{"compose"}, args...)...)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("docker compose %v: %v: %s", args, err, output)
	}
}

func newID(t *testing.T) string {
	t.Helper()
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		t.Fatal(err)
	}
	id[6] = id[6]&0x0f | 0x40
	id[8] = id[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", id[:4], id[4:6], id[6:8], id[8:10], id[10:])
}

func newEvent(t *testing.T, id string) []byte {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"version": 1, "event_id": id, "job_id": "test-" + id, "attempt": 1,
		"service": "integration-test", "queue": "example.jobs", "occurred_at": time.Now().UTC().Format(time.RFC3339),
		"error": map[string]string{"category": "ExampleError", "message": "simulated failure"},
	})
	if err != nil {
		t.Fatal(err)
	}
	return body
}
