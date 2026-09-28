import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const captured=JSON.parse(fs.readFileSync(new URL('../../audit-fixes/t00/fixtures/d1-schema.json',import.meta.url),'utf8'));
const objectSql=name=>captured.rows.find(row=>row.name===name)?.sql;
const migration=fs.readFileSync(new URL('../migrations/011_stage392_post_decision_ack_guard.sql',import.meta.url),'utf8');
const migrationStatements=migration.split('-- report2:statement-break').map(value=>value.trim()).filter(Boolean);
const receipt=id=>({status:'PREPARED_UNACKNOWLEDGED',receipt_id:id,content_digest:'0123456789abcdef',committed_ts:null,timeline_contract:'DECISION_THEN_EXACT_D1_ACK_V1',immutable:true,verification_method:'D1_IMMUTABLE_RECEIPT'});
const bundle=()=>({
  mode:'SHADOW_ONLY_NO_EXECUTION',contract_code:'DOGE-USDT',observed_ts:1790615553610,
  full_evidence:{schema_version:'full-evidence-shadow-v1',full_evidence_id:'FE:TEST',contract_code:'DOGE-USDT',observed_ts:1790615553610,
    fixed_decision_weights:{CROSS_EXCHANGE_DERIVATIVES:35,MARKET_STRENGTH_SPOT:30,SMART_MONEY_ONCHAIN:20,SUPPORTING_RISK:15},
    persistence:receipt('FEROW:TEST'),source_registry:{status:'CLOSED',authoritative:true,receipt_id:'FER:TEST',persistence:receipt('FER:TEST')}},
  evidence_registry:{status:'CLOSED',authoritative:true,rules_version:'causal-lineage-registry-v3-full-envelope',receipt_id:'DER:TEST',persistence:receipt('DER:TEST')},
  safety_gate_receipt:{status:'CLOSED',authoritative:true,receipt_id:'SGR:TEST',persistence:receipt('SGR:TEST')},
});
const insert=(db,id,payload,weights=[35,30,20,15])=>db.prepare(`INSERT INTO full_evidence_shadow_log (
  full_evidence_id,shadow_id,contract_code,observed_ts,rules_version,mode,fixed_weights_json,
  weight_derivatives,weight_market_strength_spot,weight_smart_money_onchain,weight_supporting_risk,
  strategy_weights_changed,automatic_weight_tuning_enabled,htx_execution_gate_closed,dq_status,
  full_decision_eligible,live_signal,validated,telegram_started,trading_execution,
  missing_data_coerced_to_zero,cross_venue_dispersion_called_conflict,shadow_only,retention_days,persisted_ts,stage392_proof_bundle_json
) VALUES (?1,'S','DOGE-USDT',1790615553610,'R','FULL_EVIDENCE_SHADOW_NO_EXECUTION','{}',?2,?3,?4,?5,0,0,0,'PARTIAL',0,0,0,0,0,0,0,1,180,1790615554000,?6)`).run(id,...weights,JSON.stringify(payload));

test('captured production schema accepts only V12 prepared proof before exact ACK',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(objectSql('full_evidence_shadow_log'));
  db.exec(objectSql('trg_stage392_full_evidence_proof_insert_guard'));
  assert.throws(()=>insert(db,'FE:OLD-GUARD',bundle()),/stage392 full evidence proof contract invalid/);
  db.exec('BEGIN');
  for(const statement of migrationStatements)db.exec(statement);
  db.exec('COMMIT');
  const accepted=insert(db,'FE:TEST',bundle());
  assert.equal(Number(accepted.changes),1);
  const wrongTimeline=bundle(); wrongTimeline.full_evidence.persistence.timeline_contract='WRONG';
  assert.throws(()=>insert(db,'FE:BAD-TIMELINE',wrongTimeline),/stage392 full evidence proof contract invalid/);
  assert.throws(()=>insert(db,'FE:BAD-WEIGHTS',bundle(),[32,30,20,18]),/(stage392 full evidence proof contract invalid|CHECK constraint failed)/);
  db.close();
});
