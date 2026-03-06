-- Add custom_fields JSONB column to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';
