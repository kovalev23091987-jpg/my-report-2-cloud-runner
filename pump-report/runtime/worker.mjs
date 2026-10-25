import {createPumpSources} from '../sources/index.mjs';
import {requestUrl} from '../sources/bingx.mjs';
import {analyzePump,evaluateOutcome} from '../analytics/index.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../registry/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
import {factUsable,ownerInstrumentExcluded,ownerPublicationRefusal,isBingxNativeSymbol} from '../contracts/index.mjs';
import {parseManualInput} from './manual-input.mjs';
import {manualResponseText} from './manual-response.mjs';
import {createUnifiedBudget,createRequestBroker} from './budget.mjs';
import {createDelivery,automaticWindowOpen,textHash} from './delivery.mjs';
import {reserveNativeRun,finalizeNativeRun} from './native-budget.mjs';
import {createPumpRunner} from './runner.mjs';
import {createRetainedCapsuleWriter} from './retained-capsules.mjs';
import {IMPLEMENTATION_PIN} from './implementation-pin.mjs';
import {runSourceFeasibility} from './source-feasibility.mjs';
import {PROVIDER_STAGE,PROVIDER_POLICY_VERSION,PROVIDER_POLICIES,QUALIFICATION_EXPIRES_TS,PROTECTED_HTTP,TELEGRAM_DIAGNOSTIC_ID,MANUAL_ACCEPTANCE_ID,MANUAL_ACCEPTANCE_SYMBOL,MAP_DIAGNOSTIC_ID,DAY_DIAGNOSTIC_ID,J_DIAGNOSTIC_ID,J_DIAGNOSTIC_SYMBOL,METADATA_DIAGNOSTIC_ID,METADATA_DIAGNOSTIC_URL,CORRECTED_METADATA_ID,SUMMARY_INDEX_ACCEPTANCE_ID,SOURCE_FEASIBILITY_ID} from './provider-policy.mjs';
import {createAnonymousDisplayInfoRequestFactory,createSubtleSha256} from '../sources/bingx-anonymous-display-info-request.mjs';
import {DISCOVERY_PLAN} from './discovery-reserve.mjs';

export const PUMP_VERSION='pump-report-v1.8-source-window-v3-statistics';
export const TELEGRAM_DIAGNOSTIC_TEXT='Памп-отчёт: проверка доставки.\n\nЭто техническое сообщение, без торгового сигнала. Основной отчёт ещё проходит проверку данных.';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const replyCode=error=>/^[A-Z0-9_:.-]{1,160}$/.test(error?.code??'')?error.code:'PUMP_RUNTIME_ERROR';

export async function revalidatePumpCard({card,store,sources,clock=Date.now,profile=START_PROFILE}){
  const refusal=ownerPublicationRefusal(card.analysis);if(refusal)return {valid:false,reason:refusal};
  if(card.expires_ts<=clock()||card.mode==='AUTO'&&!automaticWindowOpen(clock()))return {valid:false,reason:'CARD_OR_WINDOW_EXPIRED'};
  if(!card.analysis.ready||!card.analysis.plan)return {valid:false,reason:'PLAN_NOT_READY'};
  const saved=await store.get(card.analysis.source_input_key);if(!saved?.input)return {valid:false,reason:'ORIGINAL_INPUT_NOT_SAVED'};
  const fresh=await sources.getCore({instrument:card.analysis.instrument,run_id:card.analysis.run_id,mode:card.mode,purpose:'DELIVERY',force_refresh:true,only_facts:['price','orderbook']});
  const facts={...saved.input.facts,...fresh.facts};if(!['price','orderbook'].every(key=>factUsable(facts[key],clock())))return {valid:false,reason:'MANDATORY_FACT_RECHECK_FAILED'};
  // The same engine qualifies the retained candle tail, including an honest
  // INCOMPLETE older path. Fresh price/book alone never make candles usable.
  const checked=analyzePump({...saved.input,facts,analysis_ts:clock(),previous_wave:card.analysis.next_wave??saved.input.previous_wave},profile);
  const move=Math.abs((checked.reference_price/card.analysis.reference_price-1)*100);
  const overlap=(a,b)=>a&&b&&a.lower<=b.upper&&b.lower<=a.upper;
  const entry=card.analysis.plan.entry_zones?.some(a=>checked.plan?.entry_zones?.some(b=>overlap(a,b)));
  const exit=overlap(card.analysis.plan.exit_zone,checked.plan?.exit_zone);
  return {valid:Boolean(checked.ready&&move<=profile.publication_recheck_max_price_move_pct&&entry&&exit),reason:'PLAN_OR_PRICE_CHANGED'};
}

async function services(env,{run_id,mode,clock=Date.now,fetch_impl=globalThis.fetch.bind(globalThis)}){
  if(IMPLEMENTATION_PIN?.schema!=='PUMP_BUNDLED_IMPLEMENTATION_PIN_V1'||!/^[a-f0-9]{64}$/.test(IMPLEMENTATION_PIN.sha256??''))throw Object.assign(Error('PINNED_IMPLEMENTATION_ARTIFACT_REQUIRED'),{code:'PINNED_IMPLEMENTATION_ARTIFACT_REQUIRED'});
  const run_purpose=PROVIDER_STAGE==='PRODUCTION_QUALIFIED'?'PRODUCTION':'ACCEPTANCE_TEST';
  const native=await reserveNativeRun({db:env.DATA_DB,run_id,mode,run_purpose,clock}),store=native.store;
  try{
  if(mode!=='LOOKUP')await store.install();
  const feasibility=PROVIDER_STAGE==='SOURCE_FEASIBILITY_SINGLE'&&mode==='CONTROL'&&run_id===SOURCE_FEASIBILITY_ID;
  const budget=createUnifiedBudget({store,run_id,mode:['MAP_CHECK','DAY_CHECK','METADATA_CHECK'].includes(mode)?'AUTO':['CONTROL','DELIVERY_CHECK'].includes(mode)?'MANUAL':mode==='LOOKUP'?'STATISTICS':mode,clock,policies:PROVIDER_POLICIES,protected_reserves:PROTECTED_HTTP,admission:{provider_policy_version:PROVIDER_POLICY_VERSION,expires_ts:QUALIFICATION_EXPIRES_TS,strict_automatic_window:mode==='AUTO',run_purpose,...(feasibility?{allowed_providers:['BINGX'],max_http_attempts:3}:{}),...(PROVIDER_STAGE==='PRODUCTION_QUALIFIED'?{discovery:DISCOVERY_PLAN}:{}),...(PROVIDER_STAGE==='SUMMARY_INDEX_ACCEPTANCE_ONLY'?{allowed_providers:[]}:mode==='METADATA_CHECK'?{allowed_providers:['BINGX_WEB_METADATA']}:PROVIDER_STAGE==='J_INTEGRATION_ACCEPTANCE'&&run_id===J_DIAGNOSTIC_ID?{allowed_providers:['BINGX']}:{})}});
  const baseBroker=createRequestBroker({budget,store,clock,fetch_impl,max_response_bytes:mode==='MAP_CHECK'?262144:2000000}),captured=[];let operationFailure=false;
  const broker=feasibility?{...baseBroker,operationFailed:()=>operationFailure,request:async args=>{
    try{const response=await baseBroker.request(args);captured.push({request:{url:args.url,method:'GET',started_ts:response.request_started_ts},response});if(response.semantic_status!=='SUCCESS')operationFailure=true;return response;}
    catch(error){operationFailure=true;captured.push({request:{url:args.url,method:'GET'},error:error.code??'SOURCE_REQUEST_FAILED'});throw error;}
  }}:baseBroker;
  const sources=createPumpSources({broker,identityRegistry:BINGX_IDENTITY_REGISTRY,profile:feasibility?{...START_PROFILE,optional_http_upper_bound:1}:START_PROFILE,clock});
  const delivery=createDelivery({store,clock,recipient:String(env.TELEGRAM_CHAT_ID??'UNCONFIGURED'),revalidate:async card=>{
    if(card.analysis.kind==='DELIVERY_DIAGNOSTIC')return {valid:mode==='DELIVERY_CHECK'&&card.analysis.diagnostic_id===TELEGRAM_DIAGNOSTIC_ID&&card.expires_ts>clock()&&card.text===TELEGRAM_DIAGNOSTIC_TEXT};
    return revalidatePumpCard({card,store,sources,clock});
  },send:async ({text,recipient,card_id})=>{
    const savedCard=await store.get('pump:card:'+card_id);
    const refusal=ownerPublicationRefusal(savedCard?.analysis);if(refusal&&savedCard?.analysis?.kind!=='DELIVERY_DIAGNOSTIC')throw Object.assign(Error(refusal),{code:refusal,send_attempted:false});
    const diagnostic=mode==='DELIVERY_CHECK'&&text===TELEGRAM_DIAGNOSTIC_TEXT&&PROVIDER_STAGE==='QUALIFICATION_ONLY';
    let acceptedManual=false;
    if(PROVIDER_STAGE==='MANUAL_ACCEPTANCE'&&mode==='MANUAL'&&run_id===MANUAL_ACCEPTANCE_ID){const card=await store.get('pump:card:'+card_id);acceptedManual=card?.mode==='MANUAL'&&card.analysis?.ready===true&&card.analysis.run_id===run_id&&card.analysis.instrument?.native_symbol===MANUAL_ACCEPTANCE_SYMBOL+'-USDT';}
    if(!diagnostic&&!acceptedManual&&(env.PUMP_REPORT_DELIVERY_ENABLED!=='1'||PROVIDER_STAGE!=='PRODUCTION_QUALIFIED'))throw Object.assign(Error('DELIVERY_NOT_ADMITTED'),{code:'DELIVERY_NOT_ADMITTED',send_attempted:false});
    const token=String(env.TELEGRAM_BOT_TOKEN??'');if(!token||!recipient||recipient==='UNCONFIGURED')throw Object.assign(Error('TELEGRAM_BINDING_MISSING'),{send_attempted:false});
    let receipt;try{receipt=await budget.reserve({provider:'TELEGRAM',family:'DELIVERY',request_id:'TELEGRAM:'+card_id});}catch(error){error.send_attempted=false;throw error;}
    try{const response=await fetch_impl('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:recipient,text,disable_web_page_preview:true}),redirect:'manual',signal:AbortSignal.timeout(15000)});let body=null;try{body=await response.json();}catch{}await budget.finalize(receipt,{http_status:response.status});return {ok:response.ok,status:response.status,body};}
    catch(error){if(receipt.state==='RESERVED')await budget.finalize(receipt,{state:'UNKNOWN'});throw error;}
  }});
  const retained_features=createRetainedCapsuleWriter({store,implementation_sha256:IMPLEMENTATION_PIN.sha256,evidence_class:'OBSERVED'});
  const runner=createPumpRunner({store,sources,analyzePump,evaluateOutcome,budget,delivery,profile:START_PROFILE,clock,evidence_class:'OBSERVED',run_purpose,retained_features,await_source_window:args=>broker.awaitProviderWindow(args)});
  return {native,store,budget,broker,sources,delivery,runner,captured};
  }catch(error){error.pumpNative=native;throw error;}
}

export function createPumpWorker(legacy={}){
  return {
    async fetch(request,env,ctx){
      const url=new URL(request.url);if(!url.pathname.startsWith('/pump/'))return typeof legacy.fetch==='function'?legacy.fetch(request,env,ctx):new Response('Not Found',{status:404});
      if(url.pathname==='/pump/health')return json({version:PUMP_VERSION,implementation_sha256:IMPLEMENTATION_PIN?.sha256??null,provider_stage:PROVIDER_STAGE,automatic_enabled:env.PUMP_REPORT_ENABLED==='1',delivery_enabled:env.PUMP_REPORT_DELIVERY_ENABLED==='1',legacy_schedules_restored:false});
      const key=String(env.PUMP_CONTROL_KEY??'');if(!key||request.headers.get('x-pump-control-key')!==key)return json({error:'UNAUTHORIZED'},401);
      if(request.method!=='POST')return json({error:'POST_REQUIRED'},405);
      let body;try{const raw=await request.text();if(raw.length>16384)throw Error();body=JSON.parse(raw||'{}');if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return json({error:'INVALID_BODY'},400);}
      const probe=url.pathname==='/pump/source-probe';
      const deliveryCheck=url.pathname==='/pump/delivery-check';
      const mapProbe=url.pathname==='/pump/map-probe';
      const dayProbe=url.pathname==='/pump/day-probe';
      const integrationCheck=url.pathname==='/pump/integration-check';
      const metadataProbe=url.pathname==='/pump/metadata-probe';
      const feasibilityCheck=url.pathname==='/pump/source-feasibility';
      const lookup=['/pump/manual-result','/pump/summary'].includes(url.pathname);
      if(!probe&&!lookup&&!deliveryCheck&&!mapProbe&&!dayProbe&&!integrationCheck&&!metadataProbe&&!feasibilityCheck&&!['/pump/manual','/pump/run'].includes(url.pathname))return json({error:'NOT_FOUND'},404);
      if(PROVIDER_STAGE==='SOURCE_FEASIBILITY_SINGLE'&&(!feasibilityCheck||body.grant_id!==SOURCE_FEASIBILITY_ID||Object.keys(body).some(k=>k!=='grant_id')))return json({error:'EXACT_SOURCE_FEASIBILITY_OPERATION_REQUIRED'},400);
      if(feasibilityCheck&&PROVIDER_STAGE!=='SOURCE_FEASIBILITY_SINGLE')return json({error:'SOURCE_FEASIBILITY_NOT_ADMITTED'},400);
      const summaryCheck=PROVIDER_STAGE==='SUMMARY_INDEX_ACCEPTANCE_ONLY'&&url.pathname==='/pump/summary';
      if(PROVIDER_STAGE==='SUMMARY_INDEX_ACCEPTANCE_ONLY'&&(!summaryCheck||body.grant_id!==SUMMARY_INDEX_ACCEPTANCE_ID||body.max_records!==4||Object.keys(body).some(key=>!['grant_id','max_records'].includes(key))))return json({error:'EXACT_SUMMARY_INDEX_ACCEPTANCE_REQUIRED'},400);
      if(metadataProbe&&(PROVIDER_STAGE!=='METADATA_CORRECTED_ONCE'||body.grant_id!==CORRECTED_METADATA_ID))return json({error:'METADATA_PROBE_NOT_ADMITTED'},400);
      if(metadataProbe&&Object.keys(body).some(key=>key!=='grant_id'))return json({error:'INVALID_METADATA_PROBE_PARAMS'},400);
      if(deliveryCheck&&(body.diagnostic_id!==TELEGRAM_DIAGNOSTIC_ID||PROVIDER_STAGE!=='QUALIFICATION_ONLY'))return json({error:'DELIVERY_DIAGNOSTIC_NOT_ADMITTED'},400);
      if(mapProbe&&(body.probe_id!==MAP_DIAGNOSTIC_ID||PROVIDER_STAGE!=='MANUAL_ACCEPTANCE'))return json({error:'MAP_PROBE_NOT_ADMITTED'},400);
      if(dayProbe&&(body.probe_id!==DAY_DIAGNOSTIC_ID||PROVIDER_STAGE!=='DAY_WINDOW_ACCEPTANCE'))return json({error:'DAY_PROBE_NOT_ADMITTED'},400);
      if(integrationCheck&&(body.grant_id!==J_DIAGNOSTIC_ID||PROVIDER_STAGE!=='J_INTEGRATION_ACCEPTANCE'))return json({error:'INTEGRATION_CHECK_NOT_ADMITTED'},400);
      if(integrationCheck&&Object.keys(body).some(key=>key!=='grant_id'))return json({error:'INVALID_INTEGRATION_CHECK_PARAMS'},400);
      if(probe&&!['clock','catalog','price','ticker','candles','orderbook'].includes(body.kind))return json({error:'INVALID_PROBE_KIND'},400);
      if(probe&&!['clock','catalog'].includes(body.kind)&&!isBingxNativeSymbol(body.symbol))return json({error:'INVALID_PROBE_SYMBOL'},400);
      if(url.pathname==='/pump/manual-result'&&!(typeof body.request_id==='string'&&/^[A-Za-z0-9:._-]{1,160}$/.test(body.request_id)))return json({error:'INVALID_REQUEST_ID'},400);
      if(url.pathname==='/pump/summary'&&body.max_records!==undefined&&(!Number.isInteger(body.max_records)||body.max_records<1||body.max_records>40))return json({error:'SUMMARY_LIMIT_1_TO_40'},400);
      if((url.pathname==='/pump/manual'&&body.mode!==undefined&&body.mode!=='MANUAL')||(url.pathname==='/pump/run'&&body.mode!==undefined&&body.mode!=='AUTO'))return json({error:'ROUTE_MODE_MISMATCH'},400);
      if(url.pathname==='/pump/manual'&&ownerInstrumentExcluded(parseManualInput(body.symbol??body.text,{context_symbol:body.context_symbol??null}).symbol))return json({status:'OWNER_ASSET_DELIVERY_EXCLUDED',manual_response_text:'BTC и ETH исключены из Памп-отчёта по вашему указанию.'},400);
      if(PROVIDER_STAGE!=='QUALIFICATION_ONLY'&&probe)return json({error:'PREVIOUS_QUALIFICATION_GRANT_SPENT'},400);
      const acceptedManual=PROVIDER_STAGE==='MANUAL_ACCEPTANCE'&&url.pathname==='/pump/manual'&&body.request_id===MANUAL_ACCEPTANCE_ID&&parseManualInput(body.symbol??body.text,{context_symbol:body.context_symbol??null}).symbol===MANUAL_ACCEPTANCE_SYMBOL;
      if(PROVIDER_STAGE==='MANUAL_ACCEPTANCE'&&url.pathname==='/pump/manual'&&!acceptedManual)return json({error:'EXACT_MANUAL_ACCEPTANCE_REQUEST_REQUIRED'},400);
      if(Date.now()>=QUALIFICATION_EXPIRES_TS)return json({error:'PROVIDER_ADMISSION_EXPIRED'},503);
      if(!probe&&!lookup&&!deliveryCheck&&!mapProbe&&!dayProbe&&!integrationCheck&&!metadataProbe&&!feasibilityCheck&&!acceptedManual&&PROVIDER_STAGE!=='PRODUCTION_QUALIFIED')return json({error:'PROVIDER_QUALIFICATION_PENDING'},503);
      const mode=feasibilityCheck?'CONTROL':metadataProbe?'METADATA_CHECK':probe?'CONTROL':deliveryCheck?'DELIVERY_CHECK':mapProbe?'MAP_CHECK':dayProbe?'DAY_CHECK':lookup?'LOOKUP':url.pathname==='/pump/run'?'AUTO':'MANUAL',run_id=feasibilityCheck?SOURCE_FEASIBILITY_ID:summaryCheck?SUMMARY_INDEX_ACCEPTANCE_ID:metadataProbe?CORRECTED_METADATA_ID:deliveryCheck?TELEGRAM_DIAGNOSTIC_ID:mapProbe?MAP_DIAGNOSTIC_ID:dayProbe?DAY_DIAGNOSTIC_ID:integrationCheck?J_DIAGNOSTIC_ID:acceptedManual?MANUAL_ACCEPTANCE_ID:crypto.randomUUID();
      if(mode==='AUTO'&&!automaticWindowOpen(Date.now()))return json({status:'OUTSIDE_AUTOMATIC_WINDOW',run_id});
      let runtime,result,finalizationStarted=false;
      try{
        runtime=await services(env,{run_id,mode});
        if(feasibilityCheck)result=await runSourceFeasibility({...runtime,run_id});
        else if(metadataProbe){
          const factory=createAnonymousDisplayInfoRequestFactory({clock:Date.now,uuid:()=>crypto.randomUUID(),sha256:createSubtleSha256(crypto.subtle),time_zone_hours:-new Date().getTimezoneOffset()/60});
          const signed=await factory.build();
          if(signed.url!==METADATA_DIAGNOSTIC_URL||signed.method!=='GET')throw Object.assign(Error('EXACT_METADATA_REQUEST_REQUIRED'),{code:'EXACT_METADATA_REQUEST_REQUIRED'});
          const response=await runtime.broker.request({provider:'BINGX_WEB_METADATA',family:'IDENTITY_METADATA',cache_key:CORRECTED_METADATA_ID,...signed,ttl_ms:0,timeout_ms:10000,estimated_cost:{http:1}});
          const value=response.data,rows=Array.isArray(value?.result)?value.result:Array.isArray(value?.data)?value.data:Array.isArray(value)?value:null;
          const safe={status:'METADATA_REPLY_UNQUALIFIED',run_id,http_status:response.status,receipt_id:response.receipt_id,received_ts:response.received_ts,normalized_response_sha256:await textHash(JSON.stringify(value)),row_count:rows?.length??null,row_keys:rows?.[0]&&typeof rows[0]==='object'?Object.keys(rows[0]):[],taxonomy_enum_qualified:false,native_contract_bridge_qualified:false};
          await runtime.store.set('pump:metadata-qualification:'+CORRECTED_METADATA_ID,safe);
          result={...safe,response,resources:runtime.budget.summary(),trading_signal:false,crypto_identity_promotions:0};
        }else if(deliveryCheck){
          const card=await runtime.delivery.enqueue({kind:'DELIVERY_DIAGNOSTIC',diagnostic_id:TELEGRAM_DIAGNOSTIC_ID,ready:true,instrument:{instrument_id:'PUMP:TECHNICAL_DELIVERY_ONLY'},wave_id:TELEGRAM_DIAGNOSTIC_ID,card_text:TELEGRAM_DIAGNOSTIC_TEXT},{mode:'MANUAL',expires_ts:Math.min(Date.now()+60000,QUALIFICATION_EXPIRES_TS)});
          const delivery=await runtime.delivery.dispatch(card.card_id),saved=await runtime.store.get('pump:card:'+card.card_id);
          if(delivery.state==='SENT'&&(saved?.text!==TELEGRAM_DIAGNOSTIC_TEXT||saved.receipt?.card_id!==card.card_id))throw Object.assign(Error('DIAGNOSTIC_SAVED_RECEIPT_MISMATCH'),{code:'DIAGNOSTIC_SAVED_RECEIPT_MISMATCH'});
          result={status:'TECHNICAL_DELIVERY_CHECK',run_id,delivery,text_hash:saved?.text_hash,original_saved_before_send:true,saved_receipt_readback:delivery.state==='SENT'&&delivery.receipt_readback===true,trading_signal:false};
        }else if(integrationCheck){
          result=await runtime.runner.execute({mode:'MANUAL',symbol:J_DIAGNOSTIC_SYMBOL,run_id,publish:false,request_id:J_DIAGNOSTIC_ID});
          result={...result,integration_check:true,publish_requested:false,manual_response_text:manualResponseText(result)};
        }else if(dayProbe){
          const instrument=BINGX_IDENTITY_REGISTRY.find(e=>e.instrument.native_symbol==='BTC-USDT')?.instrument;
          if(!instrument||typeof runtime.sources.getDayGrowth!=='function')throw Object.assign(Error('DAY_SOURCE_NOT_CONNECTED'),{code:'DAY_SOURCE_NOT_CONNECTED'});
          const day=await runtime.sources.getDayGrowth({instrument,run_id,mode:'MANUAL'});
          result={status:'DAY_WINDOW_PROBE',run_id,day,resources:runtime.budget.summary(),trading_signal:false};
          await runtime.store.set('pump:day-qualification:'+DAY_DIAGNOSTIC_ID,result);
        }else if(mapProbe){
          const response=await runtime.broker.request({provider:'SWOLECHARTS',family:'LIQUIDATIONS',purpose:'CORE',method:'GET',url:'https://swolecharts.com/api/liquidation-levels/BTC',candidate_id:'BINGX:USDT_M:100:BTC-USDT',ttl_ms:0,timeout_ms:10000,estimated_cost:{http:1},cache_key:MAP_DIAGNOSTIC_ID});
          result={status:response.ok?'MAP_PROVIDER_REPLY_RECEIVED':'MAP_PROVIDER_REPLY_ERROR',run_id,response,map_qualified:false,base_idea_nonblocking:true};
          await runtime.store.set('pump:map-qualification:'+MAP_DIAGNOSTIC_ID,result);
        }else if(probe){
          if(!['clock','catalog','price','ticker','candles','orderbook'].includes(body.kind))throw Object.assign(Error('INVALID_PROBE_KIND'),{code:'INVALID_PROBE_KIND'});
          const params={};if(!['clock','catalog'].includes(body.kind)){if(!isBingxNativeSymbol(body.symbol))throw Object.assign(Error('INVALID_PROBE_SYMBOL'),{code:'INVALID_PROBE_SYMBOL'});params.symbol=body.symbol;}
          if(body.kind==='candles'){params.interval='1m';params.limit=125;params.endTime=Math.floor(Date.now()/60000)*60000;params.startTime=params.endTime-125*60000;}
          const sourceUrl=body.kind==='clock'?'https://open-api.bingx.com/openApi/swap/v2/server/time':requestUrl(body.kind,params);
          const response=await runtime.broker.request({provider:'BINGX',family:'QUALIFICATION',cache_key:'QUALIFICATION:'+body.kind+':'+JSON.stringify(params),url:sourceUrl,timeout_ms:10000,ttl_ms:60000,estimated_cost:{http:1}});
          result={status:response.ok?'PROVIDER_REPLY_RECEIVED':'PROVIDER_REPLY_ERROR',run_id,response};
          await runtime.store.set('pump:qualification:'+response.receipt_id,result);
        }else if(url.pathname==='/pump/manual')result=await runtime.runner.execute({mode:'MANUAL',symbol:body.symbol??body.text,context_symbol:body.context_symbol??null,run_id,publish:body.publish!==false,request_id:body.request_id??crypto.randomUUID()});
        else if(url.pathname==='/pump/run')result=await runtime.runner.execute({mode:'AUTO',run_id,publish:body.publish!==false});
        else if(url.pathname==='/pump/manual-result')result={status:'RESULT',result:await runtime.runner.getManualResult(body.request_id)};
        else if(url.pathname==='/pump/summary')result={status:'SUMMARY',result:await runtime.runner.getSummary({max_records:body.max_records??40})};
        else result={error:'NOT_FOUND'};
        if(url.pathname==='/pump/manual')result={...result,manual_response_text:manualResponseText(result)};
        if(url.pathname==='/pump/manual-result')result={...result,manual_response_text:manualResponseText(result.result)};
        finalizationStarted=true;const finalized=await finalizeNativeRun(runtime.native);return json({...result,native_receipt:finalized});
      }catch(error){
        const native=runtime?.native??error.pumpNative;
        let finalized=null;if(native&&!finalizationStarted&&native.store.usage().unknown_ops===0)try{finalizationStarted=true;finalized=await finalizeNativeRun(native);}catch{}
        let detail=String(error?.message??'').slice(0,600);for(const [name,value] of Object.entries(env))if(/TOKEN|KEY/.test(name)&&typeof value==='string'&&value.length>5)detail=detail.split(value).join('[REDACTED]');
        return json({status:'ERROR',run_id,error:replyCode(error),error_name:String(error?.name??'Error').slice(0,60),error_detail:detail,native_receipt:finalized,native_usage:native?.store.usage()??null,resources:runtime?.budget.summary()??null},503);
      }
    },
    async scheduled(controller,env,ctx){
      // The retained old scheduled handler is deliberately never invoked.
      if(env.PUMP_REPORT_ENABLED!=='1'||PROVIDER_STAGE!=='PRODUCTION_QUALIFIED'||!automaticWindowOpen(Date.now()))return;
      const work=(async()=>{const run_id=crypto.randomUUID();let runtime,finalizationStarted=false;try{runtime=await services(env,{run_id,mode:'AUTO'});await runtime.runner.execute({mode:'AUTO',run_id,publish:true});finalizationStarted=true;await finalizeNativeRun(runtime.native);}catch(error){const native=runtime?.native??error.pumpNative;if(native&&!finalizationStarted&&native.store.usage().unknown_ops===0)try{finalizationStarted=true;await finalizeNativeRun(native);}catch{}console.log('PUMP_RUN_STATUS',JSON.stringify({run_id,error:replyCode(error),usage:native?.store.usage()??null}));}})();
      if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
    }
  };
}
