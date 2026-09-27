import {createLiquidationAcquisition} from './liq-canonical-context.mjs';
export async function acquireLiquidationsForDeepCheck(service,{contract,run_id,cycle_started_ts}={}){
 if(!service||service.mode!=='SHADOW_ONLY'||typeof service.collect!=='function')return null;
 if(typeof contract!=='string'||!contract||!Number.isSafeInteger(cycle_started_ts))return null;
 const run=typeof run_id==='string'&&run_id.trim()?run_id.trim():`manual-shadow-${cycle_started_ts}`;
 try{
  const collection=await service.collect({contract,run_id:run,acquisition_id:`LQACQ:${contract}:${cycle_started_ts}`,cycle_started_ts});
  if(collection?.status!=='NATIVE_VALIDATED_SAMPLE_COLLECTED'||!collection.receipt)return null;
  return createLiquidationAcquisition({contract,run_id:run,acquisition_id:`LQACQ:${contract}:${cycle_started_ts}`,
   receipts:[collection.receipt],requests:collection.requests,started_ts:collection.started_ts??cycle_started_ts,
   completed_ts:collection.completed_ts??collection.receipt.analysis_as_of_ms});
 }catch(error){
  // Failure is diagnostic; source errors cannot block the old scan or create health spam.
  if(typeof service.diagnostic==='function')service.diagnostic({status:'LIQ_EXTENSION_NOT_CLOSED',reason:'COLLECTION_OR_BINDING_FAILED'});
  return null;
 }
}
