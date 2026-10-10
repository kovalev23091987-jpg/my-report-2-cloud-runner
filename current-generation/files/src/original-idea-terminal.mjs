import {canonicalFingerprint} from './canonical-publication.mjs';
import {originalIdeaIdentity} from './original-idea-recheck.mjs';

// One administrative transition within the existing bound-delivery envelope.
// No transport, new source request, new idea or entry is created here.
export async function prepareOriginalIdeaTerminal(db,{now_ts=Date.now()}={}){
 const rows=await db.prepare(`SELECT t.*,b.rules_version,b.observed_ts AS sent_observed_ts,d.telegram_message_id,l.status AS lifecycle_status
  FROM v3_recheck_task_shadow t
  JOIN v3_dispatch_publication_binding_shadow b ON b.publication_id=t.publication_id AND b.contract_code=t.contract_code AND b.direction=t.direction AND b.wave_id=t.wave_id AND b.run_id=t.run_id AND b.snapshot_id=t.snapshot_id
  JOIN v3_telegram_dispatch_shadow d ON d.idempotency_key=b.idempotency_key AND d.state='SENT' AND CAST(d.telegram_message_id AS INTEGER)>0 AND b.lifecycle_event IN ('OBSERVE','WAIT')
  JOIN v3_user_lifecycle_shadow l ON l.contract=t.contract_code AND l.direction=t.direction AND l.wave_id=t.wave_id AND l.rules_version=b.rules_version AND l.status IN ('OBSERVE','WAIT')
  WHERE t.state IN ('CANCELLED','EXPIRED') AND t.updated_ts>=?1 AND t.updated_ts<=?2
  ORDER BY t.due_ts DESC LIMIT 2`).bind(Math.max(Date.parse('2026-10-10T09:20:00Z'),now_ts-10800000),now_ts).all();
 for(const task of rows?.results||[]){
  const saved=await db.prepare('SELECT canonical_json FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1').bind(task.publication_id).first();
  let canonical,light;try{canonical=JSON.parse(saved?.canonical_json);const r=JSON.parse(task.last_result);light=r.schema==='LIGHT_PRICE_RECHECK_V1'?r:r.original_light_price_receipt;}catch{continue;}
  if(!originalIdeaIdentity({task,canonical})||canonical.analytical_fingerprint!==canonicalFingerprint(canonical))continue;
  const expired=task.state==='EXPIRED'&&task.expires_ts<=now_ts;
  const cancel=/^price\s*(>=|<=|>|<)\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)$/i.exec(String(canonical.trigger.cancel_condition||''));
  const cmp=(p,op,v)=>op==='>'?p>v:op==='>='?p>=v:op==='<'?p<v:op==='<='?p<=v:false;
  const cancelled=task.state==='CANCELLED'&&light?.schema==='LIGHT_PRICE_RECHECK_V1'&&light.status==='CANCELLED'&&
   light.task_id===task.task_id&&light.publication_id===task.publication_id&&light.run_id===task.run_id&&light.snapshot_id===task.snapshot_id&&
   light.analytical_fingerprint===canonical.analytical_fingerprint&&String(light.telegram_message_id)===String(task.telegram_message_id)&&
   light.entry_authorized===false&&light.source==='HTX_OFFICIAL_COLLECTOR'&&Number.isSafeInteger(light.source_ts)&&
   light.source_ts<=light.observed_ts&&light.observed_ts<=light.checked_ts&&light.checked_ts<=now_ts&&light.checked_ts-light.source_ts<=180000&&
   light.source_ts>=canonical.observed_ts&&typeof light.price==='number'&&light.price>0&&cancel&&cmp(light.price,cancel[1],Number(cancel[2]));
  if(!expired&&!cancelled)continue;
  const reason=expired?'ORIGINAL_TTL_EXPIRED':'ORIGINAL_PRICE_CANCELLED',key=[task.contract_code,task.direction,task.wave_id,'IDEA_REMOVED',task.rules_version].join('|');
  const receipt={schema:'LIFECYCLE_REMOVAL_RECEIPT_V1',market_snapshot:false,source_run_id:'ORIGINAL-TASK-TERMINAL:'+task.task_id,
   contract:task.contract_code,direction:task.direction,wave_id:task.wave_id,observed_ts:now_ts,reason,
   original_publication_id:task.publication_id,original_task_id:task.task_id,original_run_id:task.run_id,
   original_snapshot_id:task.snapshot_id,original_fingerprint:canonical.analytical_fingerprint,original_expires_ts:task.expires_ts,
   original_telegram_message_id:String(task.telegram_message_id),cancel_condition:cancelled?canonical.trigger.cancel_condition:null,
   conditions:[{source:expired?'ORIGINAL_RECHECK_TASK_TTL':'HTX_OFFICIAL_COLLECTOR',row_id:task.task_id,observed_ts:expired?now_ts:light.checked_ts,
    field:expired?'original_expires_ts':'original_cancel_price',value:expired?task.expires_ts:light.price}],
   ...(cancelled?{original_light_price_receipt:light}:{})};
  const writes=await db.batch([
   db.prepare(`UPDATE v3_user_lifecycle_shadow SET status='IDEA_REMOVED',reason=?5,observation_ts=?6,updated_ts=?6
    WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 AND status IN ('OBSERVE','WAIT')
    AND NOT EXISTS(SELECT 1 FROM v3_telegram_dispatch_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 AND lifecycle_event='IDEA_REMOVED')`).bind(task.contract_code,task.direction,task.wave_id,task.rules_version,reason,now_ts),
   db.prepare(`INSERT OR IGNORE INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,message_hash,created_ts,updated_ts,shadow_only)
    SELECT ?1,?2,?3,?4,?5,'IDEA_REMOVED',?6,'PENDING',NULL,?7,?8,?8,1
    WHERE EXISTS(SELECT 1 FROM v3_user_lifecycle_shadow WHERE contract=?3 AND direction=?4 AND wave_id=?5 AND rules_version=?6 AND status='IDEA_REMOVED' AND observation_ts=?8 AND reason=?9)`).bind('V3TG:'+key,key,task.contract_code,task.direction,task.wave_id,task.rules_version,JSON.stringify(receipt),now_ts,reason)
  ]);
  const queued=Number(writes?.[1]?.meta?.changes??writes?.[1]?.changes??0)===1;
  if(queued)return {status:'ORIGINAL_TERMINAL_QUEUED',queued:true,task_id:task.task_id,reason,idempotency_key:key,original_message_id:String(task.telegram_message_id)};
 }
 return {status:'NO_ELIGIBLE_ORIGINAL_TERMINAL',queued:false};
}
