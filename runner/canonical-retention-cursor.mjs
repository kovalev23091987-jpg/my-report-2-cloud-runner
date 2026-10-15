import {patchPhaseRoot} from './github-bounded-phase-lease.mjs';
const PHASE='checkpoints/CLOUD_PHASE_STATE_20261004.json',FENCE='audit-fixes/source-optimization-20260930/execution-lock.json',DB='057a2847-2cc4-4e52-8534-1be1596d21d5';
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export function selectCanonicalRetentionCursor(input='auto',state=null){
 if(state!==null&&(state.schema!=='PROTECTED_CANONICAL_CURSOR_V1'||state.database_id!==DB||!integer(state.cursor)))throw Error('EXACT_DURABLE_CANONICAL_CURSOR_REQUIRED');
 const previous=state?.cursor??0;
 if(input==='auto')return{cursor:previous,previous_cursor:previous,explicit_override:false};
 if(!/^(0|[1-9][0-9]*)$/.test(String(input))||!integer(Number(input)))throw Error('EXACT_CANONICAL_CURSOR_REQUIRED');
 return{cursor:Number(input),previous_cursor:previous,explicit_override:Number(input)!==previous};
}
// This is technical continuation metadata, never a D1/source reservation.
// A failed/unknown/partial run cannot advance the scan; a manual override does
// not replace the automatic position. The next full pass wraps to rowid zero.
export async function persistCanonicalRetentionCursor(control,{expected_main,owner,selection,outcome,run_id,now=Date.now()}={}){
 const next=outcome?.bounded_discovery?.next_cursor;
 if(selection?.explicit_override)return{status:'MANUAL_CURSOR_OVERRIDE_NOT_PROMOTED'};
 if(!integer(next)||outcome?.execute!==true||!['NO_ELIGIBLE_ROWS_IN_BOUNDED_WINDOW','PROTECTED_REJECTED_BODIES_COMPACTED_EXACTLY','NO_SAFE_CANONICAL_BODIES_CHANGED'].includes(outcome.status)||outcome.finalized_usage?.status!=='FINALIZED'||outcome.finalized_usage.unknown_ops!==0||outcome.D1?.unknown_ops!==0||!integer(outcome.D1.rows_read)||!integer(outcome.D1.rows_written)||outcome.D1.rows_read>5000||outcome.D1.rows_written>400)return{status:'CURSOR_NOT_ADVANCED_UNCLOSED_NATIVE_RESULT'};
 if(next===selection.previous_cursor)return{status:'CANONICAL_CURSOR_UNCHANGED',cursor:next};
 if(!/^\d+$/.test(String(run_id))||!integer(now)||!/^[a-f0-9]{40}$/.test(expected_main||''))throw Error('EXACT_CANONICAL_CURSOR_RECEIPT_REQUIRED');
 const head=(await control.call('git/ref/heads/main')).object.sha;if(head!==expected_main)throw Error('CANONICAL_CURSOR_MAIN_MOVED');
 const [p,f]=await Promise.all([control.read(PHASE,head),control.read(FENCE,head)]),l=p.value.lease;
 if(f.value.active||!l||l.owner!==owner||l.expires_ts<=now||p.value.latest_own_bounded_continuation_lease?.owner!==owner||p.value.active_working_state?.owned_lease!==owner)throw Error('CANONICAL_CURSOR_OWN_LEASE_REQUIRED');
 if(selectCanonicalRetentionCursor('auto',p.value.active_working_state?.canonical_retention_cursor??null).cursor!==selection.previous_cursor)throw Error('CANONICAL_CURSOR_CHANGED_KEEP_NEWER');
 const state={schema:'PROTECTED_CANONICAL_CURSOR_V1',database_id:DB,cursor:next,source_cursor:selection.cursor,run_id:String(run_id),source_head:head,updated_ts:now,status:outcome.status};
 const raw=patchPhaseRoot(p.raw,{active_working_state:{...p.value.active_working_state,canonical_retention_cursor:state}});
 const written=await control.call('contents/'+PHASE,'PUT',{branch:'main',sha:p.sha,message:'chore: retain exact canonical scan cursor '+run_id,content:Buffer.from(raw).toString('base64')});
 const back=await control.read(PHASE,written.commit.sha);if(back.raw!==raw)throw Error('CANONICAL_CURSOR_CAS_READBACK_REQUIRED');
 return{status:'CANONICAL_CURSOR_EXACT_PHASE_CAS_VERIFIED',head:written.commit.sha,cursor:next,source_cursor:selection.cursor,SQL:0,sourceHTTP:0,quotas_reset:false};
}
