-- Reverts 0001_baseline. RESTRICT: fails if later migrations left objects behind.
DROP TABLE IF EXISTS platform.schema_migration;

DROP SCHEMA IF EXISTS nav RESTRICT;
DROP SCHEMA IF EXISTS inventory RESTRICT;
DROP SCHEMA IF EXISTS invoicing RESTRICT;
DROP SCHEMA IF EXISTS masterdata RESTRICT;
DROP SCHEMA IF EXISTS platform RESTRICT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    DROP ROLE erp_app;
  END IF;
END
$$;
