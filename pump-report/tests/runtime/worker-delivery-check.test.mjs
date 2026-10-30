import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPumpWorker,TELEGRAM_DIAGNOSTIC_TEXT} from '../../runtime/worker.mjs';
import {TELEGRAM_DIAGNOSTIC_ID} from '../../runtime/provider-policy.mjs';

test('the actual Worker route saves one technical text before a matched mock Telegram ACK and refuses another grant',async()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER,state TEXT,started_ts INTEGER,completed_ts INTEGER,source_run_id TEXT);CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc,started_ts);`);
  const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async all(){const results=sql.prepare(query).all(...args),write=/^(INSERT|UPDATE|CREATE)/.test(query.trim()),changes=write?Number(sql.prepare('SELECT changes() AS n').get().n):0;return {success:true,results,meta:{rows_read:write?1:results.length,rows_written:changes,changes}};}};}};
  const oldNow=Date.now,oldFetch=globalThis.fetch;let sent=0;
  Date.now=()=>1792932900000;
  globalThis.fetch=async(url,options)=>{
    assert.match(url,/^https:\/\/api\.telegram\.org\/bot/);assert.equal(options.redirect,'manual');sent++;
    const body=JSON.parse(options.body);assert.equal(body.text,TELEGRAM_DIAGNOSTIC_TEXT);
    const cards=sql.prepare("SELECT value_json FROM pump_report_state_v1 WHERE state_key LIKE 'pump:card:%'").all().map(row=>JSON.parse(row.value_json));
    assert.equal(cards.length,1);assert.equal(cards[0].text,body.text);assert.equal(cards[0].state,'SENDING');
    return Response.json({ok:true,result:{message_id:333,chat:{id:'ARTIFICIAL_RECIPIENT'},date:1792932900}});
  };
  try{
    const env={DATA_DB:db,PUMP_CONTROL_KEY:'ARTIFICIAL_CONTROL',TELEGRAM_BOT_TOKEN:'ARTIFICIAL_TOKEN',TELEGRAM_CHAT_ID:'ARTIFICIAL_RECIPIENT'},worker=createPumpWorker();
    const request=()=>new Request('https://artificial/pump/delivery-check',{method:'POST',headers:{'x-pump-control-key':'ARTIFICIAL_CONTROL'},body:JSON.stringify({diagnostic_id:TELEGRAM_DIAGNOSTIC_ID})});
    const response=await worker.fetch(request(),env,{}),result=await response.json();
    assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.trading_signal,false);assert.equal(result.delivery.state,'SENT');assert.equal(result.saved_receipt_readback,true);assert.equal(result.native_receipt.state,'FINALIZED');assert.equal(sent,1);
    const again=await worker.fetch(request(),env,{});assert.equal(again.status,503);assert.equal(sent,1);
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pump_report_state_v1 WHERE state_key LIKE 'pump:signal:%'").get().n,0);
  }finally{Date.now=oldNow;globalThis.fetch=oldFetch;sql.close();}
});
