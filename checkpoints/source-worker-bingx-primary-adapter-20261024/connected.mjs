// AUTHOR PREPARED_UNEXECUTED. ROOT authenticates the entire packet before FIRST.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const PREFIX='checkpoints/source-worker-bingx-primary-adapter-20261024';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function runBingxPrimaryMarketAdapterConnected({repo_root,baseline_repo_root}={}){
  const result={schema:'BINGX_PRIMARY_MARKET_ADAPTER_ACTUAL_CONNECTED_RESULT_V1',author_status:'PREPARED_UNEXECUTED',
    evidence_kind:'CONTROLLED_OBJECT_RESPONSES_AND_ACTUAL_PROPOSED_MODULE_BODY_WITH_EXISTING_LEGACY_CONSUMER',
    completed_groups:[],completed_variants:[],invocation_frames:[],provider_HTTP_observed:0,native_qualification:false,
    scope_limits:['No live catalogue or count','No existing Worker execution','No candidate THIRD consumer bytes supplied','Legacy consumer test demonstrates explicit bridge requirement','No SQL, SQLite, persistence, budget admission, scores or native calls']};
  const originalFetch=globalThis.fetch;
  let importsStarted=false;
  try{
    if(!path.isAbsolute(repo_root??'')||!path.isAbsolute(baseline_repo_root??''))throw new Error('EXACT_ABSOLUTE_REPOSITORIES_REQUIRED');
    globalThis.fetch=()=>{result.provider_HTTP_observed++;throw new Error('NETWORK_FORBIDDEN_IN_CONTROLLED_CASE');};
    const dir=path.join(repo_root,PREFIX);
    const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
    for(const entry of manifest.files){
      if(!/^[a-zA-Z0-9_.-]+$/.test(entry.path))throw new Error('MANIFEST_PATH_NOT_LOCAL');
      const bytes=fs.readFileSync(path.join(dir,entry.path));
      assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);
    }
    const pins=JSON.parse(fs.readFileSync(path.join(dir,'input-pins.json'),'utf8'));
    for(const entry of pins.files){
      const bytes=fs.readFileSync(path.join(baseline_repo_root,entry.path));
      assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);
    }
    const source=fs.readFileSync(path.join(dir,'bingx-perpetual-market.mjs.txt'),'utf8');
    const legacySource=fs.readFileSync(path.join(baseline_repo_root,'current-generation/files/src/market-contracts.mjs'),'utf8');
    assert.equal(/(?:^|\n)\s*import\s/m.test(source),false);assert.equal(/(?:^|\n)\s*import\s/m.test(legacySource),false);
    importsStarted=true;
    const a=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const legacy=await import('data:text/javascript;base64,'+Buffer.from(legacySource).toString('base64'));
    result.actual_adapter_body_sha256=sha(Buffer.from(source));result.actual_legacy_consumer_sha256=sha(Buffer.from(legacySource));
    const T=1792855200000;
    function response(kind,f,s,body,received=T){
      const extra=kind==='candles'?{interval:'1m',limit:3}:kind==='funding_history'?{limit:3}:{};
      const d=a.buildBingxPublicRequest({family:f,kind,native_symbol:s,request_ts:T,...extra});
      return {endpoint:d.endpoint,family:f,native_symbol:s,http_status:200,body_complete:true,usage_state:'KNOWN',received_ts:received,payload_sha256:sha(Buffer.from(JSON.stringify(body)))};
    }
    const row={symbol:'BTC-USDT',contractId:'100',asset:'BTC',currency:'USDT',status:1,size:'0',launchTime:1586275200000};
    const binding={family:'USDT_M',native_symbol:'BTC-USDT',native_contract_id:'100',base:'BTC',quote:'USDT',settle:'USDT',margin:'USDT',crypto_eligibility:'VERIFIED_CRYPTO_PERPETUAL',underlying_class:'CRYPTO_ASSET',crypto_eligibility_proof_ref:'CONTROLLED_EXACT_CRYPTO_CLASSIFICATION',identity_revision:'CONTROLLED_IDENTITY_REV_1'};
    const catalog={code:0,msg:'',data:[row]};
    const cat=()=>a.normalizeBingxCatalog({family:'USDT_M',body:catalog,receipt:response('catalog','USDT_M',null,catalog),bindings:[binding]});
    const i=cat().identities[0];
    const coinRow={symbol:'BTC-USD',status:1,timeOnline:1710738000000,minTickSize:'100',minTradeValue:'100',minQty:'1.00000000'};
    const coinBody={code:0,msg:'',data:[coinRow]};
    const coinBinding={...binding,family:'COIN_M',native_symbol:'BTC-USD',native_contract_id:null,quote:'USD',settle:'BTC',margin:'BTC'};
    const ci=a.normalizeBingxCatalog({family:'COIN_M',body:coinBody,receipt:response('catalog','COIN_M',null,coinBody),bindings:[coinBinding]}).identities[0];
    async function variant(name,produce,verify){
      result.active_variant=name;
      const value=await produce();
      result.invocation_frames.push({variant:name,returned:value}); // Retain actual JSON BEFORE assertions/next consumer.
      await verify(value);
      result.completed_variants.push({name,status:'COMPLETED'});result.active_variant=null;
    }
    await variant('bulk_request_is_one_descriptor_no_fanout',()=>a.buildBingxPublicRequest({family:'USDT_M',kind:'ticker',request_ts:T}),x=>{assert.equal(x.scope,'BULK');assert.equal(x.max_http_attempts,1);assert.equal(x.provider_weight_units,null);assert.equal(x.retry,false);});
    await variant('oi_requires_exact_symbol',()=>{let reason;try{a.buildBingxPublicRequest({family:'USDT_M',kind:'oi',request_ts:T});}catch(e){reason=e.message;}return {reason,descriptor:a.buildBingxPublicRequest({family:'USDT_M',kind:'oi',native_symbol:i.native_symbol,request_ts:T})};},x=>{assert.equal(x.reason,'EXACT_NATIVE_SYMBOL_REQUIRED');assert.equal(x.descriptor.scope,'ONE_CONTRACT');});
    await variant('coin_m_not_forced_to_usdt_or_fake_funding_route',()=>{let reason;try{a.buildBingxPublicRequest({family:'COIN_M',kind:'funding_history',native_symbol:'BTC-USD',request_ts:T,limit:2});}catch(e){reason=e.message;}return {identity:ci,reason};},x=>{assert.equal(x.identity.quote,'USD');assert.equal(x.identity.native_contract_id,null);assert.equal(x.identity.settle,'BTC');assert.notEqual(x.identity.family,i.family);assert.notEqual(x.identity.native_symbol,i.native_symbol);assert.equal(x.reason,'UNDOCUMENTED_ROUTE');});
    await variant('catalog_identity_matches_exact_binding',cat,x=>{assert.equal(x.identities[0].native_contract_id,'100');assert.equal(x.identities[0].base,'BTC');assert.equal(x.actual_crypto_contract_count,null);assert.equal(x.identities[0].asset_binding.status,'VENUE_SCOPED');});
    await variant('unclassified_catalog_does_not_become_crypto_by_symbol',()=>a.normalizeBingxCatalog({family:'USDT_M',body:catalog,receipt:response('catalog','USDT_M',null,catalog)}),x=>{assert.equal(x.identities[0].crypto_eligibility,'UNKNOWN');assert.equal(x.identities[0].eligible_for_migration,false);});
    await variant('gold_backed_asset_stays_excluded',()=>{const r={...row,symbol:'PAXG-USDT',asset:'PAXG',contractId:'200'};const b={...binding,native_symbol:r.symbol,base:r.asset,native_contract_id:r.contractId};const body={code:0,data:[r]};return a.normalizeBingxCatalog({family:'USDT_M',body,receipt:response('catalog','USDT_M',null,body),bindings:[b]});},x=>{assert.equal(x.identities[0].crypto_eligibility,'EXCLUDED_NON_CRYPTO');assert.equal(x.identities[0].eligible_for_migration,false);});
    await variant('size_zero_and_minimums_are_not_contract_multipliers',()=>({linear:cat().identities[0],inverse:ci}),x=>{assert.equal(x.linear.native_size_raw,'0');assert.equal(x.linear.contract_size_decimal,null);assert.equal(x.inverse.contract_size_decimal,null);assert.equal(x.linear.token_multiplier_decimal,null);});
    const candleBody={code:0,data:[{time:T-60000,open:'10',close:'11',high:'12',low:'9',volume:'2'},{time:T-120000,open:'9',close:'10',high:'11',low:'8',volume:'3'},{time:T,open:'11',close:'11',high:'11',low:'11',volume:'0'}]};
    const candles=body=>a.normalizeBingxCandles({body,receipt:response('candles','USDT_M',i.native_symbol,body),instrument_identity:i,interval:'1m',window_start:T-120000,window_end:T});
    await variant('object_ohlcv_sorted_forming_bar_omitted',()=>candles(candleBody),x=>{assert.equal(x.contiguous,true);assert.equal(x.rows.length,2);assert.equal(x.omitted_rows,1);assert.equal(x.rows[0].native_time,T-120000);assert.equal(x.rows[0].volume_unit,null);assert.equal(x.closed_ohlcv_qualified,false);});
    await variant('binance_array_shape_refuses',()=>{let reason;try{candles({code:0,data:[[T-60000,'10','12','9','11','2',T-1]]});}catch(e){reason=e.message;}return {reason};},x=>assert.equal(x.reason,'BINANCE_ARRAY_CANDLE_NOT_ACCEPTED'));
    await variant('missing_closed_minute_does_not_fill_zero',()=>candles({...candleBody,data:[candleBody.data[0]]}),x=>{assert.equal(x.contiguous,false);assert.equal(x.rows.length,1);assert.equal(x.closed_ohlcv_qualified,false);});
    await variant('last_price_keeps_native_engine_clock',()=>{const body={code:0,data:{symbol:i.native_symbol,price:'10.1',time:T-1000}};return a.normalizeBingxMetric({kind:'last',body,receipt:response('last','USDT_M',i.native_symbol,body),instrument_identity:i});},x=>{assert.equal(x.source_ts,T-1000);assert.equal(x.received_ts,T);assert.equal(x.value_decimal,'10.1');assert.equal(x.primary_qualified,false);});
    await variant('snake_case_nested_book_no_invented_clock',()=>{const body={code:0,data:{book_ticker:{symbol:i.native_symbol,bid_price:10,ask_price:11,bid_qty:2,ask_qty:3}}};return a.normalizeBingxMetric({kind:'book',body,receipt:response('book','USDT_M',i.native_symbol,body),instrument_identity:i});},x=>{assert.equal(x.bbo.best_bid,10);assert.equal(x.bbo.best_ask,11);assert.equal(x.bbo.source_ts,null);assert.equal(x.source_ts,null);});
    await variant('premium_does_not_rebind_clock_or_assume_eight_hours',()=>{const body={code:0,data:{symbol:i.native_symbol,markPrice:'10',indexPrice:'10.1',lastFundingRate:'0',nextFundingTime:T+3600000}};return a.normalizeBingxMetric({kind:'premium',body,receipt:response('premium','USDT_M',i.native_symbol,body),instrument_identity:i});},x=>{assert.equal(x.last_funding_rate_decimal,'0');assert.equal(x.funding_period_ms,null);assert.equal(x.source_ts,null);});
    await variant('oi_raw_zero_retained_unit_and_notional_unknown',()=>{const body={code:0,data:{symbol:i.native_symbol,openInterest:'0',time:T-2000}};return a.normalizeBingxMetric({kind:'oi',body,receipt:response('oi','USDT_M',i.native_symbol,body),instrument_identity:i});},x=>{assert.equal(x.value_decimal,'0');assert.equal(x.source_ts,T-2000);assert.equal(x.oi.unit,null);assert.equal(x.oi.contracts,null);assert.equal(x.oi.amount_base,null);assert.equal(x.oi.value_quote,null);});
    await variant('coin_m_oi_time_schema_conflict_stays_unqualified',()=>{const body={code:0,data:{symbol:ci.native_symbol,openInterest:'12',time:T-1000}};return a.normalizeBingxMetric({kind:'oi',body,receipt:response('oi','COIN_M',ci.native_symbol,body),instrument_identity:ci});},x=>{assert.equal(x.source_ts,null);assert.equal(x.raw_time_fields.time,T-1000);assert.equal(x.oi.unit,null);});
    await variant('funding_event_gap_is_not_actual_current_period',()=>{const body={code:0,data:[{symbol:i.native_symbol,fundingRate:'0.001',fundingTime:T-3600000},{symbol:i.native_symbol,fundingRate:'-0.001',fundingTime:T-7200000}]};return a.normalizeBingxFundingHistory({body,receipt:response('funding_history','USDT_M',i.native_symbol,body),instrument_identity:i});},x=>{assert.equal(x.rows[1].observed_previous_event_gap_ms,3600000);assert.equal(x.rows[1].actual_period_ms,null);assert.equal(x.actual_current_period_ms,null);assert.equal(x.ranking_adjustment_allowed,false);});
    await variant('unknown_receipt_refuses_before_fact_projection',()=>{const body={code:0,data:{symbol:i.native_symbol,price:'10',time:T-1000}};const r=response('last','USDT_M',i.native_symbol,body);let reason;try{a.normalizeBingxMetric({kind:'last',body,receipt:{...r,usage_state:'UNKNOWN'},instrument_identity:i});}catch(e){reason=e.message;}return {reason};},x=>assert.equal(x.reason,'COMPLETE_BOUND_RECEIPT_REQUIRED'));
    await variant('actual_legacy_consumer_requires_explicit_bingx_bridge',()=>{
      const body={code:0,data:{T:T-500,bids:[['10','2']],asks:[['11','3']],bidsCoin:[['10','0.002']],asksCoin:[['11','0.003']]}};
      const d=a.normalizeBingxMetric({kind:'depth',body,receipt:response('depth','USDT_M',i.native_symbol,body),instrument_identity:i});
      const candidate=a.assembleBingxFuturesObservation({instrument_identity:i,depth:d});
      const ref=legacy.buildHtxReferencePrice({contract:i.native_symbol,type:'EXECUTABLE_ASK',bid:candidate.data.bbo.best_bid,ask:candidate.data.bbo.best_ask,source_ts:candidate.data.bbo.source_ts,received_ts:candidate.available_ts});
      const execution=legacy.buildHtxExecutionReceipt({component:{execution_status:'SUCCESS'},reference_price:ref});
      return {actual_legacy_reference:ref,actual_legacy_execution:execution,proposed_carrier:i,actual_depth:d,unknown_carrier:a.assembleBingxFuturesObservation({}),candidate_component:candidate,combined_migration_qualified:false};
    },x=>{assert.equal(x.actual_legacy_reference.venue,'HTX');assert.equal(x.actual_legacy_execution.venue,'HTX');assert.equal(x.proposed_carrier.venue,'BINGX');assert.equal(x.unknown_carrier.data.venue,'BINGX');assert.equal(x.unknown_carrier.data.instrument_identity,null);assert.equal(x.candidate_component.data.venue,'BINGX');assert.equal(x.actual_depth.depth.native_coin_fields.bidsCoin[0][1],'0.002');assert.equal(x.actual_depth.depth.quantity_unit,null);assert.equal(x.candidate_component.data.timestamp,T-500);assert.equal(x.candidate_component.data.liquidity.capacity_units_known,false);assert.equal(x.combined_migration_qualified,false);});
    assert.equal(result.provider_HTTP_observed,0);
    result.completed_groups.push({name:'bingx_primary_object_adapter_and_existing_consumer_boundary',completed_variants:result.completed_variants.length});
    result.status='COMPLETED_CONTROLLED_ONLY';return result;
  }catch(error){
    result.status='STOPPED';result.imports_started=importsStarted;result.stop_reason=String(error?.message??error);
    error.partial_result=result;throw error;
  }finally{
    globalThis.fetch=originalFetch;
  }
}
