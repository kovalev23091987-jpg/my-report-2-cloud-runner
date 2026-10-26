import {textHash} from './text-hash.mjs';

export const CATALOG_SNAPSHOT_KEY='pump:catalog:last-observed:v1';
// D1 rows/strings are limited to 2,000,000 bytes; leave room for key/row data.
export const CATALOG_SNAPSHOT_BOUNDS=Object.freeze({rows:2000,body_utf8_bytes:2097152,record_utf8_bytes:1900000});
export const CATALOG_SNAPSHOT_SERIALIZATION='BROKER_PARSED_JSON_STRINGIFY_UTF8_NOT_WIRE_BYTES';
const time=n=>Number.isSafeInteger(n)&&n>0;

// One current ingress record; no history, eviction, extra provider request or
// classification. The existing D1Store admission protects this write/readback.
export function createCatalogSnapshotWriter({store,implementation_sha256,evidence_class='UNCLASSIFIED',clock=Date.now}){
  if(typeof store?.set!=='function'||typeof store?.get!=='function'||typeof clock!=='function'||
    !/^[a-f0-9]{64}$/.test(implementation_sha256??'')||!['OBSERVED','ARTIFICIAL','UNCLASSIFIED'].includes(evidence_class))throw Error('CATALOG_SNAPSHOT_CONTEXT_REQUIRED');
  return async input=>{
    const skip=reason=>({status:'SKIPPED',reason,provider_HTTP:0,native_store_calls:0});
    if(input?.schema!=='PUMP_CATALOG_INGRESS_V1'||input.provider!=='BINGX'||input.family!=='USDT_M'||input.route!=='/openApi/swap/v2/quote/contracts'||
      !time(input.received_ts)||input.received_ts>clock()||typeof input.receipt_id!=='string'||!/^[A-Za-z0-9:._-]{1,160}$/.test(input.receipt_id)||
      !input.body||String(input.body.code)!=='0'||!Array.isArray(input.body.data))return skip('CATALOG_INGRESS_UNBOUND');
    if(!input.body.data.length||input.body.data.length>CATALOG_SNAPSHOT_BOUNDS.rows)return skip('CATALOG_ROW_BOUND');
    let serialized;try{serialized=JSON.stringify(input.body);}catch{return skip('CATALOG_NOT_JSON');}
    const body_utf8_bytes=new TextEncoder().encode(serialized).byteLength;
    if(body_utf8_bytes>CATALOG_SNAPSHOT_BOUNDS.body_utf8_bytes)return skip('CATALOG_BYTE_BOUND');
    const body=JSON.parse(serialized),body_sha256=await textHash(serialized),saved_ts=clock();
    if(!time(saved_ts)||saved_ts<input.received_ts)return skip('CATALOG_CLOCK_UNBOUND');
    const record={schema:'PUMP_RETAINED_CATALOG_SNAPSHOT_V1',provider:'BINGX',family:'USDT_M',route:input.route,
      received_ts:input.received_ts,source_event_ts:null,saved_ts,receipt_id:input.receipt_id,
      implementation_sha256,evidence_class,serialization_basis:CATALOG_SNAPSHOT_SERIALIZATION,
      row_count:body.data.length,body_utf8_bytes,body_sha256,body};
    if(new TextEncoder().encode(JSON.stringify(record)).byteLength>CATALOG_SNAPSHOT_BOUNDS.record_utf8_bytes)return skip('CATALOG_RECORD_BYTE_BOUND');
    await store.set(CATALOG_SNAPSHOT_KEY,record);
    const saved=await store.get(CATALOG_SNAPSHOT_KEY);
    if(JSON.stringify(saved)!==JSON.stringify(record))throw Object.assign(Error('CATALOG_SNAPSHOT_READBACK_MISMATCH'),{code:'CATALOG_SNAPSHOT_READBACK_MISMATCH'});
    return {status:'RETAINED',state_key:CATALOG_SNAPSHOT_KEY,received_ts:record.received_ts,row_count:record.row_count,
      body_sha256,provider_HTTP:0,native_store_calls:2,identity_or_CORE_qualification:false};
  };
}
