// Local Node 24 SQLite proof only. NOT a D1 migration or production adapter.
import {DatabaseSync} from 'node:sqlite';
import {verifyCompactContext} from './compact-context.mjs';
export class LocalProofStore {
 constructor(file=':memory:'){
  this.db=new DatabaseSync(file);
  this.db.exec(`PRAGMA busy_timeout=1000;
   CREATE TABLE IF NOT EXISTS research_liq_context (
    id TEXT PRIMARY KEY, contract TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
    run_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, as_of_ms INTEGER NOT NULL,
    fingerprint TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload) AND length(CAST(payload AS BLOB))<=8704));
   CREATE TABLE IF NOT EXISTS research_quota (provider TEXT NOT NULL,window TEXT NOT NULL,ceiling INTEGER NOT NULL CHECK(ceiling>=0),reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=ceiling),PRIMARY KEY(provider,window));
   CREATE TABLE IF NOT EXISTS research_reservation (reservation_id TEXT PRIMARY KEY,provider TEXT NOT NULL,window TEXT NOT NULL,units INTEGER NOT NULL CHECK(units>0));`);
 }
 persist(id,context){
  if(!verifyCompactContext(context,context.identity))throw Error('INVALID_CONTEXT_FINGERPRINT');
  const i=context.identity;
  const r=this.db.prepare(`INSERT INTO research_liq_context(id,contract,direction,run_id,snapshot_id,as_of_ms,fingerprint,payload) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).run(id,i.contract,i.direction,i.run_id,i.snapshot_id,i.as_of_ms,context.fingerprint,JSON.stringify(context));
  if(r.changes===1)return {new_row_persisted:true,insert_changes:1};
  const prior=this.db.prepare('SELECT fingerprint FROM research_liq_context WHERE id=?').get(id);
  if(!prior||prior.fingerprint!==context.fingerprint)throw Error('IMMUTABLE_ID_COLLISION');
  return {new_row_persisted:false,insert_changes:0,deduplicated_same_payload:true};
 }
 load(id,expected){
  const row=this.db.prepare('SELECT payload FROM research_liq_context WHERE id=? AND contract=? AND direction=? AND run_id=? AND snapshot_id=? AND as_of_ms=?').get(id,expected.contract,expected.direction,expected.run_id,expected.snapshot_id,expected.as_of_ms);
  if(!row)return null;const value=JSON.parse(row.payload);
  if(!verifyCompactContext(value,expected))throw Error('PERSISTED_CONTENT_TAMPERED_OR_WRONG_SYMBOL');
  return value;
 }
 configureQuota(provider,window,ceiling){
  if(!Number.isSafeInteger(ceiling)||ceiling<0)throw Error('QUOTA_INVALID');
  this.db.prepare('INSERT INTO research_quota(provider,window,ceiling) VALUES (?,?,?) ON CONFLICT(provider,window) DO NOTHING').run(provider,window,ceiling);
  const r=this.db.prepare('SELECT ceiling FROM research_quota WHERE provider=? AND window=?').get(provider,window);
  if(r.ceiling!==ceiling)throw Error('IMPLICIT_QUOTA_CHANGE_REFUSED');
 }
 reserve(reservation_id,provider,window,units){
  if(!Number.isSafeInteger(units)||units<=0)throw Error('RESERVATION_UNITS_INVALID');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const old=this.db.prepare('SELECT provider,window,units FROM research_reservation WHERE reservation_id=?').get(reservation_id);
   if(old){if(old.provider!==provider||old.window!==window||old.units!==units)throw Error('RESERVATION_ID_COLLISION');this.db.exec('COMMIT');return {reserved:false,dedup:true};}
   const change=this.db.prepare('UPDATE research_quota SET reserved=reserved+? WHERE provider=? AND window=? AND reserved+?<=ceiling').run(units,provider,window,units);
   if(change.changes!==1){this.db.exec('ROLLBACK');return {reserved:false,reason:'FREE_QUOTA_OR_CONFIG_MISSING'};}
   this.db.prepare('INSERT INTO research_reservation(reservation_id,provider,window,units) VALUES (?,?,?,?)').run(reservation_id,provider,window,units);
   this.db.exec('COMMIT');return {reserved:true,units};
  }catch(e){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw e;}
 }
 close(){this.db.close();}
}
