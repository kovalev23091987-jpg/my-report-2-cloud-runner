// A fetch-capacity check of retained qualifications, never current market data
// or a signal gate. Missing units keep an asset in discovery but defer deep IO.
export function createSourceEvidenceAdmission(registry){
  if(typeof registry?.resolve!=='function')throw Error('SOURCE_EVIDENCE_REGISTRY_REQUIRED');
  return instrument=>{
    const entry=registry.resolve({instrument_id:instrument?.instrument_id});
    const bound=entry&&['native_symbol','asset_id','venue','market_type','quote','settle'].every(k=>entry.instrument[k]===instrument[k]);
    if(!bound)return {eligible:false,reason:'NATIVE_CORE_IDENTITY_EVIDENCE_REQUIRED',market_data_checked:false};
    const q=entry.qualifications?.orderbook;
    return q&&typeof q.evidence_ref==='string'&&q.evidence_ref.length>0?
      {eligible:true,market_data_checked:false}:
      {eligible:false,reason:'NATIVE_CORE_UNIT_EVIDENCE_REQUIRED',market_data_checked:false};
  };
}
