// Two bounded PK reads inside the separately admitted maintenance reservation.
export const EXACT_ACTIVITY_RUN_ID='1372a2e6-3736-448e-b32d-846e37bafc80';
export async function readExactActivityAnalysis({store,run_id,implementation_sha256}){
  if(run_id!==EXACT_ACTIVITY_RUN_ID||!/^[a-f0-9]{64}$/.test(implementation_sha256??''))throw Error('EXACT_ACTIVITY_RUN_SCOPE_REQUIRED');
  const run=await store.get('pump:run:'+run_id);
  if(run?.run_id!==run_id||!Array.isArray(run.checked))return {status:'EXACT_RUN_NOT_FOUND',private_evidence:null};
  const item=run.checked[0],key=item?.analysis_key;
  if(typeof key!=='string'||!key.startsWith('pump:analysis:')||key.length>512||/[\u0000-\u001f]/.test(key)||item?.analysis?.run_id!==run_id)return {status:'EXACT_RUN_HAS_NO_BOUND_FIRST_ANALYSIS',private_evidence:null};
  const original=await store.get(key);
  if(original?.implementation_sha256!==implementation_sha256||original.evidence_class!=='OBSERVED'||
    original.input?.run_id!==run_id||original.input.mode!=='AUTO'||original.analysis?.run_id!==run_id||
    original.input.instrument?.instrument_id!==original.analysis.instrument?.instrument_id||
    JSON.stringify(original.analysis)!==JSON.stringify(item.analysis))return {status:'ORIGINAL_ANALYSIS_BINDING_UNPROVEN',private_evidence:null};
  return {status:'EXACT_RUN_AND_ORIGINAL_ANALYSIS_BOUND',run_id,implementation_sha256,
    analysis_key:key,ready:original.analysis.ready===true,
    analytical_reason_codes:(original.analysis.reasons??[]).map(r=>typeof r==='string'&&/^[A-Z0-9_]{1,100}$/.test(r)?r:'OTHER_CODE'),
    private_evidence:{run,original}};
}
