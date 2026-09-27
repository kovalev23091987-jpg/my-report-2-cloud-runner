import {randomUUID} from 'node:crypto';import {fingerprint,timestamp} from '../../src/core.mjs';
export const LIQ_QUOTA_VERSION='liq-quota-d1-candidate-v1';
const id=x=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=180;
// No schema creation and no automatic quota increase are performed here.
// A transaction grants a complete set of allowances or none. Never retry an
// ambiguous acknowledgement with another reservation_id; that would double spend.
export async function reserveLiquidationAllowance(db,{reservation_id,acquisition_identity,requirements,now_ms,nonce=randomUUID()}={}){
 if(!db?.prepare||typeof db.batch!=='function'||!id(reservation_id)||!id(nonce)||timestamp(now_ms)===null||!Array.isArray(requirements)||!requirements.length||requirements.length>6)throw Error('RESERVATION_INPUT_INVALID');
 const ids=['contract','run_id','acquisition_id'];if(!ids.every(k=>id(acquisition_identity?.[k])))throw Error('ACQUISITION_IDENTITY_REQUIRED');
 const sorted=requirements.map(r=>({...r})).sort((a,b)=>String(a.quota_key).localeCompare(String(b.quota_key)));
 const seen=new Set();for(const r of sorted){if(!id(r.quota_key)||!id(r.policy_receipt)||!Number.isSafeInteger(r.units)||r.units<1||r.units>24||seen.has(r.quota_key))throw Error('REQUIREMENT_INVALID');seen.add(r.quota_key);}
 const acquisition_hash=fingerprint({acquisition_identity,requirements:sorted});
 const clauses=sorted.map(()=>`EXISTS(SELECT 1 FROM report2_liq_quota_v1 WHERE quota_key=? AND policy_receipt=? AND valid_until_ms>=? AND reserved+?<=capacity)`);
 const insert=db.prepare(`INSERT INTO report2_liq_reservation_v1(reservation_id,acquisition_hash,attempt_nonce,state,requirements_json,created_ts)
 SELECT ?,?,?,'PENDING',?,? WHERE ${clauses.join(' AND ')} ON CONFLICT(reservation_id) DO NOTHING`).bind(reservation_id,acquisition_hash,nonce,JSON.stringify(sorted),now_ms,...sorted.flatMap(r=>[r.quota_key,r.policy_receipt,now_ms,r.units]));
 const updates=sorted.map(r=>db.prepare(`UPDATE report2_liq_quota_v1 SET reserved=reserved+? WHERE quota_key=? AND policy_receipt=?
 AND EXISTS(SELECT 1 FROM report2_liq_reservation_v1 WHERE reservation_id=? AND acquisition_hash=? AND attempt_nonce=? AND state='PENDING')`).bind(r.units,r.quota_key,r.policy_receipt,reservation_id,acquisition_hash,nonce));
 const finish=db.prepare("UPDATE report2_liq_reservation_v1 SET state='RESERVED' WHERE reservation_id=? AND acquisition_hash=? AND attempt_nonce=? AND state='PENDING'").bind(reservation_id,acquisition_hash,nonce);
 const read=db.prepare('SELECT reservation_id,acquisition_hash,attempt_nonce,state FROM report2_liq_reservation_v1 WHERE reservation_id=?').bind(reservation_id);
 try{
  const result=await db.batch([insert,...updates,finish,read]);
  if(!Array.isArray(result)||result.length!==sorted.length+3)return {allowed:false,status:'ACK_SHAPE_UNKNOWN_NO_NETWORK'};
  const changes=result.map(r=>r?.meta?.changes??r?.changes);const row=result.at(-1)?.results?.[0]??null;
  if(changes[0]===0){
   if(!updates.every((_,i)=>changes[i+1]===0)||changes.at(-2)!==0)return {allowed:false,status:'UNEXPECTED_DUPLICATE_WRITE_NO_NETWORK'};
   if(!row)return {allowed:false,status:'QUOTA_NOT_PROVISIONED_EXPIRED_OR_EXHAUSTED'};
   return {allowed:false,status:row.acquisition_hash===acquisition_hash?'ALREADY_RESERVED_DO_NOT_REEXECUTE':'RESERVATION_ID_COLLISION',reservation_id};
  }
  if(changes[0]!==1||!updates.every((_,i)=>changes[i+1]===1)||row?.acquisition_hash!==acquisition_hash||row?.attempt_nonce!==nonce||row?.state!=='RESERVED'||changes.at(-2)!==1)return {allowed:false,status:'INSERT_OR_BUDGET_ACK_NOT_CLOSED'};
  return {allowed:true,status:'ALL_REQUIREMENTS_RESERVED',reservation_id,acquisition_hash,requirements:sorted,logical_statements:result.length,new_insert_ack:1,version:LIQ_QUOTA_VERSION};
 }catch{return {allowed:false,status:'TRANSACTION_OR_TRANSPORT_NOT_CLOSED_NO_NETWORK',reservation_id};}
}
