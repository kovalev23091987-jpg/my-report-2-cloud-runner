import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildArtifact} from '../../runtime/build.mjs';

// Every market response, clock, database and Telegram ACK below is ARTIFICIAL.
// This checks the compiled production path; it grants no actual provider IO.
test('compiled production Worker retains original/card/receipt identity and finite capture boundaries',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pump-production-artificial-'));
  const policy=fs.readFileSync(path.join(root,'runtime/provider-policy.mjs'),'utf8');
  assert.match(policy,/export const PROVIDER_STAGE = '(?:SAVED_STATISTICS_AUDIT_SINGLE|PRODUCTION_QUALIFIED)';/);
  const output=path.join(dir,'artifact.json');
  const manifest=buildArtifact({legacy_path:path.join(root,'.private/retained-legacy-worker.mjs'),output_path:output,
    module_overrides:{'runtime/provider-policy.mjs':policy.replace("export const PROVIDER_STAGE = 'SAVED_STATISTICS_AUDIT_SINGLE';","export const PROVIDER_STAGE = 'PRODUCTION_QUALIFIED';")}});
  const artifact=JSON.parse(fs.readFileSync(output,'utf8'));
  for(const [name,content] of Object.entries(artifact.modules)){const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content,{mode:0o600});}
  const {createPumpWorker}=await import(pathToFileURL(path.join(dir,'runtime/worker.mjs')));
  const {BINGX_IDENTITY_REGISTRY}=await import(pathToFileURL(path.join(dir,'registry/index.mjs')));
  const {createReviewedNativeScopeRegistry}=await import(pathToFileURL(path.join(dir,'registry/native-reviewed550.mjs')));
  const entry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY).resolve({native_symbol:'1INCH-USDT'});
  assert.ok(entry.qualifications.orderbook);assert.equal(entry.instrument.contract_multiplier,null);
  const sql=new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER,state TEXT,started_ts INTEGER,completed_ts INTEGER,source_run_id TEXT);CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc,started_ts);');
  let queries=0,now=Date.parse('2026-10-26T07:00:00Z'),sent=0;const calls=[];
  const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async all(){queries++;const results=sql.prepare(query).all(...args),write=/^(?:INSERT|UPDATE|CREATE|DELETE|WITH)\b/.test(query.trim()),changes=write?Number(sql.prepare('SELECT changes() AS n').get().n):0;return {success:true,results,meta:{rows_read:write?1:results.length,rows_written:changes,changes}};}};}};
  const oldNow=Date.now,oldFetch=globalThis.fetch,oldTimeout=globalThis.setTimeout;
  Date.now=()=>now;globalThis.setTimeout=(fn,ms,...args)=>oldTimeout(()=>{now+=ms;fn(...args);},0);
  const tail=[102,105,110,115,117,118,117.5,116,115,114,113.5,113,112,111,112];
  const close=i=>i<106?100+2*Math.sin(i*Math.PI/5):tail[i-106];
  globalThis.fetch=async(raw,options={})=>{
    const u=new URL(raw),kind=u.pathname.split('/').at(-1);calls.push(kind);
    if(u.hostname==='api.telegram.org'){
      sent++;const body=JSON.parse(options.body);assert.equal(body.chat_id,'ARTIFICIAL_RECIPIENT');
      const cards=sql.prepare("SELECT value_json FROM pump_report_state_v1 WHERE state_key LIKE 'pump:card:%'").all().map(r=>JSON.parse(r.value_json));
      assert.equal(cards.length,1);assert.equal(cards[0].state,'SENDING');assert.equal(cards[0].text,body.text);
      assert.doesNotMatch(body.text,/3000 USDT|абсолютн.{0,20}неизвест|BTC|ETH/);
      return Response.json({ok:true,result:{message_id:987,chat:{id:'ARTIFICIAL_RECIPIENT'}}});
    }
    assert.equal(u.hostname,'open-api.bingx.com','NO ACTUAL NETWORK PERMITTED');let data;
    if(kind==='contracts')data=[{symbol:'1INCH-USDT',contractId:entry.native_contract_id,asset:entry.native_base??'1INCH',currency:'USDT',status:1}];
    else if(kind==='ticker')data=[{symbol:'1INCH-USDT',lastPrice:'112',closeTime:now,priceChangePercent:'27'}];
    else if(kind==='price')data=[{symbol:'1INCH-USDT',price:'112',time:now}];
    else if(kind==='depth')data={T:now,bidsCoin:[[111.9,1000],[111.8,1000]],asksCoin:[[112.1,1000],[112.2,1000]]};
    else if(kind==='klines'){
      const count=Number(u.searchParams.get('limit')),end=Math.floor(Number(u.searchParams.get('endTime'))/60000)*60000;
      assert.ok(count>0&&count<=1440);
      data=Array.from({length:count},(_,n)=>{const i=121-count+n,open=close(i-1),last=close(i);return {time:end-(count-n)*60000,open,high:Math.max(open,last)+0.1,low:Math.min(open,last)-0.1,close:last,volume:i>=106&&i<=111?3000:i>111?300:1000};});
    }else if(kind==='trades')data=[];
    else if(kind==='openInterest')data={symbol:'1INCH-USDT',openInterest:'100',time:now};
    else if(kind==='premiumIndex')data={symbol:'1INCH-USDT',lastFundingRate:'0.001',time:now};
    else assert.fail('UNEXPECTED ARTIFICIAL ROUTE '+kind);
    return Response.json({code:0,data});
  };
  try{
    const worker=createPumpWorker(),env={DATA_DB:db,PUMP_CONTROL_KEY:'ARTIFICIAL_CONTROL',TELEGRAM_BOT_TOKEN:'ARTIFICIAL_TOKEN',TELEGRAM_CHAT_ID:'ARTIFICIAL_RECIPIENT',PUMP_REPORT_ENABLED:'0',PUMP_REPORT_DELIVERY_ENABLED:'1'};
    const request=(route,body)=>worker.fetch(new Request('https://artificial/pump/'+route,{method:'POST',headers:{'x-pump-control-key':'ARTIFICIAL_CONTROL'},body:JSON.stringify(body)}),env,{});
    assert.equal((await request('source-probe',{kind:'price'})).status,400);
    assert.equal((await request('run',{})).status,503);
    assert.equal((await request('manual',{symbol:'1INCH',request_id:'wrong',capture_id:'wrong'})).status,400);
    assert.equal(queries,0);assert.equal(calls.length,0);
    const id='pump-first-production-manual-20261026-one';
    const response=await request('manual',{symbol:'1INCH',request_id:id,capture_id:id,publish:true}),result=await response.json();
    assert.equal(response.status,200,JSON.stringify(result));
    assert.equal(result.manual_result?.analysis?.ready,true,JSON.stringify(result));
    assert.ok(result.manual_result.analysis.plan.potential_pct.minimum>=10);
    assert.equal(result.native_receipt?.state,'FINALIZED');assert.equal(result.native_receipt.usage.unknown_ops,0);
    const capture=result.launch_capture;assert.equal(capture.implementation_sha256,manifest.implementation_pin.sha256);
    assert.equal(capture.raw_capture.complete,true);assert.equal(capture.analyses.length,1);assert.equal(capture.publication_allowed,true);
    assert.equal(capture.status,'CAPTURED_SAME_ORIGINAL_CARD');assert.equal(capture.actual_receipts.length,1);
    assert.equal(capture.actual_receipts[0].same_original,true);assert.equal(capture.actual_receipts[0].receipt_bound,true);
    assert.equal(capture.actual_receipts[0].card.state,'SENT');assert.equal(capture.actual_receipts[0].card.message_id,'987');
    assert.ok(capture.actual_receipts[0].card.receipt.http_started_ts<capture.actual_receipts[0].card.expires_ts);
    assert.ok(capture.actual_receipts[0].card.receipt.http_ack_received_ts>=capture.actual_receipts[0].card.receipt.http_started_ts);
    assert.equal(capture.analyses[0].original.input.run_purpose,'PRODUCTION');assert.equal(sent,1);
    assert.ok(result.resources.total<=13);const before=calls.length;
    assert.equal((await request('manual',{symbol:'1INCH',request_id:id,capture_id:id,publish:true})).status,503);
    assert.equal(calls.length,before);assert.equal(sent,1);
  }finally{Date.now=oldNow;globalThis.fetch=oldFetch;globalThis.setTimeout=oldTimeout;sql.close();fs.rmSync(dir,{recursive:true,force:true});}
});
