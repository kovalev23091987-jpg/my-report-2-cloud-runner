import {readSavedAutoObservation} from './saved-auto-observation.mjs';
import {readSavedOutcomeObservation} from './saved-outcome-observation.mjs';

// Revalidate one known historical delivery and its saved outcome. The live
// observer implementation and the original producer remain distinct cohorts.
export async function readKnownMatureOutcome({store,target,expected_recipient_sha256,clock=Date.now}){
  if(!store?.get||!/^PUMP:[a-f0-9]{64}$/.test(target?.card_id??'')||!/^pump:analysis:[a-f0-9]{64}$/.test(target?.analysis_key??'')||
    !/^[a-f0-9]{64}$/.test(target?.producer_implementation_sha256??'')||!Number.isSafeInteger(target?.deadline_ts)||
    typeof target?.instrument_id!=='string'||!target.instrument_id.startsWith('BINGX:USDT_M:')||target.instrument_id.length>180||
    typeof target?.wave_id!=='string'||!target.wave_id||target.wave_id.length>180||target.native_symbol!=='MAGMA-USDT'||String(target.message_id)!=='243')throw Error('EXACT_KNOWN_MAGMA_TARGET_REQUIRED');
  if(clock()<target.deadline_ts)throw Error('KNOWN_OUTCOME_NOT_DUE');
  const cardKey='pump:card:'+target.card_id,signal='pump:signal:'+target.instrument_id+':'+target.wave_id;
  const allowed=new Set([cardKey,target.analysis_key,signal,'pump:journal:'+target.instrument_id+':'+target.wave_id,'pump:outcome:'+signal]);
  const cached=new Map();let reads=0;
  const get=async key=>{
    if(!allowed.has(key))throw Error('OUTCOME_READER_OUTSIDE_EXACT_FIVE_KEYS');
    if(!cached.has(key)){if(++reads>5)throw Error('OUTCOME_READER_BUSINESS_BOUND');cached.set(key,await store.get(key));}
    return cached.get(key);
  };
  const card=await get(cardKey);
  if(!card||card.card_id!==target.card_id||String(card.message_id)!==String(target.message_id)||card.analysis?.source_input_key!==target.analysis_key||
    card.analysis?.instrument?.instrument_id!==target.instrument_id||card.analysis.instrument.native_symbol!==target.native_symbol||card.analysis.wave_id!==target.wave_id||
    card.analysis.analysis_ts+14400000!==target.deadline_ts)throw Error('KNOWN_CARD_TARGET_MISMATCH');
  const view={get,async scanPrefix(prefix){if(prefix!=='pump:card:')throw Error('KNOWN_CARD_PREFIX_REQUIRED');return [{key:cardKey,value:card}];}};
  const observation=await readSavedAutoObservation({store:view,implementation_sha256:target.producer_implementation_sha256,expected_recipient_sha256,
    clock,include_executor:false,after_key:cardKey.slice(0,-1)});
  observation.scope.known_exact_card_PK_projection=true;
  observation.scope.physical_prefix_scan_performed=false;
  const saved_outcome=await readSavedOutcomeObservation({store:{get},observation});
  return {schema:'ROOT_KNOWN_MATURE_OUTCOME_READER_V1',selected_producer_implementation_sha256:target.producer_implementation_sha256,
    historical_delivery_not_relabelled_current:true,observation,saved_outcome,business_PK_reads:reads,maximum_business_PK_reads:5,
    source_prices_or_strategy_recomputed:false,market_HTTP:0,Telegram:0};
}
