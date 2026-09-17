/**
 * TZ 10.1 R3: bounded, factual HTX order-book execution measurements.
 * No network, account access, scoring, order placement or invented veto CLEAR.
 * One requested reference notional produces two explicitly measured whole-lot
 * quantities. For EACH direction the exit is checked for its SAME contracts,
 * not for another order of the same USDT notional. These are snapshots, not
 * guarantees of a future fill, and exclude fees and funding.
 */
import { stableJson } from './upstream-proof-utils.mjs';
export const EXECUTION_FACTS_VERSION = 'tz101-htx-execution-facts-r3';
export const EXECUTION_FACTS_LIMITS = Object.freeze({book_age_ms:15_000, instrument_age_ms:60_000, max_levels_per_side:200});
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const stamp = x => typeof x === 'number' && Number.isSafeInteger(x) && x >= 1_000_000_000_000;
function number(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x !== 'string' || !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(x.trim())) return null;
  const n=Number(x);return Number.isFinite(n)?n:null;
}
const text = x => typeof x === 'string' && x.trim() === x && x.length > 0 && x.length <= 128;
function failure(reason, check='UNKNOWN', facts=null) {
  return {version:EXECUTION_FACTS_VERSION,status:'NOT_CLOSED',check,reasons:[reason],facts,plans:null,
    measured_only:true,position_assumed:false,execution_authorized:false};
}
function levels(raw, side, tick) {
  if (!Array.isArray(raw)) throw new Error('BOOK_SIDE_MISSING');
  if (raw.length>EXECUTION_FACTS_LIMITS.max_levels_per_side) throw new Error('BOOK_DEPTH_EXCEEDS_AUDITED_BOUND');
  const out=[];
  for(const row of raw) {
    if(!Array.isArray(row)||row.length!==2) throw new Error('BOOK_LEVEL_SHAPE_INVALID');
    const p=number(row[0]),q=number(row[1]);
    if(p===null||p<=0||q===null||!Number.isSafeInteger(q)||q<=0) throw new Error('BOOK_PRICE_OR_CONTRACT_QUANTITY_INVALID');
    const ticks=p/tick;
    if(!Number.isFinite(ticks)||Math.abs(ticks-Math.round(ticks))>1e-7) throw new Error('BOOK_PRICE_OFF_TICK');
    const prev=out.at(-1)?.[0];
    if(prev!==undefined && (side==='BUY'?p<=prev:p>=prev)) throw new Error('BOOK_UNSORTED_OR_DUPLICATE_PRICE');
    out.push([p,q]);
  }
  return out;
}
function fill(book, count, size, side) {
  let remaining=count,filled=0,quote=0,used=0;
  for(const [price,qty] of book) {
    if(remaining===0) break;
    const take=Math.min(qty,remaining);
    filled+=take;remaining-=take;quote+=take*size*price;used++;
  }
  const base=filled*size, vwap=base>0?quote/base:null;
  const reference=book[0]?.[0]??null;
  if(![quote,base].every(Number.isFinite)|| (vwap!==null&&!Number.isFinite(vwap))) throw new Error('EXECUTION_ARITHMETIC_OVERFLOW');
  const slip=vwap!==null&&reference!==null?(side==='BUY'?vwap/reference-1:1-vwap/reference)*10_000:null;
  if(slip!==null && (!Number.isFinite(slip)||slip < -1e-7)) throw new Error('EXECUTION_SLIPPAGE_INCONSISTENT');
  return {book_side:side,requested_contracts:count,filled_contracts:filled,unfilled_contracts:remaining,
    contract_size_base:size,base_quantity:base,filled_notional_usdt:quote,reference_price:reference,vwap,
    slippage_vs_same_book_top_bps:slip,levels_used:used,fully_filled:remaining===0};
}
function plan(direction,entryBook,exitBook,referenceNotional,size) {
  const entrySide=direction==='LONG'?'BUY':'SELL',exitSide=direction==='LONG'?'SELL':'BUY';
  const ref=entryBook[0]?.[0];
  if(!Number.isFinite(ref)) return {direction,status:'NOT_CLOSED',check:'REFUTED',reasons:['ENTRY_BOOK_EMPTY'],entry:null,exit:null};
  const unitValue=ref*size;
  if(!Number.isFinite(unitValue)||unitValue<=0) throw new Error('REFERENCE_UNIT_VALUE_INVALID');
  const contracts=Math.floor(referenceNotional/unitValue);
  if(!Number.isSafeInteger(contracts)||contracts<=0) return {direction,status:'NOT_CLOSED',check:'UNKNOWN',reasons:['REFERENCE_SIZE_BELOW_ONE_CONTRACT_OR_OUT_OF_RANGE'],entry:null,exit:null};
  const entry=fill(entryBook,contracts,size,entrySide),exit=fill(exitBook,contracts,size,exitSide);
  const reasons=[];
  if(!entry.fully_filled) reasons.push('ENTRY_CAPACITY_INSUFFICIENT');
  if(!exit.fully_filled) reasons.push('EXIT_CAPACITY_INSUFFICIENT_FOR_SAME_CONTRACTS');
  return {direction,status:reasons.length?'NOT_CLOSED':'CLOSED',check:reasons.length?'REFUTED':'CONFIRMED',reasons,
    reference_notional_usdt:referenceNotional,reference_sizing_price:ref,measured_contracts:contracts,
    measured_base_quantity:contracts*size,measured_reference_notional_usdt:contracts*unitValue,
    sizing_semantics:'WHOLE_CONTRACTS_AT_ENTRY_BOOK_TOP_NOT_A_PERSONAL_POSITION_OR_SPEND_CAP',
    entry,exit,round_trip_quote_loss_ex_fees_funding:entry.fully_filled&&exit.fully_filled?
      (direction==='LONG'?entry.filled_notional_usdt-exit.filled_notional_usdt:exit.filled_notional_usdt-entry.filled_notional_usdt):null};
}
/** Called only with the ACTUAL responses already fetched by futuresSnapshot. */
export function prepareHtxExecutionFacts({contract_code,requested_notional_usdt,info_response,depth_response,received_ts}={}) {
  try {
    if(!text(contract_code)||!contract_code.endsWith('-USDT')||!stamp(received_ts)||
      typeof requested_notional_usdt!=='number'||!Number.isFinite(requested_notional_usdt)||requested_notional_usdt<=0) return failure('EXECUTION_INPUT_IDENTITY_SIZE_OR_TIME_INVALID');
    if(info_response?.ok!==true||depth_response?.ok!==true||info_response?.data?.status!=='ok'||depth_response?.data?.status!=='ok') return failure('SOURCE_REQUEST_NOT_SUCCESSFUL');
    const i=info_response.data,d=depth_response.data;
    if(!Array.isArray(i.data)) return failure('CONTRACT_LIST_MISSING');
    const matches=i.data.filter(r=>r?.contract_code===contract_code);
    if(matches.length!==1) return failure('EXACT_UNIQUE_CONTRACT_NOT_CONFIRMED');
    const contract=matches[0], size=number(contract.contract_size),tick=number(contract.price_tick), state=number(contract.contract_status);
    if(size===null||size<=0||tick===null||tick<=0||!Number.isSafeInteger(state)||state<0||state>8) return failure('CONTRACT_SPECIFICATION_INVALID');
    if(!stamp(i.ts)||i.ts>received_ts||received_ts-i.ts>EXECUTION_FACTS_LIMITS.instrument_age_ms) return failure('INSTRUMENT_TIMESTAMP_MISSING_STALE_OR_FUTURE');
    if(state!==1) return failure('HTX_CONTRACT_NOT_TRADING','REFUTED',{contract_code,contract_status:state,instrument_source_ts:i.ts,received_ts});
    if(d.ch!==`market.${contract_code}.depth.step0`) return failure('DEPTH_CHANNEL_IDENTITY_NOT_CONFIRMED');
    if(!obj(d.tick)||!stamp(d.tick.ts)||!stamp(d.ts)||d.tick.ts>d.ts||d.ts>received_ts||received_ts-d.tick.ts>EXECUTION_FACTS_LIMITS.book_age_ms) return failure('BOOK_TIMESTAMP_MISSING_STALE_OR_FUTURE');
    const bids=levels(d.tick.bids,'SELL',tick),asks=levels(d.tick.asks,'BUY',tick);
    if(bids.length&&asks.length&&bids[0][0]>=asks[0][0]) return failure('BOOK_LOCKED_OR_CROSSED');
    const facts={schema:EXECUTION_FACTS_VERSION,contract_code,venue:'HTX',market:'USDT_M_PERPETUAL',
      contract_size_base:size,price_tick:tick,contract_status:state,instrument_source_ts:i.ts,
      depth_channel:d.ch,book_source_ts:d.tick.ts,response_generated_ts:d.ts,received_ts,
      availability_semantics:'LOCAL_FUTURES_SNAPSHOT_RESPONSES_COMPLETED',
      max_book_age_ms:EXECUTION_FACTS_LIMITS.book_age_ms,
      valid_until_ts:Math.min(d.tick.ts+EXECUTION_FACTS_LIMITS.book_age_ms,i.ts+EXECUTION_FACTS_LIMITS.instrument_age_ms),
      requested_reference_notional_usdt:requested_notional_usdt,bids,asks,
      source_scope:'RETURNED_STEP0_BOOK_ONLY_NOT_ALL_LIQUIDITY',fees_included:false,funding_included:false};
    const plans={LONG:plan('LONG',asks,bids,requested_notional_usdt,size),SHORT:plan('SHORT',bids,asks,requested_notional_usdt,size)};
    const closed=Object.values(plans).every(p=>p.status==='CLOSED');
    return {version:EXECUTION_FACTS_VERSION,status:closed?'PREPARED_UNACKNOWLEDGED':'NOT_CLOSED',
      check:closed?'CONFIRMED':Object.values(plans).some(p=>p.check==='REFUTED')?'REFUTED':'UNKNOWN',
      reasons:[...new Set(Object.values(plans).flatMap(p=>p.reasons))],facts,plans,
      measured_only:true,position_assumed:false,execution_authorized:false};
  } catch(e) { return failure(typeof e?.message==='string'?e.message:'MALFORMED_EXECUTION_INPUT'); }
}
/** Recompute from persisted source facts; caller-supplied CLOSED is never proof. */
export function verifyExecutionFacts(prepared,{contract_code,observed_ts}={}) {
  try {
    if(!obj(prepared)||prepared.version!==EXECUTION_FACTS_VERSION||!obj(prepared.facts)||!stamp(observed_ts)) return failure('FACTUAL_EXECUTION_SNAPSHOT_MISSING');
    const f=prepared.facts;
    if(f.contract_code!==contract_code) return failure('EXECUTION_SNAPSHOT_CONTRACT_MISMATCH');
    if(!stamp(f.received_ts)||f.received_ts>observed_ts||!stamp(f.valid_until_ts)||observed_ts>f.valid_until_ts) return failure('EXECUTION_FACTS_STALE_OR_FUTURE');
    const rebuilt=prepareHtxExecutionFacts({contract_code,requested_notional_usdt:f.requested_reference_notional_usdt,received_ts:f.received_ts,
      info_response:{ok:true,data:{status:'ok',ts:f.instrument_source_ts,data:[{contract_code,contract_size:f.contract_size_base,price_tick:f.price_tick,contract_status:f.contract_status}]}},
      depth_response:{ok:true,data:{status:'ok',ch:f.depth_channel,ts:f.response_generated_ts,tick:{ts:f.book_source_ts,bids:f.bids,asks:f.asks}}}});
    // Exact canonical producer output is small/bounded; any mutation fails closed.
    if(stableJson(prepared)!==stableJson(rebuilt)) return failure('EXECUTION_FACTS_CONTENT_MISMATCH');
    return rebuilt;
  } catch {return failure('MALFORMED_EXECUTION_FACTS');}
}
/** Current freshness only: not permission to publish, trade or bypass another gate. */
export function checkExecutionHandoff(gate,{contract_code,checked_ts}={}) {
  if(!stamp(checked_ts)||gate?.contract_code!==contract_code) return {ok:false,reason:'EXECUTION_HANDOFF_IDENTITY_OR_TIME_INVALID'};
  const p=verifyExecutionFacts(gate?.factual_basis,{contract_code,observed_ts:checked_ts});
  if(!p.plans || !['LONG','SHORT'].some(d=>p.plans[d]?.status==='CLOSED')) return {ok:false,reason:p.reasons[0]||'EXECUTION_HANDOFF_NOT_CLOSED'};
  return {ok:true,reason:null,checked_ts,valid_until_ts:p.facts.valid_until_ts};
}
