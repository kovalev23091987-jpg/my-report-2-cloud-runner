// ONE new narrow callable, prepared text only. Author: UNEXECUTED.
// It evaluates the exact private grouping helper and old draft expression;
// it does not call old observer/watch/DUE/outcome/journal test exports.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
export async function runGroupedWatchDraftCases({repo_root}={}){
  assert.equal(typeof repo_root,'string');const root=resolve(repo_root),prefix='anomaly-research/grouped-watch-draft-20261023';
  const b=JSON.parse(await readFile(join(root,prefix,'target-bindings.json'),'utf8')),target=await readFile(join(root,b.target),'utf8');
  assert.equal(Buffer.byteLength(target),b.after.bytes);assert.equal(sha(target),b.after.sha256);
  for(const [path,pin] of Object.entries(b.public_dependency_pins)){const bytes=await readFile(join(root,path));assert.equal(bytes.length,pin.bytes,path);assert.equal(sha(bytes),pin.sha256,path);}
  assert.equal(target.split(b.prelude.text).length,2);assert.equal(sha(b.prelude.text),b.prelude.sha256);
  assert.equal(target.split(b.new_actual_drafts_statement).length,2);assert.equal(target.includes(b.old_actual_drafts_statement),false);
  const start=target.indexOf(b.helper.start_marker),end=target.indexOf(b.helper.end_marker,start+1);
  assert(start>=0&&end>start&&target.lastIndexOf(b.helper.start_marker)===start);
  const helper=target.slice(start,end);assert.equal(Buffer.byteLength(helper),b.helper.bytes);assert.equal(sha(helper),b.helper.sha256);
  const oldBytes=await readFile(join(root,prefix,'old-actual-drafts-statement.txt'),'utf8');assert.equal(oldBytes,b.old_actual_drafts_statement);
  const observer=await import(pathToFileURL(join(root,'anomaly-research/observer/observer.mjs')).href),domain=await import(pathToFileURL(join(root,'current-generation/files/src/anomaly-native-domain.mjs')).href);
  // Same JS realm as the actual JSON validators: no foreign Object prototype.
  const group=Function('canonical','digest','hash','draftNotice','structuredClone',b.prelude.text+helper+'return groupClosedWatchDrafts;')(domain.canonical,domain.digest,observer.hash,observer.draftNotice,structuredClone);
  const old=Function('draftNotice','structuredClone','return function({observed,snapshot_id}){'+b.prelude.text+b.old_actual_drafts_statement+'return drafts;}')(observer.draftNotice,structuredClone);
  const results=[],canonical=domain.canonical,hash=observer.hash;
  function fixture(directions=['LONG','SHORT']){
    const end=1792750200000,source=end+900000,event_id='CONTROLLED_EVENT_GROUP_DRAFT',snapshot_id='CONTROLLED_SNAPSHOT_GROUP_DRAFT',raw='a'.repeat(64);
    const card={event_id,instrument:{contract:'AAVE-USDT'},timeframe:'15m',event_end_ts:end,first_known_ts:end+60000,discovery:'BACKFILLED',features:{volume_ratio:4},conditions:{timeframe:'15m'}};
    const origin={logical_event_id:'CONTROLLED_LOGICAL_EVENT',card,state:{outbox:{capture0:{status:'DRAFT',form_status:'NOT_APPROVED',actual_send:false,message_ru:'EXISTING_CAPTURE_UNCHANGED'}},outcomes:{original_pending:{status:'PENDING'}},watch:{active:true}}};
    const snapshot={source_ts:source,raw_sha256:raw},outbox={};
    directions.forEach((direction,index)=>{const t={event_id,transition:index+1,direction,from:'WAITING',to:direction==='LONG'?'CONFIRMED':'REFUTED',source_ts:source,observed_ts:source+60000,snapshot_id,raw_sha256:raw,closed_window:{timeframe:'15m',start_ts:end,end_ts:source},timeliness:'OBSERVED',entry_authorized:false};const id=hash(t);outbox[id]={transition:{...t,transition_id:id},status:'DRAFT',message_id:null,network_send_enabled:false};});
    return{origin,snapshot_id,snapshot,observed:{status:'OBSERVED',state:{cards:{[event_id]:card},outbox}},fingerprint:'b'.repeat(64)};
  }
  function replaceTransition(x,index,patch){const rows=Object.entries(x.observed.state.outbox),[oldId,o]=rows[index],{transition_id:ignored,...body}=o.transition,t={...body,...patch},id=hash(t);rows[index]=[id,{...o,transition:{...t,transition_id:id}}];x.observed.state.outbox=Object.fromEntries(rows);}
  function call(x){const before=canonical(x),out=group(x);assert.equal(canonical(x),before,'grouping may not mutate original card/watch/outcomes/retained outbox');for(const value of Object.values(out)){assert.equal(value.status,'DRAFT');assert.equal(value.form_status,'NOT_APPROVED');assert.equal(value.actual_send,false);assert.equal(value.source_snapshot_id,x.snapshot_id);assert(value.message_ru.length<=1600);}return out;}
  const run=(name,fn)=>{fn();results.push({name,status:'CONTROLLED_PASS'});};
  let oldPairCount=null,newPairCount=null;
  run('actual old expression emits two drafts; new private helper emits one with both original transitions',()=>{const x=fixture(),before=old(x),after=call(x);oldPairCount=Object.keys(before).length;newPairCount=Object.keys(after).length;assert.equal(oldPairCount,2);assert.equal(newPairCount,1);const [key,notice]=Object.entries(after)[0];assert(key.startsWith('watch-group:'));assert.equal(notice.group_schema,'CLOSED_WATCH_CHECK_DRAFT_GROUP_V1');assert.equal(notice.transition_group.length,2);assert.equal(new Set(notice.transition_ids).size,2);assert.equal(canonical(notice.transition_group),canonical(Object.values(x.observed.state.outbox).map(o=>o.transition)));assert(notice.message_ru.includes('подтверждён выход вверх; гипотеза движения вниз опровергнута'));assert.equal(notice.message_ru.split('Блок аномалий').length,2);assert.equal(notice.message_ru.split('Наблюдение, без разрешения входа.').length,2);});
  run('zero transitions create zero drafts',()=>{assert.equal(Object.keys(call(fixture([]))).length,0);});
  for(const direction of ['LONG','SHORT'])run('single '+direction+' retains exact old draft key, shape and renderer text',()=>{const x=fixture([direction]);assert.equal(canonical(call(x)),canonical(old(x)));});
  run('pair input order does not change group key, text or retained ordered facts',()=>{const x=fixture(),expected=call(x);x.observed.state.outbox=Object.fromEntries(Object.entries(x.observed.state.outbox).reverse());assert.equal(canonical(call(x)),canonical(expected));});
  run('another physical observation fingerprint is another group key',()=>{const x=fixture(),a=call(x);x.fingerprint='c'.repeat(64);const b=call(x);assert.notEqual(Object.keys(a)[0],Object.keys(b)[0]);});
  for(const [name,patch] of [['different event',{event_id:'OTHER_EVENT'}],['different snapshot',{snapshot_id:'OTHER_SNAPSHOT'}],['different source time',{source_ts:1792750200000}],['different response proof',{raw_sha256:'f'.repeat(64)}],['mixed closed window',{closed_window:{timeframe:'15m',start_ts:1,end_ts:2}}],['mixed observed clock',{observed_ts:1792750200000}],['mixed gap label',{timeliness:'GAPPED_CURRENT_CONFIRMATION'}],['duplicate direction',{direction:'LONG'}]])run(name+' refuses grouping rather than losing a transition',()=>{const x=fixture();replaceTransition(x,1,patch);assert.throws(()=>call(x));});
  run('modified transition without matching id is refused',()=>{const x=fixture(),o=Object.values(x.observed.state.outbox)[0];o.transition.to='REFUTED';assert.throws(()=>call(x));});
  run('more than two rows are refused without truncation',()=>{const x=fixture(),rows=Object.values(x.observed.state.outbox);x.observed.state.outbox.extra=structuredClone(rows[0]);assert.throws(()=>call(x),/BOUNDED_CURRENT_WATCH/);});
  run('gapped pair preserves current warning and both directions',()=>{const x=fixture();replaceTransition(x,0,{timeliness:'GAPPED_CURRENT_CONFIRMATION',gap_details_complete:false});replaceTransition(x,1,{timeliness:'GAPPED_CURRENT_CONFIRMATION',gap_details_complete:false});const notice=Object.values(call(x))[0];assert(notice.message_ru.includes('В наблюдении есть пропуски.'));assert.equal(notice.transition_group.every(t=>t.gap_details_complete===false),true);});
  run('inverse SHORT confirmation and LONG refutation remain one factual message',()=>{const x=fixture();replaceTransition(x,0,{to:'REFUTED'});replaceTransition(x,1,{to:'CONFIRMED'});const notice=Object.values(call(x))[0];assert(notice.message_ru.includes('гипотеза движения вверх опровергнута; подтверждён выход вниз'));assert.equal(notice.transition_group[0].direction,'LONG');});
  for(const [path,pin] of Object.entries(b.public_dependency_pins))assert.equal(sha(await readFile(join(root,path))),pin.sha256,path);
  assert.equal(sha(await readFile(join(root,b.target))),b.after.sha256);
  return{schema:'GROUPED_WATCH_DRAFT_CONTROLLED_RESULT_V1',group_count:1,variant_count:results.length,results,old_actual_draft_expression_count:oldPairCount,new_actual_helper_draft_count:newPairCount,scope:'PRIVATE_GROUP_HELPER_AND_BOUND_CALLSITE_NOT_FULL_DUE_EXECUTION',old_kernel_DUE_outcome_journal_tests_called:0,provider_HTTP:0,native_SQL:0,actual_send:false,SENT_claimed:false,native_admission_qualified:false,form_approval_qualified:false,author_execution:'UNEXECUTED'};
}
