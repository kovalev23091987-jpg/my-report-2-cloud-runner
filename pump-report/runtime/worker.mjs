import {createPumpSources} from '../sources/index.mjs';
import {requestUrl} from '../sources/bingx.mjs';
import {analyzePump,evaluateOutcome} from '../analytics/index.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../registry/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
import {factUsable} from '../contracts/index.mjs';
import {createUnifiedBudget,createRequestBroker} from './budget.mjs';
import {createDelivery,automaticWindowOpen} from './delivery.mjs';
import {reserveNativeRun,finalizeNativeRun} from './native-budget.mjs';
import {createPumpRunner} from './runner.mjs';
import {PROVIDER_STAGE,PROVIDER_POLICY_VERSION,PROVIDER_POLICIES,QUALIFICATION_EXPIRES_TS,PROTECTED_HTTP} from './provider-policy.mjs';

export const PUMP_VERSION='pump-report-v1-package-a';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const replyCode=error=>/^[A-Z0-9_:.-]{1,160}$/.test(error?.code??'')?error.code:'PUMP_RUNTIME_ERROR';

async function services(env,{run_id,mode,clock=Date.now,fetch_impl=globalThis.fetch.bind(globalThis)}){
  const native=await reserveNativeRun({db:env.DATA_DB,run_id,mode,clock}),store=native.store;
  await store.install();
  const budget=createUnifiedBudget({store,run_id,mode:mode==='CONTROL'?'MANUAL':mode,clock,policies:PROVIDER_POLICIES,protected_reserves:PROTECTED_HTTP,admission:{provider_policy_version:PROVIDER_POLICY_VERSION,expires_ts:QUALIFICATION_EXPIRES_TS}});
  const broker=createRequestBroker({budget,store,clock,fetch_impl});
  const sources=createPumpSources({broker,identityRegistry:BINGX_IDENTITY_REGISTRY,profile:START_PROFILE,clock});
  const delivery=createDelivery({store,clock,recipient:String(env.TELEGRAM_CHAT_ID??'UNCONFIGURED'),revalidate:async card=>{
    if(card.expires_ts<=clock()||card.mode==='AUTO'&&!automaticWindowOpen(clock()))return {valid:false,reason:'CARD_OR_WINDOW_EXPIRED'};
    if(!card.analysis.ready||!card.analysis.plan)return {valid:false,reason:'PLAN_NOT_READY'};
    const saved=await store.get(card.analysis.source_input_key);if(!saved?.input)return {valid:false,reason:'ORIGINAL_INPUT_NOT_SAVED'};
    const fresh=await sources.getCore({instrument:card.analysis.instrument,run_id,mode:card.mode,force_refresh:true,only_facts:['price','orderbook']});
    const facts={...saved.input.facts,...fresh.facts};if(!['price','orderbook','candles'].every(key=>factUsable(facts[key],clock())))return {valid:false,reason:'MANDATORY_FACT_RECHECK_FAILED'};
    const checked=analyzePump({...saved.input,facts,analysis_ts:clock(),previous_wave:card.analysis.next_wave??saved.input.previous_wave},START_PROFILE);
    const move=Math.abs((checked.reference_price/card.analysis.reference_price-1)*100);
    const overlap=(a,b)=>a&&b&&a.lower<=b.upper&&b.lower<=a.upper;
    const entry=card.analysis.plan.entry_zones?.some(a=>checked.plan?.entry_zones?.some(b=>overlap(a,b)));
    const exit=overlap(card.analysis.plan.exit_zone,checked.plan?.exit_zone);
    return {valid:Boolean(checked.ready&&move<=START_PROFILE.publication_recheck_max_price_move_pct&&entry&&exit),reason:'PLAN_OR_PRICE_CHANGED'};
  },send:async ({text,recipient,card_id})=>{
    if(env.PUMP_REPORT_DELIVERY_ENABLED!=='1'||PROVIDER_STAGE!=='PRODUCTION_QUALIFIED')throw Object.assign(Error('DELIVERY_NOT_ADMITTED'),{code:'DELIVERY_NOT_ADMITTED'});
    const token=String(env.TELEGRAM_BOT_TOKEN??'');if(!token||!recipient||recipient==='UNCONFIGURED')throw Error('TELEGRAM_BINDING_MISSING');
    const receipt=await budget.reserve({provider:'TELEGRAM',family:'DELIVERY',request_id:'TELEGRAM:'+card_id});
    try{const response=await fetch_impl('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:recipient,text,disable_web_page_preview:true}),redirect:'error',signal:AbortSignal.timeout(15000)});let body=null;try{body=await response.json();}catch{}await budget.finalize(receipt,{http_status:response.status});return {ok:response.ok,status:response.status,body};}
    catch(error){if(receipt.state==='RESERVED')await budget.finalize(receipt,{state:'UNKNOWN'});throw error;}
  }});
  const runner=createPumpRunner({store,sources,analyzePump,evaluateOutcome,budget,delivery,profile:START_PROFILE,clock});
  return {native,store,budget,broker,sources,delivery,runner};
}

export function createPumpWorker(legacy={}){
  return {
    async fetch(request,env,ctx){
      const url=new URL(request.url);if(!url.pathname.startsWith('/pump/'))return typeof legacy.fetch==='function'?legacy.fetch(request,env,ctx):new Response('Not Found',{status:404});
      if(url.pathname==='/pump/health')return json({version:PUMP_VERSION,provider_stage:PROVIDER_STAGE,automatic_enabled:env.PUMP_REPORT_ENABLED==='1',delivery_enabled:env.PUMP_REPORT_DELIVERY_ENABLED==='1',legacy_schedules_restored:false});
      const key=String(env.PUMP_CONTROL_KEY??'');if(!key||request.headers.get('x-pump-control-key')!==key)return json({error:'UNAUTHORIZED'},401);
      if(request.method!=='POST')return json({error:'POST_REQUIRED'},405);
      let body;try{const raw=await request.text();if(raw.length>16384)throw Error();body=JSON.parse(raw||'{}');}catch{return json({error:'INVALID_BODY'},400);}
      const probe=url.pathname==='/pump/source-probe';
      if(PROVIDER_STAGE==='QUALIFICATION_ONLY'&&Date.now()>=QUALIFICATION_EXPIRES_TS)return json({error:'QUALIFICATION_ADMISSION_EXPIRED'},503);
      if(!probe&&PROVIDER_STAGE!=='PRODUCTION_QUALIFIED')return json({error:'PROVIDER_QUALIFICATION_PENDING'},503);
      const mode=probe?'CONTROL':body.mode==='AUTO'?'AUTO':'MANUAL',run_id=crypto.randomUUID();
      if(mode==='AUTO'&&!automaticWindowOpen(Date.now()))return json({status:'OUTSIDE_AUTOMATIC_WINDOW',run_id});
      let runtime,result;
      try{
        runtime=await services(env,{run_id,mode});
        if(probe){
          if(!['clock','catalog','price','ticker','candles','orderbook'].includes(body.kind))throw Object.assign(Error('INVALID_PROBE_KIND'),{code:'INVALID_PROBE_KIND'});
          const params={};if(!['clock','catalog'].includes(body.kind)){if(!/^[A-Za-z0-9._-]{1,80}-USDT$/.test(body.symbol??''))throw Object.assign(Error('INVALID_PROBE_SYMBOL'),{code:'INVALID_PROBE_SYMBOL'});params.symbol=body.symbol;}
          if(body.kind==='candles'){params.interval='1m';params.limit=125;params.endTime=Math.floor(Date.now()/60000)*60000;params.startTime=params.endTime-125*60000;}
          const sourceUrl=body.kind==='clock'?'https://open-api.bingx.com/openApi/swap/v2/server/time':requestUrl(body.kind,params);
          const response=await runtime.broker.request({provider:'BINGX',family:'QUALIFICATION',cache_key:'QUALIFICATION:'+body.kind+':'+JSON.stringify(params),url:sourceUrl,timeout_ms:10000,ttl_ms:60000,estimated_cost:{http:1}});
          result={status:response.ok?'PROVIDER_REPLY_RECEIVED':'PROVIDER_REPLY_ERROR',run_id,response};
          await runtime.store.set('pump:qualification:'+response.receipt_id,result);
        }else if(url.pathname==='/pump/manual')result=await runtime.runner.execute({mode:'MANUAL',symbol:body.symbol??body.text,context_symbol:body.context_symbol??null,run_id,publish:body.publish!==false,request_id:body.request_id??crypto.randomUUID()});
        else if(url.pathname==='/pump/run')result=await runtime.runner.execute({mode:'AUTO',run_id,publish:body.publish!==false});
        else if(url.pathname==='/pump/manual-result')result={status:'RESULT',result:await runtime.runner.getManualResult(body.request_id)};
        else result={error:'NOT_FOUND'};
        const finalized=await finalizeNativeRun(runtime.native);return json({...result,native_receipt:finalized});
      }catch(error){
        let finalized=null;if(runtime&&runtime.store.usage().unknown_ops===0)try{finalized=await finalizeNativeRun(runtime.native);}catch{}
        let detail=String(error?.message??'').slice(0,600);for(const [name,value] of Object.entries(env))if(/TOKEN|KEY/.test(name)&&typeof value==='string'&&value.length>5)detail=detail.split(value).join('[REDACTED]');
        return json({status:'ERROR',run_id,error:replyCode(error),error_name:String(error?.name??'Error').slice(0,60),error_detail:detail,native_receipt:finalized,native_usage:runtime?.store.usage()??null,resources:runtime?.budget.summary()??null},503);
      }
    },
    async scheduled(controller,env,ctx){
      // The retained old scheduled handler is deliberately never invoked.
      if(env.PUMP_REPORT_ENABLED!=='1'||PROVIDER_STAGE!=='PRODUCTION_QUALIFIED'||!automaticWindowOpen(Date.now()))return;
      const work=(async()=>{const run_id=crypto.randomUUID();let runtime;try{runtime=await services(env,{run_id,mode:'AUTO'});await runtime.runner.execute({mode:'AUTO',run_id,publish:true});await finalizeNativeRun(runtime.native);}catch(error){console.log('PUMP_RUN_STATUS',JSON.stringify({run_id,error:replyCode(error),usage:runtime?.store.usage()??null}));}})();
      if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
    }
  };
}
