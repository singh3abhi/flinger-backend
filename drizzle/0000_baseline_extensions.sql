-- Baseline: database extensions the schema depends on.
-- Needs a role allowed to create extensions (on AWS RDS: rds_superuser). The runtime role used by
-- the app never needs this; only the migration role does.

-- Geospatial types and indexes for "people near me" (docs/03-data-model.md section 4).
CREATE EXTENSION IF NOT EXISTS postgis;

-- gen_random_bytes() and friends, used for token generation helpers.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
