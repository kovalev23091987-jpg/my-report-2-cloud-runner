import {createMaterializedSummaryV3,prepareOutcomeRecordEvent,prepareMaterializedRecordReceiptV3,foldPreparedOutcomeRecordV3,advanceWaveMaturityV3,acknowledgeMaterializedMaturityV3,readMaterializedSummaryV3} from '../analytics/materialized-summary.mjs';
import {textHash} from './text-hash.mjs';

const ID='pump-frozen-production-origins-v3',AGG='pump:materialized-summary:production-v3';
const DUE='pump:materialized-maturity:production-v3:due:',SCAN='pump:materialized-maturity:production-v3:scan';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),pad=n=>String(n).padStart(16,'0');
const waveKey=key=>'pump:materialized-wave:production-v3:'+key;
export function createMaterializedV3Store({store,clock=Date.now,resourcesAvailable=()=>true}){
  const empty=()=>({...createMaterializedSummaryV3({materialization_id:ID,as_of_ts:clock()}),excluded_records_by_purpose:{}});
  const aggregate=async()=>await store.get(AGG)??empty();
  async function immutable(key,value){
    await store.atomic(key,current=>{if(current&&!equal(current,value))throw Error('MATERIALIZED_V3_POINT_CELL_CONFLICT');return {state:current??value,result:true};});
    const back=await store.get(key);if(!equal(back,value))throw Error('MATERIALIZED_V3_POINT_READBACK_FAILED');return back;
  }
  async function recover(){
    const before=await aggregate(),intent=before.maturity_pending;if(!intent)return before;
    const key='pump:materialized-maturity:production-v3:current:'+await textHash(intent.wave_key);
    const reference={schema:'pump-materialized-maturity-reference-v3-20261025',materialization_id:ID,wave_key:intent.wave_key,wave_state_revision:intent.wave_state_revision,active:intent.active,deadline_ts:intent.deadline_ts,transition_id:intent.transition_id};
    await store.atomic(key,current=>{if(current&&(current.wave_state_revision>reference.wave_state_revision||current.wave_state_revision===reference.wave_state_revision&&!equal(current,reference)))throw Error('MATERIALIZED_V3_CURRENT_REFERENCE_CONFLICT');return {state:reference,result:true};});
    if(reference.active)await immutable(DUE+pad(reference.deadline_ts)+':'+await textHash(reference.wave_key)+':'+pad(reference.wave_state_revision),reference);
    const back=await store.get(key);if(!equal(back,reference))throw Error('MATERIALIZED_V3_QUEUE_REFERENCE_READBACK_FAILED');
    await store.atomic(AGG,current=>{
      if(!current?.maturity_pending)return {state:current,result:false};
      if(current.maturity_pending.transition_id!==intent.transition_id)throw Error('MATERIALIZED_V3_QUEUE_INTENT_CHANGED');
      const ack=acknowledgeMaterializedMaturityV3({aggregate:current,maturity_reference:back,as_of_ts:clock()});return {state:ack.aggregate,result:true};
    });return aggregate();
  }
  async function exclude(cursor,reason){
    await recover();return store.atomic(AGG,current=>{
      current??=empty();if(current.maturity_pending||current.source_cursor!==cursor)return {state:current,result:false};
      const excluded={...current.excluded_records_by_purpose};excluded[reason]=(excluded[reason]??0)+1;
      return {state:{...current,source_cursor:cursor+1,revision:current.revision+1,updated_ts:clock(),excluded_records_by_purpose:excluded},result:true};
    });
  }
  async function fold(row,source_seq,cursor){
    await recover();const event=await prepareOutcomeRecordEvent({kind:'OUTCOME_RECORD',event_id:row.record_id,record:row});
    const receipt=prepareMaterializedRecordReceiptV3({materialization_id:ID,prepared_event:event,source_seq});
    const record_receipt=await immutable('pump:materialized-record:production-v3:'+row.record_id.slice(-64),receipt);
    const o=row.origin,binding={schema:'pump-materialized-instrument-binding-v3-20261025',materialization_id:ID,instrument_id:o.instrument_id,asset_id:o.asset_id};
    const instrument_binding=await immutable('pump:materialized-instrument:production-v3:'+await textHash(o.instrument_id),binding);
    const applied=await store.atomicPair([waveKey(receipt.wave_key),AGG],([wave,current])=>{
      current??=empty();if(current.maturity_pending||current.source_cursor!==cursor)return {states:[wave,current],result:false};
      const folded=foldPreparedOutcomeRecordV3({aggregate:current,wave,prepared_event:event,source_seq,record_receipt,instrument_binding,as_of_ts:clock()});
      return {states:[folded.wave,folded.aggregate],result:folded.write_required};
    });await recover();return applied;
  }
  async function read({maturity_limit=5}={}){
    let current=await recover(),expected_revision=current.revision;
    const at=clock();let boundary=null;
    if(current.counters.pending_waves>0&&resourcesAvailable()){
      const saved=await store.get(SCAN);let after_key=saved?.aggregate_revision===expected_revision?saved.after_key:DUE,complete=false,processed=0,next_deadline=Infinity;
      const rows=await store.scanPrefix(DUE,{after_key,limit:40});
      for(const item of rows){
        const queued=item.value;
        if(queued?.schema!=='pump-materialized-maturity-reference-v3-20261025'||queued.materialization_id!==ID||queued.active!==true||!Number.isSafeInteger(queued.deadline_ts)||queued.deadline_ts<0||!Number.isSafeInteger(queued.wave_state_revision)||queued.wave_state_revision<0||item.key!==DUE+pad(queued.deadline_ts)+':'+await textHash(queued.wave_key)+':'+pad(queued.wave_state_revision))throw Error('MATERIALIZED_V3_ORDERED_QUEUE_CORRUPT');
        if(queued.deadline_ts>at){complete=true;next_deadline=queued.deadline_ts;break;}
        if(!resourcesAvailable())break;
        const ref=await store.get('pump:materialized-maturity:production-v3:current:'+await textHash(item.value.wave_key));
        if(ref?.schema!=='pump-materialized-maturity-reference-v3-20261025'||ref.materialization_id!==ID||ref.wave_key!==queued.wave_key)throw Error('MATERIALIZED_V3_CURRENT_REFERENCE_MISSING');
        if(ref?.active&&equal(ref,item.value)){
          if(processed>=maturity_limit)break;
          const changed=await store.atomicPair([waveKey(ref.wave_key),AGG],([wave,a])=>{
            if(a.maturity_pending||a.revision!==expected_revision||wave?.state_revision!==ref.wave_state_revision)return {states:[wave,a],result:false};
            const tick=advanceWaveMaturityV3({aggregate:a,wave,as_of_ts:clock(),maturity_reference:ref});return {states:[tick.wave,tick.aggregate],result:tick.write_required};
          });
          if(!changed)break;
          current=await recover();expected_revision=current.revision;processed++;
        }
        after_key=item.key;
      }
      if(rows.length<40&&(!rows.length||after_key===rows.at(-1).key))complete=true;
      const view_at=clock();complete=complete&&next_deadline>view_at;
      const snapshot={aggregate_revision:expected_revision,after_key,as_of_ts:view_at,complete};
      const committed=await store.atomicPair([AGG,SCAN],([a,scan])=>a?.revision===expected_revision&&!a.maturity_pending?{states:[a,snapshot],result:true}:{states:[a,scan],result:false});
      if(committed&&complete)boundary={materialization_id:ID,aggregate_revision:expected_revision,as_of_ts:view_at,complete:true,due_count:0,source_ref:SCAN+'#'+expected_revision+':'+view_at};
    }
    current=await aggregate();return {...readMaterializedSummaryV3(current,{as_of_ts:Math.max(boundary?.as_of_ts??at,current.updated_ts),maturity_boundary:boundary}),excluded_records_by_purpose:{...current.excluded_records_by_purpose}};
  }
  return {aggregate,recover,exclude,fold,read,aggregate_key:AGG};
}
