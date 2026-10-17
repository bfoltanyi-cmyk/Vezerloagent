-- 0001_baseline: module schemas and the application role.
-- Login roles and their passwords are created by the installer from generated secrets,
-- never in migrations. Tables, RLS and triggers follow in the "DB alapok" task.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    CREATE ROLE erp_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS masterdata;
CREATE SCHEMA IF NOT EXISTS invoicing;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS nav;

GRANT USAGE ON SCHEMA platform, masterdata, invoicing, inventory, nav TO erp_app;

-- Migration bookkeeping (used by the migration runner).
CREATE TABLE IF NOT EXISTS platform.schema_migration (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
