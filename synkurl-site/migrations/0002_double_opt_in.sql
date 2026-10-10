-- Migration 0002: email confirmation ("double opt-in"), the 18+ tick box,
-- new answer options and the optional "which design" question.
--
-- SQLite can't change CHECK rules in place, so this builds a new table,
-- copies every existing row into it, then swaps the two. No rows are lost.
--
-- Run it ONCE. The first line is a guard: if this migration already ran,
-- the waitlist table already has a "status" column, so the line fails and
-- nothing after it runs.

ALTER TABLE waitlist ADD COLUMN status TEXT;

DROP TABLE IF EXISTS waitlist_new;

CREATE TABLE waitlist_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT NOT NULL UNIQUE,
  phone_type       TEXT NOT NULL CHECK (phone_type IN ('android', 'iphone', 'both', 'other')),
  city             TEXT NOT NULL,
  family_size      TEXT NOT NULL CHECK (family_size IN ('1-2', '3-4', '5-6', '7+', 'not-sure')),
  device_pick      TEXT CHECK (device_pick IS NULL OR device_pick IN ('arch', 'album', 'pebble', 'not-sure')),
  is_adult         INTEGER CHECK (is_adult IS NULL OR is_adult IN (0, 1)),
  lang             TEXT NOT NULL DEFAULT 'en',
  -- pending: waiting for the person to click Confirm in the email
  -- confirmed: clicked Confirm
  -- single_opt_in: joined while confirmation emails were switched off
  status           TEXT NOT NULL DEFAULT 'single_opt_in'
                   CHECK (status IN ('pending', 'confirmed', 'single_opt_in')),
  token_hash       TEXT UNIQUE,   -- SHA-256 of the email link code, never the code itself
  token_expires_at TEXT,
  email_sent_at    TEXT,
  confirmed_at     TEXT,
  consent_version  TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Rows from before this change never confirmed by email and never saw the 18+ box.
INSERT INTO waitlist_new (id, email, phone_type, city, family_size, consent_version, created_at, status, lang, is_adult)
SELECT id, email, phone_type, city, family_size, consent_version, created_at, 'single_opt_in', 'en', NULL
FROM waitlist;

DROP TABLE waitlist;

ALTER TABLE waitlist_new RENAME TO waitlist;

CREATE INDEX IF NOT EXISTS waitlist_status_created ON waitlist (status, created_at);
