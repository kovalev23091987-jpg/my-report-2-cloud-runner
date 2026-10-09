import {createHash} from 'node:crypto';
export const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
export function canonicalHash(c){const copy={...c};delete copy.analytical_fingerprint;return createHash('sha256').update(JSON.stringify(stable(copy))).digest('hex');}
const compare=(p,op,v)=>op==='>='?p>=v:op==='>'?p>v:op==='<='?p<=v:op==='<'?p<v:false;
export function sampledOriginalTrigger(c,points,{window_end}={}){
 const t=c?.trigger,cancel=/^price\s*(>=|<=|>|<)\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)$/i.exec(String(t?.cancel_condition||''));
 const base={actual_ENTRY:false,settlement_confirmed:false,intraminute_extrema_known:false};
 if(!['OBSERVE','WAIT_FOR_TRIGGER'].includes(c?.state)||!['LONG','SHORT'].includes(c?.direction)||t?.metric!=='price'||t?.unit!=='USDT'||!['>=','>','<=','<'].includes(t?.operator)||!(Number.isFinite(t?.value)&&t.value>0)||!cancel||![c.observed_ts,t.next_recheck_ts,t.expires_ts,window_end].every(Number.isSafeInteger)||t.next_recheck_ts<c.observed_ts||t.expires_ts<=t.next_recheck_ts)return{...base,status:'ORIGINAL_TRIGGER_NOT_ELIGIBLE'};
 const eligible=(points||[]).filter(p=>Number.isSafeInteger(p.ts)&&Number.isFinite(p.price)&&p.price>0&&p.ts>=t.next_recheck_ts&&p.ts<t.expires_ts&&p.ts<=window_end).sort((a,b)=>a.ts-b.ts);
 if(new Set(eligible.map(p=>p.ts)).size!==eligible.length)return{...base,status:'DUPLICATE_PRICE_CLOCK'};
 const expected=[];for(let ts=Math.ceil(t.next_recheck_ts/300000)*300000;ts<t.expires_ts&&ts<=window_end;ts+=300000)expected.push(ts);
 const actual=new Set(eligible.map(p=>Math.floor(p.ts/300000)*300000)),missing=expected.filter(ts=>!actual.has(ts));
 let crossing=null,cancellation=null;
 for(const p of eligible){if(compare(p.price,cancel[1],Number(cancel[2]))){cancellation=p;break;}if(compare(p.price,t.operator,t.value)&&!crossing)crossing=p;}
 return{...base,status:crossing?'SAMPLED_UNCANCELLED_ORIGINAL_TRIGGER_CROSSING':cancellation?'SAMPLED_ORIGINAL_CANCELLATION':'NO_SAMPLED_ORIGINAL_TRIGGER_CROSSING',first_crossing:crossing,first_cancellation:cancellation,samples:eligible.length,expected_samples:expected.length,missing_slots:missing,coverage_complete:missing.length===0&&expected.length>0,original_window_complete:t.expires_ts<=window_end,minimum_sampled_price:eligible.length?Math.min(...eligible.map(p=>p.price)):null,maximum_sampled_price:eligible.length?Math.max(...eligible.map(p=>p.price)):null};
}
