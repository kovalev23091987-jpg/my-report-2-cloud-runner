// ONE new affected N10 group, PREPARED_UNEXECUTED. No accepted case replay.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
export async function runBingxN10ObjectCandleBindingCase({repo_root,expected_closure_sha256,save_result,binding_path='anomaly-research/bingx-n10-candles-20261024/import-closure.json'}={}){
 const partial={schema:'BINGX_N10_OBJECT_CANDLE_PARTIAL_V1',completed:[],returned:[],provider_HTTP:0,native_SQL:0,CF:0,MAIN:0,Telegram:0};
 const save=async(name,result)=>{const frame={name,result:structuredClone(result)};partial.returned.push(frame);await save_result(frame);return result;};
 const check=async(name,fn,verify)=>{let r;try{r=await fn();}catch(error){r={threw:true,error:String(error.message)};}await save(name,r);verify(r);partial.completed.push(name);return r;};
 try{
  if(typeof save_result!=='function'||!/^[a-f0-9]{64}$/.test(String(expected_closure_sha256)))throw Error('ROOT_EXTERNAL_PIN_AND_WRITER_REQUIRED');
  const root=resolve(repo_root),file=resolve(root,binding_path);assert.ok(file.startsWith(root+'/'));
  const raw=await readFile(file);await save('EXTERNAL_CLOSURE',{bytes:raw.length,sha256:sha(raw),expected:expected_closure_sha256});assert.equal(sha(raw),expected_closure_sha256);
  const closure=JSON.parse(raw);assert.equal(closure.schema,'BINGX_N10_OBJECT_CANDLE_IMPORT_CLOSURE_V1');
  const attest=async stage=>{const xs=[];for(const x of closure.files){const p=resolve(root,x.path);assert.ok(p.startsWith(root+'/'));const b=await readFile(p);xs.push({...x,observed_bytes:b.length,observed_sha256:sha(b)});}await save(stage,xs);for(const x of xs){assert.equal(x.bytes,x.observed_bytes,x.path);assert.equal(x.sha256,x.observed_sha256,x.path);}return xs;};
  const pathFor=role=>{const a=closure.files.filter(x=>x.role===role);assert.equal(a.length,1,role);return join(root,a[0].path);};
  await attest('BEFORE_FIRST_APPLICATION_IMPORT');
  const batch=await import(pathToFileURL(pathFor('market_snapshot_batch')).href),source=await import(pathToFileURL(pathFor('source_candles')).href);
  const technicalText=await readFile(pathFor('technical_consumer_text'),'utf8'),workerText=await readFile(pathFor('worker_N10_caller_text'),'utf8');
  const start=technicalText.indexOf('export function buildHtxPrimaryTechnicalReceipt(');assert.ok(start>=0);const original=technicalText.slice(start);
  assert.ok(technicalText.includes('captured=new Map(),TTL=180000;'));
  await save('ACTUAL_N10_FUNCTION_BODY',{bytes:Buffer.byteLength(original),sha256:sha(original),whole_module_imported:false,TTL:180000});
  const technical=new Function('createHash','normalizeBingxCandles','resolveBingxExpectedHistoryRef','TTL',original.replace('export function buildHtxPrimaryTechnicalReceipt','function buildHtxPrimaryTechnicalReceipt')+';return buildHtxPrimaryTechnicalReceipt;')(createHash,source.normalizeBingxCandles,batch.resolveBingxExpectedHistoryRef,180000);
  const I={schema:'BINGX_CRYPTO_PERPETUAL_INSTRUMENT_V1',venue:'BINGX',market:'FUTURES',product:'PERPETUAL',family:'USDT_M',contract:'BTC-USDT',native_symbol:'BTC-USDT',native_contract_id:'CONTROLLED100',base:'BTC',quote:'USDT',settle:'USDT',margin:'USDT',linear_inverse:'LINEAR',quantity_unit:null,contract_size_decimal:null,contract_size_unit:null,price_unit:'QUOTE_PER_NATIVE_BASE',identity_revision:'CONTROLLED_N10_V1',crypto_eligibility:'VERIFIED_CRYPTO_PERPETUAL',underlying_class:'CRYPTO_ASSET',crypto_eligibility_proof_ref:'CONTROLLED_NOT_NATIVE',catalog_payload_sha256:'a'.repeat(64),token_multiplier_decimal:null,asset_binding:{status:'VENUE_SCOPED',canonical_asset_id:null,chain_id:null,token_address:null,token_epoch:null,proof_ref:'CONTROLLED_NOT_NATIVE'}};
  const makeContext=i=>{
   const registry={schema:'BINGX_HISTORY_REGISTRY_V1',venue:'BINGX',actor:'CONTROLLED_N10_RESEARCH',snapshot_schema:batch.SNAPSHOT_SCHEMA,row_schema:'BINGX_NATIVE_METRICS_ROW_V1',registry_revision:'CONTROLLED_N10_V1',instruments:[{instrument_identity:i,unit_revision:'CONTROLLED_PRICE_ONLY',metric_specs:{price:{unit:'QUOTE_PER_NATIVE_BASE',basis:'LAST'},oi:{unit:null,basis:'NATIVE_OPEN_INTEREST'},turnover_24h:{unit:null,basis:'PROVIDER_ROLLING_24H'},funding_rate:{unit:'RATE_PER_ACTUAL_PERIOD',basis:'NATIVE_FUNDING_RATE'}}}]};
   const registry_json=JSON.stringify(registry),context=batch.bindBingxHistoryRegistry({expected:{venue:'BINGX',actor:registry.actor,schema_version:batch.SNAPSHOT_SCHEMA,accepted_generations:['CONTROLLED_GENERATION']},current:{registry_json,expected_sha256:sha(registry_json),git_blob_locator:'CONTROLLED_NOT_NATIVE'},compatible:[]});
   return{context,ref:batch.resolveBingxExpectedHistoryRef({context,expected_identity:i})};
  };
  const bound=makeContext(I),E=1800000000000,received=E+2000,now=E+2100;
  const fixture=(count=6,interval='1m',step=60000)=>{
   const body={code:0,msg:'CONTROLLED',data:Array.from({length:count},(_,n)=>({time:E-(count-n)*step,open:'100',high:'102',low:'99',close:'101',volume:'10'}))},raw_json=JSON.stringify(body),hash=sha(raw_json);
   return{capture:{raw_json,receipt:{family:'USDT_M',endpoint:'/openApi/swap/v3/quote/klines',http_status:200,body_complete:true,usage_state:'KNOWN',received_ts:received,payload_sha256:hash,native_symbol:I.native_symbol}},expected:{venue:'BINGX',family:'USDT_M',instrument_ref:bound.ref,native_symbol:I.native_symbol,endpoint:'/openApi/swap/v3/quote/klines',payload_sha256:hash,received_ts:received,interval,window_start:E-count*step,window_end:E}};
  };
  const invoke=(input=fixture(),identity=I,context=bound.context,clock=now)=>technical({venue:'BINGX',contract:identity.native_symbol,now:clock,bingx:{context,expected_identity:identity,...input}});
  const partialOnly=r=>{assert.equal(r.check_completed,false);assert.deepEqual(r.evidence,[]);assert.equal(r.native_admission,false);assert.equal(r.score_allowed,false);assert.equal(r.entry_allowed,false);};
  await check('SIX_OBJECT_MINUTES_ARE_CANDIDATE_FACTS_ONLY',()=>invoke(),r=>{partialOnly(r);const a=r.receipts[0];assert.equal(a.native_grid_count,6);assert.equal(a.source_ts,null);assert.equal(a.first_known_ts,null);assert.equal(a.volume_unit,null);assert.equal(a.closed_ohlcv_qualified,false);assert.equal(a.continuous_80h_qualified,false);assert.equal(a.candidate_price_range.high,102);assert.equal(a.native_rows[0].native_time,E-360000);});
  await check('TWENTY_4H_CANDIDATES_DO_NOT_PROVE_CLOSED80H',()=>invoke(fixture(20,'4h',14400000)),r=>{partialOnly(r);const a=r.receipts[0];assert.equal(a.native_grid_count,20);assert.equal(a.candidate_price_range.candidate_window_end-a.candidate_price_range.candidate_window_start,80*3600000);assert.equal(a.twenty_closed_bar_context,false);assert.equal(a.continuous_80h_qualified,false);});
  await check('SIX_MINUTE_GRID_CANNOT_REPLACE_FOUR_HOUR_BARS',()=>{const x=fixture();x.expected.interval='4h';return invoke(x);},r=>{partialOnly(r);assert.equal(r.receipts[0].candidate_price_range,undefined);});
  await check('INDEPENDENT_RAW_BODY_PIN_REQUIRED',()=>{const x=fixture();x.capture.raw_json+=' ';return invoke(x);},r=>{partialOnly(r);assert.deepEqual(r.receipts[0].failures,['ORIGINAL_CANDLE_BYTES_PIN_MISMATCH']);});
  await check('USDC_EXCLUDED_EVEN_WITH_CLASSIFIED_PRIVATE_CONTEXT',()=>{const i={...clone(I),contract:'BTC-USDC',native_symbol:'BTC-USDC',quote:'USDC',settle:'USDC',margin:'USDC'},b=makeContext(i);return invoke(fixture(),i,b.context);},r=>{partialOnly(r);assert.deepEqual(r.receipts[0].failures,['USDT_MARGIN_CRYPTO_PERPETUAL_ONLY']);});
  await check('COIN_M_EXCLUDED_EVEN_WITH_CLASSIFIED_PRIVATE_CONTEXT',()=>{const i={...clone(I),contract:'BTC-USD',native_symbol:'BTC-USD',family:'COIN_M',quote:'USD',settle:'BTC',margin:'BTC',native_contract_id:null,linear_inverse:'INVERSE'},b=makeContext(i);return invoke(fixture(),i,b.context);},r=>{partialOnly(r);assert.deepEqual(r.receipts[0].failures,['USDT_MARGIN_CRYPTO_PERPETUAL_ONLY']);});
  await check('UNKNOWN_CLASSIFICATION_IS_NOT_TICKER_ADMISSION',()=>invoke(fixture(),{...clone(I),crypto_eligibility:'UNKNOWN',underlying_class:'UNKNOWN'}),r=>{partialOnly(r);assert.equal(r.receipts[0].candidate_price_range,undefined);});
  await check('CALLER_CLOSED_AND_VOLUME_FLAGS_CANNOT_UPLIFT',()=>{const x=fixture(),b=JSON.parse(x.capture.raw_json);b.closed_ohlcv_qualified=true;b.volume_unit='USDT';b.native_time_semantics='OPEN_TIME_QUALIFIED';x.capture.raw_json=JSON.stringify(b);const hash=sha(x.capture.raw_json);x.capture.receipt.payload_sha256=hash;Object.assign(x.expected,{payload_sha256:hash,closed_ohlcv_qualified:true,native_time_semantics:'OPEN_TIME_QUALIFIED',volume_unit:'USDT'});return invoke(x);},r=>{partialOnly(r);const a=r.receipts[0];assert.equal(a.closed_ohlcv_qualified,false);assert.equal(a.volume_unit,null);assert.equal(a.first_known_ts,null);});
  await check('DUPLICATE_NATIVE_TIME_REFUSES_CANDIDATE',()=>{const x=fixture(),b=JSON.parse(x.capture.raw_json);b.data[1].time=b.data[0].time;x.capture.raw_json=JSON.stringify(b);const hash=sha(x.capture.raw_json);x.capture.receipt.payload_sha256=hash;x.expected.payload_sha256=hash;return invoke(x);},r=>{partialOnly(r);assert.deepEqual(r.receipts[0].failures,['DUPLICATE_CANDLE_TIME']);});
  const callerStart=workerText.indexOf('// BINGX_N10_BOUND_CANDLE_INPUT_START'),callerEnd=workerText.indexOf('// BINGX_N10_BOUND_CANDLE_INPUT_END',callerStart);assert.ok(callerStart>=0&&callerEnd>callerStart);const caller=workerText.slice(callerStart,callerEnd);
  await save('ACTUAL_WORKER_N10_CALLER_BODY',{bytes:Buffer.byteLength(caller),sha256:sha(caller),whole_Worker_imported:false});
  const call=new Function('env','contract','source','decisionTs','context','expectedIdentity','instrumentRef','buildHtxPrimaryTechnicalReceipt',caller+';return primaryTechnicalReceipt;');
  await check('ACTUAL_EARLY_DEEP_N10_CALLER_USES_ROOT_MAPS_ONLY',async()=>{
   const x=fixture(),env={REPORT2_BINGX_N10_CAPTURE_BY_REF:new Map([[bound.ref,x.capture]]),REPORT2_BINGX_N10_EXPECTED_BY_REF:new Map([[bound.ref,x.expected]])};
   const result=call(env,I.native_symbol,{data:{venue:'BINGX'}},now,bound.context,clone(I),bound.ref,technical);await save('ACTUAL_N10_CALLER_WITH_INTERNAL_CAPTURE_RETURN',result);
   const absent=call({params:{bingx:x}},I.native_symbol,{data:{venue:'BINGX'}},now,bound.context,clone(I),bound.ref,technical);await save('ACTUAL_N10_CALLER_WITHOUT_INTERNAL_CAPTURE_RETURN',absent);
   const delayed=invoke(x,I,bound.context,now+3600000);await save('DELAYED_CAPTURE_ORIGINAL_CLOCKS_RETURN',delayed);
   return{result,absent,delayed};
  },r=>{partialOnly(r.result);assert.equal(r.result.receipts[0].native_grid_count,6);partialOnly(r.absent);assert.deepEqual(r.absent.receipts[0].failures,['ROOT_INDEPENDENT_CANDLE_CAPTURE_AND_PIN_REQUIRED']);partialOnly(r.delayed);assert.equal(r.delayed.receipts[0].received_ts,received);assert.equal(r.delayed.receipts[0].research_backfill,true);assert.equal(r.delayed.receipts[0].first_known_ts,null);});
  await attest('AFTER_AFFECTED_N10_GROUP');
  const result={schema:'BINGX_N10_OBJECT_CANDLE_CONTROLLED_V1',status:'CONTROLLED_AFFECTED_CASE_RETURNED',completed:partial.completed,groups:1,source_fixture:'CONTROLLED_OBJECT_CANDLES_NOT_CAPTURE_OR_OPEN_TIME_PROOF',whole_technical_module_imported:false,whole_Worker_imported:false,provider_HTTP:0,native_SQL:0,CF:0,MAIN:0,Telegram:0,N10_closed_or_score_or_entry_qualified:false};await save('FINAL_RETURN',result);return result;
 }catch(error){partial.error=String(error?.stack??error);if(typeof save_result==='function')await save_result({name:'PARTIAL_ON_THROW',result:structuredClone(partial)});throw error;}
}
