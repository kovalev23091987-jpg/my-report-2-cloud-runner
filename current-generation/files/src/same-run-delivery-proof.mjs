const text=v=>typeof v==='string'?v:'';
const id=v=>/^[1-9][0-9]*$/.test(String(v))?String(v):null;
export function buildSameRunDeliveryProof({output,delivery,recorded_at}={}){
 const cases=[];
 for(const row of delivery?.lifecycle||[]){
  const b=row.bound_receipt;
  if(!b||b.schema!=='BOUND_DELIVERY_RECEIPT_V1')continue;
  const c=output?.candidates?.find(c=>c.publication_id===b.publication_id),a=c?.canonical;
  const binding=output?.status==='CLOSED'&&text(output.run_id)!==''&&b.source_run_id===output.run_id&&b.run_id===output.run_id&&c?.run_id===b.run_id&&c?.snapshot_id===b.snapshot_id&&a?.run_id===b.run_id&&a?.snapshot_id===b.snapshot_id&&c?.contract===b.contract&&c?.direction===b.direction&&c?.wave_id===b.wave_id&&c?.lifecycle_event===b.lifecycle_event&&c?.observed_ts===b.observed_ts&&a?.observed_ts===b.observed_ts&&a?.analytical_fingerprint===b.analytical_fingerprint&&/^[a-f0-9]{64}$/.test(text(b.analytical_fingerprint))&&/^[a-f0-9]{64}$/.test(text(b.presentation_hash));
  const sent=binding&&row.sent===true&&row.status==='SENT'&&id(row.message_id)!==null&&b.network_result==='CONFIRMED_SENT'&&b.dispatch_finalized===true&&b.finalization_status==='SENT'&&b.dispatch_state==='SENT';
  const t=b.task_at_delivery;
  const task=sent&&t&&['PENDING','CLAIMED'].includes(t.state)&&t.run_id===b.run_id&&t.snapshot_id===b.snapshot_id&&t.due_ts===a?.trigger?.next_recheck_ts&&t.expires_ts===a?.trigger?.expires_ts;
  cases.push({publication_id:text(b.publication_id),contract:text(b.contract),direction:text(b.direction),wave_id:text(b.wave_id),lifecycle_event:text(b.lifecycle_event),run_id:text(b.run_id),snapshot_id:text(b.snapshot_id),observed_ts:b.observed_ts??null,analytical_fingerprint:text(b.analytical_fingerprint),presentation_hash:text(b.presentation_hash),same_run_binding_verified:Boolean(binding),exact_SENT:Boolean(sent),telegram_message_id:sent?id(row.message_id):null,dispatch_finalized:b.dispatch_finalized===true,task_at_delivery:task?{state:t.state,run_id:t.run_id,snapshot_id:t.snapshot_id,due_ts:t.due_ts,expires_ts:t.expires_ts}:null,task_at_delivery_verified:Boolean(task),task_state_after_delivery_known:false,actual_ENTRY:Boolean(sent&&b.lifecycle_event==='ENTRY'&&a?.state==='ENTRY_NOW_ANALYTICAL'),reason:sent?'EXACT_CURRENT_RUN_NETWORK_ACK_AND_DISPATCH_WRITE_CONFIRMED':binding?'DELIVERY_NOT_CONFIRMED':'NOT_THIS_CANONICAL_RUN'});
 }
 return {schema:'SAME_RUN_DELIVERY_PROOF_V1',head:text(output?.head),generation:text(output?.generation),run_id:text(output?.run_id),source:text(output?.source),recorded_at,status:cases.some(c=>c.exact_SENT)?'EXACT_SAME_RUN_SENT_CAPTURED':'NO_EXACT_SAME_RUN_SENT_CAPTURED',delivery_status:text(delivery?.status),cases,sourceHTTP_added:0,D1_added:0,Telegram_added:0,task_writes_added:0,original_clocks_refreshed:false,project_complete:false};
}
export function verifySameRunDeliveryProof({output,proof,expected_head}={}){
 if(proof?.schema!=='SAME_RUN_DELIVERY_PROOF_V1'||proof.head!==expected_head||output?.head!==expected_head||proof.run_id!==output?.run_id||proof.generation!==output?.generation||!Array.isArray(proof.cases)||proof.cases.length>2)throw Error('EXACT_ARTIFACT_RUN_BINDING_REQUIRED');
 let exact=0,entry=0;
 for(const p of proof.cases){
  if(p.exact_SENT!==true)continue;
  const c=output.candidates?.find(c=>c.publication_id===p.publication_id),a=c?.canonical;
  if(!c||p.same_run_binding_verified!==true||p.dispatch_finalized!==true||!id(p.telegram_message_id)||c.run_id!==proof.run_id||c.run_id!==p.run_id||c.snapshot_id!==p.snapshot_id||a?.snapshot_id!==p.snapshot_id||a?.run_id!==p.run_id||c.contract!==p.contract||c.direction!==p.direction||c.wave_id!==p.wave_id||c.lifecycle_event!==p.lifecycle_event||c.observed_ts!==p.observed_ts||a?.analytical_fingerprint!==p.analytical_fingerprint||!/^[a-f0-9]{64}$/.test(p.presentation_hash)||output.status!=='CLOSED')throw Error('CLAIMED_SENT_NOT_BOUND_TO_EXACT_CANONICAL');
  if(p.actual_ENTRY===true&&!(p.lifecycle_event==='ENTRY'&&a.state==='ENTRY_NOW_ANALYTICAL'))throw Error('ENTRY_NOT_CONFIRMED');
  exact++;if(p.actual_ENTRY===true)entry++;
 }
 if(new Set(proof.cases.map(c=>c.publication_id)).size!==proof.cases.length)throw Error('DUPLICATE_DELIVERY_PROOF');
 return {schema:'AUTOMATIC_DELIVERY_ARTIFACT_AUDIT_V1',head:proof.head,run_id:proof.run_id,status:exact?'EXACT_SAME_RUN_SENT_ARTIFACT_VERIFIED':'NO_EXACT_SAME_RUN_SENT',exact_SENT:exact,actual_ENTRY:entry,task_state_after_delivery_known:false,sourceHTTP:0,D1:0,Telegram:0,project_complete:false};
}
