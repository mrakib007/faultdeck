package main

import (
	"strings"
	"testing"
)

const validEvent = `{"version":1,"event_id":"7b04e927-22b5-4a2b-b176-25244236ea5f","job_id":"job-1","attempt":1,"service":"mailer","queue":"email.delivery","occurred_at":"2026-10-24T12:00:00Z","error":{"category":"ConnectionError","message":"SMTP unavailable"},"metadata":{"provider":"internal-smtp"}}`

func TestParseEvent(t *testing.T) {
	cases := []struct {
		name, body string
		valid      bool
	}{
		{"valid", validEvent, true},
		{"optional metadata", strings.Replace(validEvent, `,"metadata":{"provider":"internal-smtp"}`, "", 1), true},
		{"unknown version", strings.Replace(validEvent, `"version":1`, `"version":2`, 1), false},
		{"unknown field", strings.Replace(validEvent, `"attempt":1`, `"attempt":1,"payload":"secret"`, 1), false},
		{"wrong field case", strings.Replace(validEvent, `"job_id"`, `"Job_ID"`, 1), false},
		{"unknown error field", strings.Replace(validEvent, `"message":"SMTP unavailable"`, `"message":"SMTP unavailable","stack":"secret"`, 1), false},
		{"missing job", strings.Replace(validEvent, `"job_id":"job-1"`, `"job_id":""`, 1), false},
		{"invalid uuid", strings.Replace(validEvent, `7b04e927-22b5-4a2b-b176-25244236ea5f`, `bad`, 1), false},
		{"invalid time", strings.Replace(validEvent, `2026-10-24T12:00:00Z`, `yesterday`, 1), false},
		{"metadata null", strings.Replace(validEvent, `{"provider":"internal-smtp"}`, `null`, 1), false},
		{"metadata array", strings.Replace(validEvent, `{"provider":"internal-smtp"}`, `[]`, 1), false},
		{"metadata object value", strings.Replace(validEvent, `"internal-smtp"`, `{}`, 1), false},
		{"metadata extreme number", strings.Replace(validEvent, `"internal-smtp"`, `1e1000000`, 1), false},
		{"metadata invalid name", strings.Replace(validEvent, `"provider"`, `"Provider"`, 1), false},
		{"trailing json", validEvent + `{}`, false},
		{"oversized", validEvent + strings.Repeat(" ", maxEventBytes), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := parseEvent([]byte(tc.body))
			if (err == nil) != tc.valid {
				t.Fatalf("expected valid=%v, got error=%v", tc.valid, err)
			}
		})
	}
}
