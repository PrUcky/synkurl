-- Migration 0001: the original waitlist table (one row per email).
-- Safe to run more than once: it does nothing if the table already exists.
CREATE TABLE IF NOT EXISTS waitlist (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  phone_type      TEXT NOT NULL CHECK (phone_type IN ('android', 'iphone', 'both')),
  city            TEXT NOT NULL,
  family_size     TEXT NOT NULL CHECK (family_size IN ('1-2', '3-4', '5-6', '7+')),
  consent_version TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
