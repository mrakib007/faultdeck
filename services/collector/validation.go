package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Keep these bounds in sync with contracts/failure-event.v1.schema.json.
const maxEventBytes = 64 * 1024

var (
	uuidPattern        = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	metadataKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
)

type failureEvent struct {
	Version    int             `json:"version"`
	EventID    string          `json:"event_id"`
	JobID      string          `json:"job_id"`
	Attempt    int             `json:"attempt"`
	Service    string          `json:"service"`
	Queue      string          `json:"queue"`
	OccurredAt string          `json:"occurred_at"`
	Error      *failureError   `json:"error"`
	Metadata   json.RawMessage `json:"metadata"`
}

type failureError struct {
	Category string `json:"category"`
	Message  string `json:"message"`
}

// parseEvent accepts only the v1 contract. Invalid payloads are quarantined,
// not written to the database. Do not include raw payloads in error messages.
func parseEvent(body []byte) (failureEvent, time.Time, error) {
	var event failureEvent
	if len(body) > maxEventBytes {
		return event, time.Time{}, fmt.Errorf("event exceeds %d bytes", maxEventBytes)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	if err := decoder.Decode(&event); err != nil {
		return event, time.Time{}, fmt.Errorf("invalid JSON or unknown field")
	}
	if decoder.Decode(new(any)) != io.EOF {
		return event, time.Time{}, fmt.Errorf("extra JSON after event")
	}
	// encoding/json matches struct field names case-insensitively. The wire
	// contract does not: reject differently cased and extra keys explicitly.
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil || fields == nil {
		return event, time.Time{}, fmt.Errorf("invalid event object")
	}
	for field := range fields {
		switch field {
		case "version", "event_id", "job_id", "attempt", "service", "queue", "occurred_at", "error", "metadata":
		default:
			return event, time.Time{}, fmt.Errorf("unknown event field")
		}
	}
	var errorFields map[string]json.RawMessage
	if err := json.Unmarshal(fields["error"], &errorFields); err != nil || errorFields == nil {
		return event, time.Time{}, fmt.Errorf("invalid error object")
	}
	for field := range errorFields {
		if field != "category" && field != "message" {
			return event, time.Time{}, fmt.Errorf("unknown error field")
		}
	}
	if event.Version != 1 || !uuidPattern.MatchString(event.EventID) ||
		!validLength(event.JobID, 200) || event.Attempt < 1 || event.Attempt > 2147483647 ||
		!validLength(event.Service, 100) || !validLength(event.Queue, 200) ||
		event.Error == nil || !validLength(event.Error.Category, 100) || !validLength(event.Error.Message, 512) {
		return event, time.Time{}, fmt.Errorf("invalid required event field")
	}
	occurredAt, err := time.Parse(time.RFC3339Nano, event.OccurredAt)
	if err != nil {
		return event, time.Time{}, fmt.Errorf("invalid occurred_at")
	}
	metadata := map[string]any{}
	if event.Metadata != nil {
		if bytes.Equal(bytes.TrimSpace(event.Metadata), []byte("null")) {
			return event, time.Time{}, fmt.Errorf("invalid metadata value")
		}
		metadataDecoder := json.NewDecoder(bytes.NewReader(event.Metadata))
		metadataDecoder.UseNumber()
		if err := metadataDecoder.Decode(&metadata); err != nil || metadata == nil {
			return event, time.Time{}, fmt.Errorf("invalid metadata object")
		}
	}
	if len(metadata) > 10 {
		return event, time.Time{}, fmt.Errorf("too many metadata fields")
	}
	for key, value := range metadata {
		if !metadataKeyPattern.MatchString(key) {
			return event, time.Time{}, fmt.Errorf("invalid metadata key")
		}
		switch v := value.(type) {
		case string:
			if utf8.RuneCountInString(v) > 200 {
				return event, time.Time{}, fmt.Errorf("metadata string too long")
			}
		case json.Number:
			// PostgreSQL jsonb uses numeric, which cannot store unbounded JSON
			// exponents. Keep extreme numbers from becoming endless DB retries.
			number := string(v)
			if len(number) > 100 {
				return event, time.Time{}, fmt.Errorf("metadata number too large")
			}
			if index := strings.IndexAny(number, "eE"); index >= 0 {
				exponent, err := strconv.Atoi(number[index+1:])
				if err != nil || exponent < -300 || exponent > 300 {
					return event, time.Time{}, fmt.Errorf("metadata exponent out of range")
				}
			}
		case bool:
		default:
			return event, time.Time{}, fmt.Errorf("invalid metadata value")
		}
	}
	return event, occurredAt, nil
}

func validLength(s string, max int) bool {
	n := utf8.RuneCountInString(s)
	return n >= 1 && n <= max
}
