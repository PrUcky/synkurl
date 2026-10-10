-- Migration 0003: messages from the investor contact form.
-- A separate table: never mixed with the waitlist. Safe to run more than once.
CREATE TABLE IF NOT EXISTS investor_contacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  organisation    TEXT,
  investor_type   TEXT NOT NULL CHECK (investor_type IN ('angel', 'vc', 'accelerator', 'other')),
  link            TEXT,             -- LinkedIn or website, https only
  message         TEXT NOT NULL,
  wants_deck      INTEGER NOT NULL DEFAULT 0 CHECK (wants_deck IN (0, 1)),
  notified        INTEGER NOT NULL DEFAULT 0 CHECK (notified IN (0, 1)),  -- 1 once the founder was emailed
  consent_version TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS investor_contacts_email_created ON investor_contacts (email, created_at);
