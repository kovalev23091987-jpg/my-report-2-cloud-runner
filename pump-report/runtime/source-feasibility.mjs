import {ownerInstrumentExcluded} from '../contracts/index.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../registry/index.mjs';

// A fixed source acceptance operation, never a trading signal or Telegram path.
export async function runSourceFeasibility({sources,broker,store,run_id,clock=Date.now,captured=[]}){
  await broker.awaitProviderWindow({provider:'BINGX',cost:3,deadline_ts:clock()+60001});
  const instruments=BINGX_IDENTITY_REGISTRY.map(r=>r.instrument).filter(i=>!ownerInstrumentExcluded(i));
  const instrument=instruments.find(i=>i.native_symbol==='SOL-USDT');
  if(!instrument)throw Error('SAVED_SOL_NATIVE_IDENTITY_UNBOUND');
  let optional=null,history=null,overview=null;
  const finish=async status=>{
    const result={schema:'PUMP_SOURCE_FEASIBILITY_ACTUAL_V1',run_id,status,run_purpose:'ACCEPTANCE_TEST',instrument,history,optional,overview,raw_responses:captured,publication_allowed:false,Telegram_attempts:0,current_catalog_refreshed:false,all550_operationally_qualified:false};
    const {raw_responses,...summary}=result;await store.set('pump:source-feasibility:'+run_id,summary);return result;
  };
  optional=await sources.getOptional({instrument,run_id,mode:'MANUAL'});if(broker.operationFailed())return finish('INCOMPLETE');
  history=await sources.getCore({instrument,run_id,mode:'MANUAL',force_refresh:true,only_facts:['candles']});if(broker.operationFailed())return finish('INCOMPLETE');
  overview=await sources.getOverview({run_id,instruments});return finish(broker.operationFailed()?'INCOMPLETE':'OBSERVED');
}
