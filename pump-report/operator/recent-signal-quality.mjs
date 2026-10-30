import {readSavedAutoObservation} from './saved-auto-observation.mjs';

// One bounded saved page and at most three immutable originals. No engine,
// provider request, delivery action or business-state mutation is performed.
export async function readRecentSignalQuality({store,implementation_sha256,expected_recipient_sha256,confirmed_not_before_ts,clock=Date.now}){
  if(!Number.isSafeInteger(confirmed_not_before_ts)||confirmed_not_before_ts>clock())throw Error('INSTALL_CLOCK_REQUIRED');
  const page=await store.scanPrefix('pump:card:',{after_key:'pump:card:',limit:20});
  if(!Array.isArray(page)||page.length>20)throw Error('CARD_PAGE_BOUND');
  const eligible=page.filter(r=>r.value?.state==='SENT'&&r.value.mode==='AUTO'&&r.value.analysis?.run_purpose==='PRODUCTION'&&Number.isSafeInteger(r.value.receipt?.confirmed_ts)&&r.value.receipt.confirmed_ts>=confirmed_not_before_ts);
  const byWave=new Map();
  for(const r of eligible){const a=r.value.analysis,k=JSON.stringify([a.instrument?.instrument_id,a.wave_id]);const v=byWave.get(k)??[];v.push({card_id:r.value.card_id,confirmed_ts:r.value.receipt.confirmed_ts,update_kind:a.update_kind??null});byWave.set(k,v);}
  const duplicates=[...byWave.values()].filter(v=>v.length>1);
  const selected=[...eligible].sort((a,b)=>b.value.receipt.confirmed_ts-a.value.receipt.confirmed_ts||a.key.localeCompare(b.key)).slice(0,3),observations=[];
  for(const row of selected){
    // The original verifier still re-reads the exact card and original. Its
    // selector receives only this previously bounded row, without another scan.
    const proxy={get:key=>store.get(key),scanPrefix:async(prefix,options)=>{
      if(prefix!=='pump:card:'||options.limit!==20||options.after_key!=='pump:card:')throw Error('OBSERVER_SELECTOR_CHANGED');return [row];}};
    const observation=await readSavedAutoObservation({store:proxy,implementation_sha256,expected_recipient_sha256,include_executor:false,confirmed_not_before_ts,clock});
    if(observation.private_evidence.card?.card_id!==row.value.card_id)throw Error('SELECTED_CARD_CHANGED');
    const a=observation.private_evidence.card.analysis;
    if(typeof a.instrument?.instrument_id!=='string'||typeof a.wave_id!=='string')throw Error('WAVE_REFERENCE_REQUIRED');
    const delivery_wave=await store.get('pump:delivery-wave:'+a.instrument.instrument_id+':'+a.wave_id);
    observations.push({observation,delivery_wave,selected_confirmed_ts:row.value.receipt.confirmed_ts});
  }
  return {schema:'PUMP_RECENT_SAVED_SIGNAL_QUALITY_V1',observed_ts:clock(),scope:{one_page_limit:20,page_rows:page.length,page_exhausted:page.length<20,selected_max:3,selected_actual:selected.length,selection:'LATEST_CONFIRMED_WITHIN_THIS_BOUNDED_PAGE',whole_history_claimed:false,whole_market_claimed:false,business_queries_max:10,total_queries_max:14,shared_query_cap:16,rows_read_cap:500,rows_write_cap:30},sent_eligible_in_page:eligible.length,duplicate_same_wave_groups:duplicates,observations,market_HTTP:0,Telegram:0,reanalysis:false};
}
