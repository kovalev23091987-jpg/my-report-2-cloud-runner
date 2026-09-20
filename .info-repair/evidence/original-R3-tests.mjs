import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMorningInformationalMessage,
  buildWaitInformationalMessage,
  runTelegramOutputLayer,
} from '../runner/telegram-output.mjs';

const NOW=Date.UTC(2026,8,19,12,0,0); // 15:00 MSK
const WAIT={contract:'RAY-USDT',direction:'LONG',wave_id:'W1',status:'WAIT',reason:'DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY',observation_ts:NOW-60_000,valid_until_ts:NOW+240_000,updated_ts:NOW-30_000,early_detection_quality_0_100:78,lifecycle_stage:'PRE_IMPULSE_WATCH'};
const OBS={contract:'AKE-USDT',direction:'SHORT',wave_id:'W2',status:'OBSERVE',reason:'USEFUL_LIVE_OBSERVATION',observation_ts:NOW-60_000,valid_until_ts:NOW+240_000,updated_ts:NOW-30_000,early_detection_quality_0_100:65,lifecycle_stage:'DISCOVERY'};

class FakeDB {
  constructor(rows=[WAIT,OBS]){this.rows=rows;this.writes=[];}
  prepare(sql){
    const self=this;
    return {
      args:[],
      bind(...args){this.args=args;return this;},
      async all(){
        if(sql.includes('FROM v3_user_lifecycle_shadow')) return {results:self.rows};
        if(sql.includes('FROM final_decision_integration_shadow')) return {results:[]};
        if(sql.includes('FROM final_decision_telegram_context_shadow')) return {results:[]};
        return {results:[]};
      },
      async run(){
        if(sql.includes('INSERT OR IGNORE INTO telegram_output_dispatch_journal_v2')) {
          const category=String(this.args[1]||'');
          const key=String(this.args[0]||'');
          if(category!=='FINAL_CHAIN_CANDIDATE') return {meta:{changes:0}};
          if(!key.startsWith('final-chain:')) return {meta:{changes:0}};
        }
        self.writes.push({sql,args:this.args});return {meta:{changes:1}};
      },
      async first(){return null;},
    };
  }
}
function okFetch(calls){return async (_url,init)=>{calls.push(JSON.parse(init.body));return {ok:true,status:200,async json(){return {ok:true,status:'SENT',message_id:77};}};};}

test('morning message is informational and not probability',()=>{
  const out=buildMorningInformationalMessage([WAIT,OBS],{now:NOW,test:false});
  assert.equal(out.ok,true);
  assert.match(out.message,/Информационный обзор/);
  assert.match(out.message,/Подтверждённые торговые сигналы остаются выключены/);
  assert.doesNotMatch(out.message,/вероятност/i);
  assert.match(out.message,/RAY/);
  assert.match(out.message,/AKE/);
});

test('wait message is explicitly not a trading signal',()=>{
  const out=buildWaitInformationalMessage(WAIT,{now:NOW});
  assert.equal(out.ok,true);
  assert.match(out.message,/НЕ ТОРГОВЫЙ СИГНАЛ/);
  assert.match(out.message,/Вход пока не подтверждён/);
  assert.doesNotMatch(out.message,/вероятност/i);
});

test('manual report test sends one informational morning message',async()=>{
  const db=new FakeDB(); const calls=[];
  const out=await runTelegramOutputLayer({db,startedTs:NOW,source:'workflow_dispatch',relayUrl:'https://relay.test',relayKey:'secret',reportTest:true,shadowDecisionAuto:false,infoEnabled:true,enabled:true,fetchImpl:okFetch(calls)});
  assert.equal(out.morning.sent,true);
  assert.equal(out.morning.status,'SENT');
  assert.equal(out.early_info.sent,false);
  assert.equal(calls.length,1);
  assert.match(calls[0].text,/Проверка Telegram/);
  assert.match(calls[0].text,/не торговый сигнал/i);
  const insert=db.writes.find((x)=>x.sql.includes('INSERT OR IGNORE INTO telegram_output_dispatch_journal_v2'));
  assert.equal(insert.args[1],'FINAL_CHAIN_CANDIDATE');
  assert.match(String(insert.args[0]),/^final-chain:info-morning-test:/);
  assert.match(String(insert.args[2]),/^INFO_MORNING_TEST\|/);
});

test('scheduled non-morning cycle sends at most one WAIT observation',async()=>{
  const db=new FakeDB(); const calls=[];
  const out=await runTelegramOutputLayer({db,startedTs:NOW,source:'schedule',relayUrl:'https://relay.test',relayKey:'secret',reportTest:false,shadowDecisionAuto:false,infoEnabled:true,enabled:true,fetchImpl:okFetch(calls)});
  assert.equal(out.morning.sent,false);
  assert.equal(out.early_info.sent,true);
  assert.equal(out.early_info.count,1);
  assert.equal(calls.length,1);
  assert.match(calls[0].text,/RAY/);
  assert.doesNotMatch(calls[0].text,/AKE/);
  const insert=db.writes.find((x)=>x.sql.includes('INSERT OR IGNORE INTO telegram_output_dispatch_journal_v2'));
  assert.equal(insert.args[1],'FINAL_CHAIN_CANDIDATE');
  assert.match(String(insert.args[0]),/^final-chain:info-wait:/);
  assert.equal(insert.args[2],'INFO_WAIT|RAY-USDT|LONG');
});

test('output disabled means no informational network send',async()=>{
  const db=new FakeDB(); const calls=[];
  const out=await runTelegramOutputLayer({db,startedTs:NOW,source:'schedule',relayUrl:'https://relay.test',relayKey:'secret',reportTest:false,shadowDecisionAuto:true,infoEnabled:true,enabled:false,fetchImpl:okFetch(calls)});
  assert.equal(out.enabled,false);
  assert.equal(calls.length,0);
});


test('informational namespace is isolated from real final-chain source refs',async()=>{
  const db=new FakeDB(); const calls=[];
  const out=await runTelegramOutputLayer({db,startedTs:NOW,source:'schedule',relayUrl:'https://relay.test',relayKey:'secret',reportTest:false,shadowDecisionAuto:false,infoEnabled:true,enabled:true,fetchImpl:okFetch(calls)});
  assert.equal(out.early_info.sent,true);
  const insert=db.writes.find((x)=>x.sql.includes('INSERT OR IGNORE INTO telegram_output_dispatch_journal_v2'));
  assert.equal(insert.args[1],'FINAL_CHAIN_CANDIDATE');
  assert.equal(insert.args[2],'INFO_WAIT|RAY-USDT|LONG');
  assert.notEqual(insert.args[2],'RAY-USDT|LONG');
  assert.match(String(insert.args[0]),/^final-chain:info-/);
});
