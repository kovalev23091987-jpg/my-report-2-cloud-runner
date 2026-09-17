import fs from 'node:fs';
const text=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
function extract(name,next){const a=text.indexOf(`function ${name}`); if(a<0) throw new Error(name); const b=text.indexOf(next,a); if(b<0) throw new Error(next); return text.slice(a,b);}
const src=extract('buildStage392TelegramShadowMessage','function validateAlertDispatch');
const build=(0,eval)(`(${src.replace(/^function\s+buildStage392TelegramShadowMessage/,'function')})`);
const base={
 decision_id:'FD:1', mode:'SHADOW_ONLY_NO_EXECUTION', decision_status:'SHADOW_EVALUATED', contract_code:'ETHFI-USDT', observation_ts:Date.now(), direction:'LONG', directional_quality:'CLOSED', entry_action:'SHADOW_ENTRY_ELIGIBLE', entry_quality:'CLOSED', data_quality:'CLOSED', execution_quality:'CLOSED', campaign_phase:'ENTRY_TRIGGER', timing_state:'ENTRY_WINDOW', risk_state:'CLEAR', position_state:'FLAT', management_action:'NOT_EVALUATED', management_intent:'NOT_EVALUATED', management_quality:'NOT_EVALUATED', hard_veto:0, hard_veto_state:'CLEAR', shadow_only:1, live_probability:null, validated_signal:0, execution_authorized:0, telegram_eligible:0,
};
let r=build(base); if(!r.ok) throw new Error(JSON.stringify(r));
if(!r.message.includes('НЕ ТОРГОВЫЙ СИГНАЛ')) throw new Error('label');
if(r.message.includes('%')) throw new Error('probability leaked');
for (const [k,v] of [['validated_signal',1],['execution_authorized',1],['telegram_eligible',1],['live_probability',75]]) {
 const x={...base,[k]:v}; const z=build(x); if(z.ok) throw new Error(`fail-open ${k}`);
}
r=build({...base,management_action:'EXIT',management_intent:'EXIT_REQUIRED',position_state:'OPEN_LONG'}); if(!r.ok||!r.message.includes('Выход')) throw new Error('exit');
console.log('TELEGRAM_STAGE392_MESSAGE=PASS');
