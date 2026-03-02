-- Simple CRM Database Schema
-- Run this once to set up the database

CREATE DATABASE simple_crm;

\c simple_crm;

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id          SERIAL PRIMARY KEY,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(255) UNIQUE,
  phone       VARCHAR(50),
  company     VARCHAR(200),
  status      VARCHAR(50) DEFAULT 'lead'
                CHECK (status IN ('lead', 'prospect', 'customer', 'churned')),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Sample data
INSERT INTO contacts (first_name, last_name, email, phone, company, status) VALUES
  ('Ana', 'Popescu', 'ana.popescu@example.com', '+40 721 000 001', 'Popescu SRL', 'customer'),
  ('Mihai', 'Ionescu', 'mihai@ionescu.ro', '+40 721 000 002', 'Ionescu & Co', 'prospect'),
  ('Cristina', 'Dumitru', 'cristina.d@gmail.com', '+40 721 000 003', NULL, 'lead');
