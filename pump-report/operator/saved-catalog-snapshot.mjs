import {createHash} from 'node:crypto';
import {CATALOG_SNAPSHOT_KEY,CATALOG_SNAPSHOT_BOUNDS,CATALOG_SNAPSHOT_SERIALIZATION} from '../runtime/catalog-snapshot.mjs';
const sha=text=>createHash('sha256').update(text).digest('hex');
const time=n=>Number.isSafeInteger(n)&&n>0;

// Exactly one admitted PK read. Raw metadata remains in the private envelope.
export async function readSavedCatalogSnapshot({store,implementation_sha256,clock=Date.now}){
  if(typeof store?.get!=='function'||typeof clock!=='function'||!/^[a-f0-9]{64}$/.test(implementation_sha256??''))throw Error('EXACT_CATALOG_OBSERVATION_CONTEXT_REQUIRED');
  const snapshot=await store.get(CATALOG_SNAPSHOT_KEY),at=clock();
  const result={schema:'PUMP_SAVED_CATALOG_SNAPSHOT_OBSERVATION_V1',status:'NO_SAVED_CATALOG_SNAPSHOT',observed_ts:at,
    scope:{maximum_snapshots:1,native_PK_reads:1,current_global_crypto_N_proven:false,CORE_qualification:false},
    native_source_response_bound:false,provider_HTTP:0,Telegram:0,private_evidence:{snapshot}};
  if(!snapshot)return result;
  let serialized;try{serialized=JSON.stringify(snapshot.body);}catch{result.status='SAVED_CATALOG_NOT_JSON';return result;}
  const rows=snapshot.body?.data,bytes=new TextEncoder().encode(serialized??'').byteLength;
  const bound=Boolean(snapshot.schema==='PUMP_RETAINED_CATALOG_SNAPSHOT_V1'&&snapshot.provider==='BINGX'&&snapshot.family==='USDT_M'&&
    new TextEncoder().encode(JSON.stringify(snapshot)).byteLength<=CATALOG_SNAPSHOT_BOUNDS.record_utf8_bytes&&
    snapshot.route==='/openApi/swap/v2/quote/contracts'&&snapshot.serialization_basis===CATALOG_SNAPSHOT_SERIALIZATION&&snapshot.source_event_ts===null&&
    String(snapshot.body?.code)==='0'&&Array.isArray(rows)&&rows.length>0&&rows.length<=CATALOG_SNAPSHOT_BOUNDS.rows&&snapshot.row_count===rows.length&&
    bytes<=CATALOG_SNAPSHOT_BOUNDS.body_utf8_bytes&&bytes===snapshot.body_utf8_bytes&&snapshot.body_sha256===sha(serialized)&&
    typeof snapshot.receipt_id==='string'&&/^[A-Za-z0-9:._-]{1,160}$/.test(snapshot.receipt_id)&&time(snapshot.received_ts)&&time(snapshot.saved_ts)&&
    snapshot.received_ts<=snapshot.saved_ts&&snapshot.saved_ts<=at);
  result.snapshot_bytes_clocks_bound=bound;
  if(!bound){result.status='SAVED_CATALOG_BINDING_MISMATCH';return result;}
  result.row_count=rows.length;result.received_ts=snapshot.received_ts;result.received_age_ms=at-snapshot.received_ts;
  result.body_sha256=snapshot.body_sha256;
  result.implementation_bound=snapshot.implementation_sha256===implementation_sha256;
  result.native_source_response_bound=result.implementation_bound&&snapshot.evidence_class==='OBSERVED';
  result.status=!result.implementation_bound?'CATALOG_OTHER_IMPLEMENTATION_NOT_CURRENT_PROOF':snapshot.evidence_class!=='OBSERVED'?
    'BOUND_CATALOG_NON_OBSERVED_NOT_NATIVE':'BOUND_SAVED_NATIVE_CATALOG_AT_ORIGINAL_RECEIPT';
  return result;
}
