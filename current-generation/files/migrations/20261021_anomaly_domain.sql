-- PROPOSED ONLY. Install separately under an exact root migration scope.
-- No existing opportunity table/trigger/index is modified.
CREATE TABLE report2_anomaly_bundle_v1 (
 logical_event_id TEXT PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=1),
 card_json TEXT NOT NULL CHECK(json_valid(card_json) AND json_type(card_json)='object' AND length(CAST(card_json AS BLOB))<=32768),
 card_sha256 TEXT NOT NULL CHECK(length(card_sha256)=64 AND card_sha256 NOT GLOB '*[^0-9a-f]*'),
 first_known_ts INTEGER NOT NULL CHECK(first_known_ts>0),
 descriptor_json TEXT NOT NULL CHECK(json_valid(descriptor_json) AND json_type(descriptor_json)='object' AND length(CAST(descriptor_json AS BLOB))<=2048),
 descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64),
 plan_json TEXT NOT NULL CHECK(json_valid(plan_json) AND json_type(plan_json)='object' AND length(CAST(plan_json AS BLOB))<=8192 AND COALESCE(json_type(plan_json,'$.cells'),'')='array' AND json_array_length(plan_json,'$.cells') BETWEEN 1 AND 32),
 plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256)=64),
 state_json TEXT NOT NULL CHECK(json_valid(state_json) AND json_type(state_json)='object' AND length(CAST(state_json AS BLOB))<=65536),
 state_sha256 TEXT NOT NULL CHECK(length(state_sha256)=64),
 watch_active INTEGER NOT NULL CHECK(watch_active IN(0,1)),
 next_check_ts INTEGER CHECK(next_check_ts IS NULL OR next_check_ts>0),
 last_snapshot_ts INTEGER NOT NULL CHECK(last_snapshot_ts>=0),
 last_operation_id TEXT NOT NULL,
 CHECK(COALESCE(json_extract(card_json,'$.first_known_ts'),-1)=first_known_ts),
 CHECK(COALESCE(json_extract(descriptor_json,'$.venue'),'')='HTX' AND COALESCE(json_extract(descriptor_json,'$.market'),'')='LINEAR_SWAP'),
 CHECK(COALESCE(json_extract(descriptor_json,'$.contract_code'),'')=COALESCE(json_extract(card_json,'$.instrument.contract'),'INVALID')),
 CHECK(length(COALESCE(json_extract(descriptor_json,'$.raw_native_listing_date'),''))=8 AND json_extract(descriptor_json,'$.raw_native_listing_date') NOT GLOB '*[^0-9]*'),
 CHECK(COALESCE(json_type(descriptor_json,'$.instrument_epoch'),'')='null'),
 CHECK(COALESCE(json_extract(state_json,'$.watch.active'),-1)=watch_active),
 CHECK(json_extract(state_json,'$.watch.next_check_ts') IS next_check_ts),
 CHECK(COALESCE(json_extract(state_json,'$.last_snapshot.ts'),-1)=last_snapshot_ts),
 CHECK(COALESCE(json_type(state_json,'$.outbox'),'')='object'),
 CHECK(COALESCE(json_type(state_json,'$.outcomes'),'')='object'),
 CHECK(COALESCE(json_type(state_json,'$.revisions'),'')='array'),
 CHECK(json_array_length(state_json,'$.revisions')<=32),
 CHECK(COALESCE(json_extract(state_json,'$.native_admission_qualified'),-1)=0),
 CHECK(COALESCE(json_extract(state_json,'$.event_first_knowledge_qualified'),-1)=0),
 CHECK(COALESCE(json_extract(state_json,'$.native_epoch_qualified'),-1)=0)
);
-- Inactive watches may still have pending long-horizon work.
CREATE INDEX report2_anomaly_due_v1 ON report2_anomaly_bundle_v1(next_check_ts,logical_event_id) WHERE next_check_ts IS NOT NULL;
CREATE UNIQUE INDEX report2_anomaly_record_window_v1 ON report2_anomaly_bundle_v1(json_extract(descriptor_json,'$.venue'),json_extract(descriptor_json,'$.market'),json_extract(descriptor_json,'$.contract_code'),json_extract(descriptor_json,'$.raw_native_listing_date'),json_extract(card_json,'$.timeframe'),json_extract(card_json,'$.event_start_ts'),json_extract(card_json,'$.event_end_ts'));
CREATE TABLE report2_anomaly_operation_v1 (
 operation_id TEXT PRIMARY KEY NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 160 AND length(CAST(operation_id AS BLOB))=length(operation_id)),
 request_sha256 TEXT NOT NULL CHECK(length(request_sha256)=64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
 logical_event_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL CHECK(expected_revision>=0),
 applied_revision INTEGER NOT NULL CHECK(applied_revision=expected_revision+1),
 card_sha256 TEXT NOT NULL,
 first_known_ts INTEGER NOT NULL,
 descriptor_sha256 TEXT NOT NULL,
 plan_sha256 TEXT NOT NULL,
 state_sha256 TEXT NOT NULL,
 -- Native DB receipt clock at SECOND resolution; never event first-known.
 server_recorded_ts_floor_ms INTEGER NOT NULL DEFAULT(CAST(strftime('%s','now') AS INTEGER)*1000),
 UNIQUE(logical_event_id,applied_revision)
);
-- One bound JSON input, no staging/full request retained per receipt.
CREATE VIEW report2_anomaly_commit_v1 AS SELECT CAST(NULL AS TEXT) AS request_json WHERE 0;
CREATE TRIGGER report2_anomaly_commit_v1_insert INSTEAD OF INSERT ON report2_anomaly_commit_v1
BEGIN
 SELECT CASE WHEN NOT json_valid(NEW.request_json) OR length(CAST(NEW.request_json AS BLOB))>131072
  THEN RAISE(ABORT,'ANOMALY_REQUEST_INVALID') END;
 SELECT CASE WHEN json_extract(NEW.request_json,'$.schema') IS NOT 'ANOMALY_DOMAIN_REQUEST_V1'
  OR json_type(NEW.request_json,'$.expected_revision') IS NOT 'integer'
  OR json_extract(NEW.request_json,'$.expected_revision')<0
  OR json_type(NEW.request_json,'$.first_known_ts') IS NOT 'integer'
  OR json_extract(NEW.request_json,'$.first_known_ts')<=0
  OR json_type(NEW.request_json,'$.operation_id') IS NOT 'text'
  OR length(json_extract(NEW.request_json,'$.operation_id')) NOT BETWEEN 1 AND 160
  OR json_type(NEW.request_json,'$.logical_event_id') IS NOT 'text'
  OR length(json_extract(NEW.request_json,'$.logical_event_id')) NOT BETWEEN 1 AND 160
  OR json_type(NEW.request_json,'$.card_json') IS NOT 'text'
  OR json_type(NEW.request_json,'$.descriptor_json') IS NOT 'text'
  OR json_type(NEW.request_json,'$.plan_json') IS NOT 'text'
  OR json_type(NEW.request_json,'$.state_json') IS NOT 'text'
  THEN RAISE(ABORT,'ANOMALY_REQUEST_SHAPE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM report2_anomaly_operation_v1 o WHERE o.operation_id=json_extract(NEW.request_json,'$.operation_id')
  AND (o.request_sha256 IS NOT json_extract(NEW.request_json,'$.request_sha256')
   OR o.logical_event_id IS NOT json_extract(NEW.request_json,'$.logical_event_id')
   OR o.expected_revision IS NOT json_extract(NEW.request_json,'$.expected_revision')
   OR o.card_sha256 IS NOT json_extract(NEW.request_json,'$.card_sha256')
   OR o.first_known_ts IS NOT json_extract(NEW.request_json,'$.first_known_ts')
   OR o.descriptor_sha256 IS NOT json_extract(NEW.request_json,'$.descriptor_sha256')
   OR o.plan_sha256 IS NOT json_extract(NEW.request_json,'$.plan_sha256')
   OR o.state_sha256 IS NOT json_extract(NEW.request_json,'$.state_sha256')))
  THEN RAISE(ABORT,'ANOMALY_OPERATION_ID_CONFLICT') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM report2_anomaly_operation_v1 WHERE operation_id=json_extract(NEW.request_json,'$.operation_id'))
  AND NOT ((json_extract(NEW.request_json,'$.expected_revision')=0 AND NOT EXISTS(SELECT 1 FROM report2_anomaly_bundle_v1 WHERE logical_event_id=json_extract(NEW.request_json,'$.logical_event_id')))
   OR EXISTS(SELECT 1 FROM report2_anomaly_bundle_v1 WHERE logical_event_id=json_extract(NEW.request_json,'$.logical_event_id') AND revision=json_extract(NEW.request_json,'$.expected_revision')))
  THEN RAISE(ABORT,'ANOMALY_CAS_CONFLICT') END;
 INSERT INTO report2_anomaly_operation_v1(operation_id,request_sha256,logical_event_id,expected_revision,applied_revision,card_sha256,first_known_ts,descriptor_sha256,plan_sha256,state_sha256)
 SELECT json_extract(NEW.request_json,'$.operation_id'),json_extract(NEW.request_json,'$.request_sha256'),json_extract(NEW.request_json,'$.logical_event_id'),json_extract(NEW.request_json,'$.expected_revision'),json_extract(NEW.request_json,'$.expected_revision')+1,
  json_extract(NEW.request_json,'$.card_sha256'),json_extract(NEW.request_json,'$.first_known_ts'),json_extract(NEW.request_json,'$.descriptor_sha256'),json_extract(NEW.request_json,'$.plan_sha256'),json_extract(NEW.request_json,'$.state_sha256')
 WHERE NOT EXISTS(SELECT 1 FROM report2_anomaly_operation_v1 WHERE operation_id=json_extract(NEW.request_json,'$.operation_id'));
 INSERT INTO report2_anomaly_bundle_v1(logical_event_id,revision,card_json,card_sha256,first_known_ts,descriptor_json,descriptor_sha256,plan_json,plan_sha256,state_json,state_sha256,watch_active,next_check_ts,last_snapshot_ts,last_operation_id)
 SELECT json_extract(NEW.request_json,'$.logical_event_id'),json_extract(NEW.request_json,'$.expected_revision')+1,json_extract(NEW.request_json,'$.card_json'),json_extract(NEW.request_json,'$.card_sha256'),json_extract(NEW.request_json,'$.first_known_ts'),
  json_extract(NEW.request_json,'$.descriptor_json'),json_extract(NEW.request_json,'$.descriptor_sha256'),json_extract(NEW.request_json,'$.plan_json'),json_extract(NEW.request_json,'$.plan_sha256'),json_extract(NEW.request_json,'$.state_json'),json_extract(NEW.request_json,'$.state_sha256'),
  json_extract(json_extract(NEW.request_json,'$.state_json'),'$.watch.active'),json_extract(json_extract(NEW.request_json,'$.state_json'),'$.watch.next_check_ts'),json_extract(json_extract(NEW.request_json,'$.state_json'),'$.last_snapshot.ts'),json_extract(NEW.request_json,'$.operation_id')
 WHERE (json_extract(NEW.request_json,'$.expected_revision')=0 AND NOT EXISTS(SELECT 1 FROM report2_anomaly_bundle_v1 WHERE logical_event_id=json_extract(NEW.request_json,'$.logical_event_id')))
  OR EXISTS(SELECT 1 FROM report2_anomaly_bundle_v1 WHERE logical_event_id=json_extract(NEW.request_json,'$.logical_event_id') AND revision=json_extract(NEW.request_json,'$.expected_revision'))
 ON CONFLICT(logical_event_id) DO UPDATE SET revision=excluded.revision,state_json=excluded.state_json,state_sha256=excluded.state_sha256,watch_active=excluded.watch_active,next_check_ts=excluded.next_check_ts,last_snapshot_ts=excluded.last_snapshot_ts,last_operation_id=excluded.last_operation_id;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM report2_anomaly_operation_v1 o JOIN report2_anomaly_bundle_v1 b USING(logical_event_id)
  WHERE o.operation_id=json_extract(NEW.request_json,'$.operation_id') AND b.revision>=o.applied_revision AND b.card_sha256=o.card_sha256 AND b.first_known_ts=o.first_known_ts AND b.descriptor_sha256=o.descriptor_sha256 AND b.plan_sha256=o.plan_sha256)
  THEN RAISE(ABORT,'ANOMALY_DOMAIN_RECEIPT_INCOMPLETE') END;
END;
CREATE TRIGGER report2_anomaly_bundle_v1_insert BEFORE INSERT ON report2_anomaly_bundle_v1
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM report2_anomaly_operation_v1 o WHERE o.operation_id=NEW.last_operation_id AND o.logical_event_id=NEW.logical_event_id AND o.applied_revision=NEW.revision AND o.card_sha256=NEW.card_sha256 AND o.first_known_ts=NEW.first_known_ts AND o.descriptor_sha256=NEW.descriptor_sha256 AND o.plan_sha256=NEW.plan_sha256 AND o.state_sha256=NEW.state_sha256)
  THEN RAISE(ABORT,'ANOMALY_OPERATION_RECEIPT_REQUIRED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.outbox') WHERE json_extract(value,'$.status') IS NOT 'DRAFT')
  OR (SELECT COUNT(*) FROM json_each(NEW.state_json,'$.outbox'))>32
  THEN RAISE(ABORT,'ANOMALY_SENDER_NOT_ENABLED') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM json_each(NEW.state_json,'$.outcomes'))<>json_array_length(NEW.plan_json,'$.cells')
  OR EXISTS(SELECT 1 FROM json_each(NEW.plan_json,'$.cells') c WHERE NOT EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.outcomes') o WHERE o.key=json_extract(c.value,'$.key') AND json_extract(o.value,'$.target_ts')=json_extract(c.value,'$.target_ts') AND json_extract(o.value,'$.status') IN('PENDING','CLOSED_FACTUAL','CENSORED_FINAL')))
  OR (NEW.next_check_ts IS NULL AND EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.outcomes') WHERE json_extract(value,'$.status')='PENDING'))
  THEN RAISE(ABORT,'ANOMALY_OUTCOME_PLAN_OR_DUE_CONFLICT') END;
END;
CREATE TRIGGER report2_anomaly_bundle_v1_update BEFORE UPDATE ON report2_anomaly_bundle_v1
BEGIN
 SELECT CASE WHEN NEW.logical_event_id IS NOT OLD.logical_event_id OR NEW.revision<>OLD.revision+1
  OR NEW.card_json IS NOT OLD.card_json OR NEW.card_sha256 IS NOT OLD.card_sha256 OR NEW.first_known_ts IS NOT OLD.first_known_ts
  OR NEW.descriptor_json IS NOT OLD.descriptor_json OR NEW.descriptor_sha256 IS NOT OLD.descriptor_sha256 OR NEW.plan_json IS NOT OLD.plan_json OR NEW.plan_sha256 IS NOT OLD.plan_sha256
  THEN RAISE(ABORT,'ANOMALY_IMMUTABLE_CARD_OR_PLAN') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM report2_anomaly_operation_v1 o WHERE o.operation_id=NEW.last_operation_id AND o.logical_event_id=NEW.logical_event_id AND o.expected_revision=OLD.revision AND o.applied_revision=NEW.revision AND o.card_sha256=NEW.card_sha256 AND o.first_known_ts=NEW.first_known_ts AND o.descriptor_sha256=NEW.descriptor_sha256 AND o.plan_sha256=NEW.plan_sha256 AND o.state_sha256=NEW.state_sha256)
  THEN RAISE(ABORT,'ANOMALY_OPERATION_RECEIPT_REQUIRED') END;
 SELECT CASE WHEN json_extract(NEW.state_json,'$.evaluated_ts')<json_extract(OLD.state_json,'$.evaluated_ts') OR NEW.last_snapshot_ts<OLD.last_snapshot_ts
  OR (NEW.last_snapshot_ts=OLD.last_snapshot_ts AND json_extract(NEW.state_json,'$.last_snapshot') IS NOT json_extract(OLD.state_json,'$.last_snapshot'))
  THEN RAISE(ABORT,'ANOMALY_SNAPSHOT_CLOCK_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.state_json,'$.outbox') prior_ref WHERE NOT EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.outbox') next_ref WHERE next_ref.key=prior_ref.key AND next_ref.value=prior_ref.value))
  OR EXISTS(SELECT 1 FROM json_each(OLD.state_json,'$.revisions') prior_ref WHERE NOT EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.revisions') next_ref WHERE next_ref.value=prior_ref.value))
  THEN RAISE(ABORT,'ANOMALY_PROTECTED_REFERENCE_REMOVAL') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.outbox') WHERE json_extract(value,'$.status') IS NOT 'DRAFT')
  OR (SELECT COUNT(*) FROM json_each(NEW.state_json,'$.outbox'))>32
  THEN RAISE(ABORT,'ANOMALY_SENDER_NOT_ENABLED') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM json_each(NEW.state_json,'$.outcomes'))<>json_array_length(NEW.plan_json,'$.cells')
  OR EXISTS(SELECT 1 FROM json_each(NEW.plan_json,'$.cells') c WHERE NOT EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.outcomes') o WHERE o.key=json_extract(c.value,'$.key') AND json_extract(o.value,'$.target_ts')=json_extract(c.value,'$.target_ts') AND json_extract(o.value,'$.status') IN('PENDING','CLOSED_FACTUAL','CENSORED_FINAL')))
  OR (NEW.next_check_ts IS NULL AND EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.outcomes') WHERE json_extract(value,'$.status')='PENDING'))
  OR EXISTS(SELECT 1 FROM json_each(OLD.state_json,'$.outcomes') o WHERE json_extract(o.value,'$.status')<>'PENDING' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.outcomes') n WHERE n.key=o.key AND n.value=o.value))
  THEN RAISE(ABORT,'ANOMALY_OUTCOME_PLAN_OR_DUE_CONFLICT') END;
END;
-- Receipt/card integrity and future retention remain protected, including unknown ACKs.
CREATE TRIGGER report2_anomaly_bundle_v1_no_delete BEFORE DELETE ON report2_anomaly_bundle_v1 BEGIN SELECT RAISE(ABORT,'ANOMALY_RETENTION_NOT_QUALIFIED'); END;
CREATE TRIGGER report2_anomaly_operation_v1_no_update BEFORE UPDATE ON report2_anomaly_operation_v1 BEGIN SELECT RAISE(ABORT,'ANOMALY_OPERATION_IMMUTABLE'); END;
CREATE TRIGGER report2_anomaly_operation_v1_no_delete BEFORE DELETE ON report2_anomaly_operation_v1 BEGIN SELECT RAISE(ABORT,'ANOMALY_RETENTION_NOT_QUALIFIED'); END;
