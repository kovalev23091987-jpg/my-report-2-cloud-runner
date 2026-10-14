-- DATA_DB (primary), not either private archive database. Apply only with
-- owner lease, measured row count and a separate shared native D1 reservation.
-- Maintains original values; the historical cursor can seek by original clock.
CREATE INDEX IF NOT EXISTS report2_canonical_observed_pub_v1
  ON canonical_publication_shadow(observed_ts,publication_id);
