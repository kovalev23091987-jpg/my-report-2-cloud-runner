// Proposed bounded domain operation, not installed or invoked by production.
import {createHash} from 'node:crypto';
const need=(v,m)=>{if(!v)throw Error(m);},hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),clock=v=>Number.isSafeInteger(v)&&v>0;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
export const DOMAIN_BOUNDS=Object.freeze({card:32768,descriptor:2048,plan:8192,state:65536,request:131072,outbox:32,revisions:32,due_limit:128});
export function canonical(value){
 const seen=new Set();const walk=v=>{if(v===null||typeof v==='string'||typeof v==='boolean')return v;if(typeof v==='number'){need(Number.isFinite(v)&&!Object.is(v,-0),'LOSSLESS_JSON_REQUIRED');return v;}need(v&&typeof v==='object'&&!seen.has(v),'LOSSLESS_JSON_REQUIRED');seen.add(v);let out;if(Array.isArray(v))out=v.map(walk);else{need(object(v),'PLAIN_JSON_REQUIRED');out=Object.fromEntries(Object.keys(v).sort().map(k=>[k,walk(v[k])]));}seen.delete(v);return out;};return JSON.stringify(walk(value));
}
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
const bytes=s=>Buffer.byteLength(s,'utf8'),pack=(v,max)=>{const s=canonical(v);need(bytes(s)<=max,'DOMAIN_PAYLOAD_BOUND');return s;};
export function opaqueHtxDescriptor({metadata,contract,observed_ts,source_ref}={}){
 need(metadata?.status==='ok'&&Array.isArray(metadata.data)&&clock(metadata.ts)&&clock(observed_ts)&&metadata.ts<=observed_ts,'METADATA_CLOCK_OR_SHAPE');
 need(typeof contract==='string'&&/^[^\s]+-USDT$/.test(contract)&&typeof source_ref==='string'&&source_ref.length<=256,'EXACT_METADATA_ID_REQUIRED');
 const rows=metadata.data.filter(r=>r?.contract_code===contract);need(rows.length===1,'EXACT_METADATA_ROW_REQUIRED');const r=rows[0];
 need(r.symbol+'-USDT'===contract&&r.pair===contract&&r.business_type==='swap'&&r.contract_type==='swap'&&r.trade_partition==='USDT'&&r.contract_status===1,'EXACT_NATIVE_MARKET_REQUIRED');
 need(typeof r.create_date==='string'&&/^\d{8}$/.test(r.create_date)&&typeof r.contract_size==='number'&&Number.isFinite(r.contract_size)&&r.contract_size>0&&typeof r.price_tick==='number'&&Number.isFinite(r.price_tick)&&r.price_tick>0,'NATIVE_RECORD_FIELDS_REQUIRED');
 return {schema:'OPAQUE_HTX_NATIVE_LISTING_DATE_RECORD_V1',venue:'HTX',market:'LINEAR_SWAP',contract_code:contract,symbol:r.symbol,pair:r.pair,business_type:r.business_type,contract_type:r.contract_type,trade_partition:r.trade_partition,raw_native_listing_date:r.create_date,raw_contract_size:r.contract_size,raw_price_tick:r.price_tick,metadata_source_ts:metadata.ts,metadata_observed_ts:observed_ts,source_ref,parsed_metadata_row_sha256:digest(r),raw_body_sha256:null,listing_ts:null,instrument_epoch:null,native_epoch_qualified:false};
}
export function nativeRecordCompatibility(previous,current){
 if(!previous||!current)return 'LEGACY_NATIVE_RECORD_UNBOUND';
 const keys=['venue','market','contract_code','symbol','pair','business_type','contract_type','trade_partition','raw_native_listing_date'];
 if(keys.some(k=>previous[k]!==current[k]))return 'DIFFERENT_OPAQUE_NATIVE_RECORD';
 if(previous.raw_contract_size!==current.raw_contract_size)return 'MATERIAL_MULTIPLIER_CONFLICT';
 return 'SAME_OPAQUE_RECORD_NOT_QUALIFIED_EPOCH';
}
export function capturedClosedWindow({basis,timeframe,alignment_offset_ms,known_ts,source_ref}={}){
 const durations={'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000,'1w':604800000},d=durations[timeframe];
 need(basis?.schema==='CAPTURED_HTX_ANOMALY_BASIS_V1'&&d&&Number.isSafeInteger(alignment_offset_ms)&&alignment_offset_ms>=0&&alignment_offset_ms<d&&clock(known_ts)&&basis.material_available_ts<=known_ts,'CAPTURED_BASIS_REQUIRED');
 const receipt=basis.body_receipt,k=receipt?.body_knowledge,p=basis.minutes;
 need(receipt?.stage==='COMPLETED'&&k?.hash_status==='TEXT_HASH_RECORDED'&&hex(k.body_text_sha256)&&receipt.captured_payload_sha256===digest(JSON.stringify(p))&&clock(k.body_completed_ts)&&k.body_completed_ts<=basis.minutes_observed_ts&&p.ts<=k.body_completed_ts&&basis.minutes_observed_ts<=known_ts,'EXACT_CAPTURE_COMPLETION_REQUIRED');
 const descriptor=opaqueHtxDescriptor({metadata:basis.metadata,contract:basis.contract,observed_ts:basis.metadata_observed_ts,source_ref});
 need(p?.status==='ok'&&p.ch===`market.${basis.contract}.kline.1min`&&Array.isArray(p.data)&&p.data.length<=2000,'EXACT_MINUTE_CHANNEL_REQUIRED');
 const by=new Map();for(const r of p.data){need(Number.isSafeInteger(r?.id)&&r.id>0&&!by.has(r.id*1000),'DUPLICATE_OR_INVALID_NATIVE_MINUTE');by.set(r.id*1000,r);}
 const end=Math.floor((p.ts-alignment_offset_ms)/d)*d+alignment_offset_ms,start=end-21*d;
 if(p.data.length<21*(d/60000))return{status:'INSUFFICIENT_CLOSED_BACKGROUND',descriptor,timeframe,required_minutes:21*(d/60000),available_minutes:p.data.length,native_admission_qualified:false};
 const number=v=>{need((typeof v==='number'||typeof v==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v))&&Number.isFinite(Number(v)),'RAW_NUMERIC_VALUE_REQUIRED');return Number(v);};
 const bars=[];for(let t=start;t<end;t+=d){const parts=[];for(let m=t;m<t+d;m+=60000){const r=by.get(m);if(!r)return{status:'GAPPED_CLOSED_BACKGROUND',descriptor,timeframe,gap_start_ts:m,native_admission_qualified:false};const b={open:number(r.open),high:number(r.high),low:number(r.low),close:number(r.close),volume:number(r.trade_turnover)};need([b.open,b.high,b.low,b.close].every(x=>x>0)&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high&&b.volume>=0,'NATIVE_OHLCV_GEOMETRY');parts.push(b);}bars.push({start_ts:t,end_ts:t+d,open:parts[0].open,high:Math.max(...parts.map(x=>x.high)),low:Math.min(...parts.map(x=>x.low)),close:parts.at(-1).close,volume:parts.reduce((sum,x)=>sum+x.volume,0)});}
 return{status:'CLOSED_WINDOW_RECORD_BOUND_NOT_NATIVE_QUALIFIED',descriptor,bars,timeframe,alignment_offset_ms,known_ts,source_as_of_ts:p.ts,received_ts:basis.minutes_observed_ts,body_completed_ts:k.body_completed_ts,body_text_sha256:k.body_text_sha256,hash_scope:k.hash_scope,volume_field:'trade_turnover',volume_interpretation:'EXISTING_TYPED_QUOTE_TURNOVER_NOT_TAKER_DIRECTION',instrument_epoch:null,event_first_knowledge_qualified:false,native_admission_qualified:false,provider_HTTP:0,SQL:0};
}
export function lockedOutcomePlan(card){
 const horizons=[3600000,14400000,43200000,86400000,259200000,604800000,2592000000,7776000000];
 return{schema:'ANOMALY_LOCKED_OUTCOME_PLAN_V1',anchor:'ORIGINAL_EVENT_END',cells:horizons.flatMap(horizon_ms=>['LONG','SHORT'].map(direction=>({key:`${direction}:${horizon_ms}`,direction,horizon_ms,target_ts:card.event_end_ts+horizon_ms})))};
}
export function opaqueLogicalEventKey(card,descriptor){
 need(card?.instrument?.contract===descriptor?.contract_code,'CARD_RECORD_MISMATCH');
 const keys=['venue','market','contract_code','symbol','pair','business_type','contract_type','trade_partition','raw_native_listing_date'];
 return 'OPAQUE_ANOM:'+digest({record:Object.fromEntries(keys.map(k=>[k,descriptor[k]])),timeframe:card.timeframe,start:card.event_start_ts,end:card.event_end_ts,family:'EFFORT_VS_RESULT'});
}
function validateParts({logical_event_id,card,descriptor,plan,state}){
 need(typeof logical_event_id==='string'&&logical_event_id.length>0&&logical_event_id.length<=160,'LOGICAL_EVENT_KEY_REQUIRED');
 need(object(card)&&clock(card.first_known_ts)&&clock(card.event_start_ts)&&clock(card.event_end_ts)&&card.event_start_ts<card.event_end_ts&&card.event_end_ts<=card.first_known_ts&&['15m','30m','1h','4h','1d','1w'].includes(card.timeframe),'IMMUTABLE_CARD_REQUIRED');
 need(hex(card.card_hash)&&digest(Object.fromEntries(Object.entries(card).filter(([k])=>k!=='card_hash')))===card.card_hash,'CARD_HASH_REQUIRED');
 need(card.instrument?.contract===descriptor?.contract_code&&descriptor?.schema==='OPAQUE_HTX_NATIVE_LISTING_DATE_RECORD_V1'&&descriptor.instrument_epoch===null&&descriptor.listing_ts===null&&descriptor.native_epoch_qualified===false,'OPAQUE_IDENTITY_SCOPE_REQUIRED');
 need(logical_event_id===opaqueLogicalEventKey(card,descriptor),'OPAQUE_EVENT_KEY_MISMATCH');
 need(clock(descriptor.metadata_source_ts)&&clock(descriptor.metadata_observed_ts)&&descriptor.metadata_source_ts<=descriptor.metadata_observed_ts&&descriptor.metadata_observed_ts<=card.first_known_ts&&hex(descriptor.parsed_metadata_row_sha256),'DESCRIPTOR_KNOWLEDGE_ORDER');
 need(object(plan)&&plan.schema==='ANOMALY_LOCKED_OUTCOME_PLAN_V1'&&Array.isArray(plan.cells)&&plan.cells.length>0&&plan.cells.length<=32&&new Set(plan.cells.map(x=>x.key)).size===plan.cells.length,'LOCKED_PLAN_REQUIRED');
 need(plan.cells.every(x=>typeof x.key==='string'&&x.key.length<=160&&['LONG','SHORT'].includes(x.direction)&&Number.isSafeInteger(x.horizon_ms)&&x.horizon_ms>0&&x.target_ts===card.event_end_ts+x.horizon_ms),'EX_ANTE_OUTCOME_PLAN_REQUIRED');
 need(plan.cells.some(x=>x.direction==='LONG')&&plan.cells.some(x=>x.direction==='SHORT')&&plan.cells.some(x=>x.horizon_ms>=90*86400000),'LONG_SHORT_LONG_HORIZON_PLAN_REQUIRED');
 need(object(state)&&clock(state.evaluated_ts)&&state.evaluated_ts>=card.first_known_ts&&object(state.watch)&&typeof state.watch.active==='boolean'&&(state.watch.next_check_ts===null||clock(state.watch.next_check_ts))&&object(state.last_snapshot)&&Number.isSafeInteger(state.last_snapshot.ts)&&state.last_snapshot.ts>=0&&state.last_snapshot.ts<=state.evaluated_ts,'WATCH_AND_CURSOR_REQUIRED');
 need(object(state.outbox)&&Object.keys(state.outbox).length<=DOMAIN_BOUNDS.outbox&&Array.isArray(state.revisions)&&state.revisions.length<=DOMAIN_BOUNDS.revisions,'BOUNDED_DOMAIN_STATE_REQUIRED');
 need(object(state.outcomes)&&Object.keys(state.outcomes).length===plan.cells.length&&plan.cells.every(c=>object(state.outcomes[c.key])&&state.outcomes[c.key].target_ts===c.target_ts&&['PENDING','CLOSED_FACTUAL','CENSORED_FINAL'].includes(state.outcomes[c.key].status)),'EXACT_PLANNED_OUTCOME_STATE_REQUIRED');
 need(!Object.values(state.outcomes).some(o=>o.status==='PENDING')||state.watch.next_check_ts!==null,'PENDING_OUTCOMES_REQUIRE_DUE_TIME');
 need(Object.values(state.outbox).every(x=>object(x)&&x.status==='DRAFT'&&x.form_status==='NOT_APPROVED'&&x.actual_send===false&&typeof x.message_ru==='string'&&x.message_ru.length<=1600&&typeof x.source_snapshot_id==='string'&&x.source_snapshot_id.length<=160),'DRAFT_ONLY_NO_SENDER');
 need(state.native_admission_qualified===false&&state.event_first_knowledge_qualified===false&&state.native_epoch_qualified===false,'NO_SYNTHETIC_QUALIFICATION');
}
export function prepareAnomalyCommit(input){
 validateParts(input);const {operation_id,expected_revision,logical_event_id,card,descriptor,plan,state}=input;
 need(typeof operation_id==='string'&&/^[A-Za-z0-9:._-]{1,160}$/.test(operation_id)&&Number.isSafeInteger(expected_revision)&&expected_revision>=0,'OPERATION_AND_REVISION_REQUIRED');
 const body={schema:'ANOMALY_DOMAIN_REQUEST_V1',operation_id,expected_revision,logical_event_id,first_known_ts:card.first_known_ts,card_json:pack(card,DOMAIN_BOUNDS.card),descriptor_json:pack(descriptor,DOMAIN_BOUNDS.descriptor),plan_json:pack(plan,DOMAIN_BOUNDS.plan),state_json:pack(state,DOMAIN_BOUNDS.state)};
 for(const name of ['card','descriptor','plan','state'])body[name+'_sha256']=digest(body[name+'_json']);
 const request={...body,request_sha256:digest(body)},text=pack(request,DOMAIN_BOUNDS.request);return Object.freeze({request,text,request_bytes:bytes(text)});
}
export const COMMIT_SQL='INSERT INTO report2_anomaly_commit_v1(request_json) VALUES (?1)';
export const READBACK_SQL=`SELECT o.operation_id,o.request_sha256,o.logical_event_id,o.expected_revision,o.applied_revision,o.card_sha256 AS receipt_card_sha256,o.first_known_ts AS receipt_first_known_ts,o.descriptor_sha256 AS receipt_descriptor_sha256,o.plan_sha256 AS receipt_plan_sha256,o.state_sha256 AS receipt_state_sha256,o.server_recorded_ts_floor_ms,b.* FROM report2_anomaly_operation_v1 o JOIN report2_anomaly_bundle_v1 b ON b.logical_event_id=o.logical_event_id WHERE o.operation_id=?1 LIMIT 1`;
export const DUE_SQL='SELECT logical_event_id,revision,next_check_ts,watch_active FROM report2_anomaly_bundle_v1 WHERE next_check_ts IS NOT NULL AND next_check_ts<=?1 ORDER BY next_check_ts,logical_event_id LIMIT ?2';
export function verifyAnomalyReadback(prepared,row){
 const p=prepared.request;need(p&&digest(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='request_sha256')))===p.request_sha256,'REQUEST_DIGEST_MISMATCH');
 if(!row)return {status:'ACK_NOT_OBSERVED',operation_id:p.operation_id,request_sha256:p.request_sha256,absence_is_not_no_commit:true};
 need(row.operation_id===p.operation_id&&row.request_sha256===p.request_sha256&&row.logical_event_id===p.logical_event_id&&row.expected_revision===p.expected_revision&&row.applied_revision===p.expected_revision+1,'DOMAIN_RECEIPT_BINDING_CONFLICT');
 for(const name of ['card','descriptor','plan'])need(row['receipt_'+name+'_sha256']===p[name+'_sha256']&&row[name+'_sha256']===p[name+'_sha256']&&digest(row[name+'_json'])===p[name+'_sha256'],'IMMUTABLE_READBACK_CONFLICT');
 need(row.receipt_first_known_ts===p.first_known_ts&&row.first_known_ts===p.first_known_ts&&row.receipt_state_sha256===p.state_sha256&&row.revision>=row.applied_revision&&digest(row.state_json)===row.state_sha256,'DOMAIN_READBACK_CONFLICT');
 if(row.revision===row.applied_revision)need(row.state_sha256===p.state_sha256&&row.last_operation_id===p.operation_id,'CURRENT_STATE_RECEIPT_CONFLICT');
 return {status:row.revision===row.applied_revision?'COMMITTED_RECEIPT_READBACK':'HISTORICAL_OPERATION_RECEIPT_READBACK',operation_id:p.operation_id,request_sha256:p.request_sha256,applied_revision:row.applied_revision,current_revision:row.revision,first_known_ts:row.first_known_ts,server_recorded_ts_floor_ms:row.server_recorded_ts_floor_ms,card_sha256:row.card_sha256,plan_sha256:row.plan_sha256,state_sha256:row.state_sha256,new_write_claimed:false,native_admission_qualified:false,event_first_knowledge_qualified:false,native_epoch_qualified:false,SENT_claimed:false};
}
const usage=db=>{need(typeof db?.usageSnapshot==='function','LIVE_D1_USAGE_REQUIRED');const u=db.usageSnapshot();need(['requests','rows_read','rows_written','unknown_ops'].every(k=>Number.isSafeInteger(u?.[k])&&u[k]>=0),'VALID_LIVE_D1_USAGE_REQUIRED');return u;};
async function admitted(db,admit,cost,phase,prepared){
 const u=usage(db);need(u.unknown_ops===0,'UNKNOWN_NATIVE_USAGE_BLOCKS_ADDITIONAL_SQL');need(typeof admit==='function'&&object(cost)&&Number.isSafeInteger(cost.rows_read)&&cost.rows_read>0&&Number.isSafeInteger(cost.rows_written)&&cost.rows_written>=(phase==='WRITE'?2:0),'EXPLICIT_COST_PROJECTION_REQUIRED');
 const wire=phase==='WRITE'?bytes(JSON.stringify({op:'run',sql:COMMIT_SQL,params:[prepared.text]})):phase==='READBACK'?bytes(JSON.stringify({op:'first',sql:READBACK_SQL,params:[prepared.request.operation_id],column:null})):prepared.remote_wire_bytes;
 const a=await admit({phase,rows_read:cost.rows_read,rows_written:cost.rows_written,current_usage:u,operation_id:prepared.request.operation_id,request_bytes:prepared.request_bytes,D1_bridge_wire_bytes:wire,requires_parent_downstream_reserve:true});need(a?.allowed===true,'LIVE_PARENT_ADMISSION_REQUIRED');need(canonical(usage(db))===canonical(u),'ADMISSION_USAGE_CHANGED');return u;
}
const within=(before,after,cost)=>after.unknown_ops===before.unknown_ops&&after.requests-before.requests===1&&['rows_read','rows_written'].every(k=>after[k]>=before[k])&&after.rows_read-before.rows_read<=cost.rows_read&&after.rows_written-before.rows_written<=cost.rows_written;
export async function readAnomalyCommit({db,prepared,admit,cost_bounds}={}){
 let before;try{before=await admitted(db,admit,cost_bounds?.read,'READBACK',prepared);}catch(error){return{status:'READBACK_NOT_ADMITTED',operation_id:prepared?.request?.operation_id,error:String(error),no_SQL_sent:true};}
 let row;try{row=await db.prepare(READBACK_SQL).bind(prepared.request.operation_id).first();}catch(error){return{status:'UNKNOWN_COMMIT_ACK',operation_id:prepared.request.operation_id,request_sha256:prepared.request.request_sha256,error:String(error),new_operation_id_allowed:false};}
 try{const checked=verifyAnomalyReadback(prepared,row),after=usage(db);return{...checked,cost_status:within(before,after,cost_bounds.read)?'WITHIN_CALLER_PROJECTION':'PROJECTION_EXCEEDED_OR_UNKNOWN',retained_readback:row};}catch(error){return{status:'READBACK_CONFLICT_OR_UNKNOWN_USAGE',operation_id:prepared.request.operation_id,error:String(error),retained_readback:row,new_operation_id_allowed:false};}
}
export async function commitAnomalyBundle({db,prepared,admit,cost_bounds}={}){
 let before;try{need(prepared?.text===canonical(prepared.request)&&bytes(prepared.text)<=DOMAIN_BOUNDS.request,'PREPARED_REQUEST_REQUIRED');const r=prepared.request;const rebuilt=prepareAnomalyCommit({logical_event_id:r.logical_event_id,operation_id:r.operation_id,expected_revision:r.expected_revision,card:JSON.parse(r.card_json),descriptor:JSON.parse(r.descriptor_json),plan:JSON.parse(r.plan_json),state:JSON.parse(r.state_json)});need(rebuilt.text===prepared.text,'PREPARED_REQUEST_REQUIRED');before=await admitted(db,admit,cost_bounds?.write,'WRITE',prepared);}catch(error){return{status:'COMMIT_NOT_ADMITTED',operation_id:prepared?.request?.operation_id,error:String(error),no_SQL_sent:true};}
 let writeReply;try{writeReply=await db.prepare(COMMIT_SQL).bind(prepared.text).run();}catch(error){return{status:'UNKNOWN_COMMIT_ACK',operation_id:prepared.request.operation_id,request_sha256:prepared.request.request_sha256,error:String(error),new_operation_id_allowed:false};}
 // INSTEAD OF trigger may report meta.changes=0; only exact receipt/readback qualifies a domain write.
 try{if(!within(before,usage(db),cost_bounds.write))return{status:'COMMIT_REPLY_RETAINED_RECONCILIATION_REQUIRED',operation_id:prepared.request.operation_id,request_sha256:prepared.request.request_sha256,write_reply:writeReply,new_operation_id_allowed:false};}catch(error){return{status:'COMMIT_REPLY_RETAINED_RECONCILIATION_REQUIRED',operation_id:prepared.request.operation_id,write_reply:writeReply,error:String(error),new_operation_id_allowed:false};}
 const read=await readAnomalyCommit({db,prepared,admit,cost_bounds});return{...read,write_reply:writeReply};
}
export async function readDueAnomalyBundles({db,now_ts,limit,logical_request_id,admit,cost_bounds}={}){
 let before;const scope={request:{operation_id:logical_request_id},request_bytes:0,remote_wire_bytes:bytes(JSON.stringify({op:'all',sql:DUE_SQL,params:[now_ts,limit]}))};
 try{need(clock(now_ts)&&Number.isSafeInteger(limit)&&limit>0&&limit<=DOMAIN_BOUNDS.due_limit&&typeof logical_request_id==='string'&&logical_request_id.length>0,'BOUNDED_DUE_QUERY_REQUIRED');before=await admitted(db,admit,cost_bounds?.due,'DUE',scope);}catch(error){return{status:'DUE_NOT_ADMITTED',error:String(error),no_SQL_sent:true};}
 let rows;try{rows=(await db.prepare(DUE_SQL).bind(now_ts,limit).all())?.results;need(Array.isArray(rows)&&rows.length<=limit,'DUE_RESULT_SHAPE');return{status:'DUE_BUNDLES_READ',rows,more_may_exist:rows.length===limit,cost_status:within(before,usage(db),cost_bounds.due)?'WITHIN_CALLER_PROJECTION':'PROJECTION_EXCEEDED_OR_UNKNOWN',native_admission_qualified:false};}catch(error){return{status:'DUE_READ_UNKNOWN_OR_FAILED',error:String(error),retained_rows:rows??null};}
}
