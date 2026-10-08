// Reallocate one otherwise unusable request, never current level evidence.
// Unknown routes and any route that can use the following two-request reserve
// keep the reserve. The shared budget and explicit caller cap still decide.
export const SELECTED_NATIVE_SOURCE_PLAN='SELECTED_NATIVE_SOURCE_PLAN_V1';
const code=v=>typeof v==='string'&&/^[^-\s]+-USDT$/u.test(v);
const cannotUseTwo=new Set(['GTRADE_NATIVE','DYDX_PINNED_NATIVE','LIGHTER_NATIVE','GMX_NATIVE','COINLOBSTER_FUTURE_MODEL','BYKARANTELI_FUTURE_MAP','BYK_TRACKED_HL_BANDS']);
export function oneUnusablePairReserveMayFinishPosition({plan,run_id,contract,batch,current_allowed,coverage,now}={}){
 if(plan?.schema!==SELECTED_NATIVE_SOURCE_PLAN||plan.run_id!==run_id||typeof run_id!=='string'||!run_id.trim()||!code(contract)||!Number.isSafeInteger(now))return false;
 if(!Array.isArray(batch)||batch.length!==2||new Set(batch).size!==2||!batch.every(code)||!batch.includes(contract))return false;
 const entries=plan.entries;
 if(!Array.isArray(entries)||entries.length!==2||new Set(entries.map(e=>e?.contract)).size!==2||entries.some(e=>!batch.includes(e?.contract)||e.eligible!==true||!Array.isArray(e.source_ids)||!e.source_ids.length||e.source_ids.length>12||new Set(e.source_ids).size!==e.source_ids.length||e.source_ids.some(id=>typeof id!=='string')))return false;
 const current=entries.find(e=>e.contract===contract),other=entries.find(e=>e.contract!==contract);
 if(!Array.isArray(current_allowed)||current_allowed.length!==current.source_ids.length||current.source_ids.some(id=>!current_allowed.includes(id))||!current.source_ids.includes('GTRADE_NATIVE'))return false;
 const fresh=c=>c&&c.run_id===run_id&&Number.isSafeInteger(c.source_ts)&&c.source_ts<=now&&now-c.source_ts<=300000;
 const a=coverage?.[contract],b=coverage?.[other.contract];
 if(!fresh(a)||!fresh(b)||a.source_ts!==b.source_ts||a.status!=='SUPPORTED'||b.status!=='UNSUPPORTED')return false;
 // The exact current catalog makes gTrade's following route a zero-request
 // unsupported answer. dYdX needs three requests or a free same-run snapshot;
 // Lighter/GMX need four. The other named sources are not shared native lanes.
 // Hyperliquid, archive and unknown routes remain protected without guessing.
 return other.source_ids.includes('GTRADE_NATIVE')&&other.source_ids.every(id=>cannotUseTwo.has(id));
}
