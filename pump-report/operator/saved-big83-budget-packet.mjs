export const BIG83_BUDGET_AUTO_RUN_ID='5c6b2756-187d-4766-b7fa-94453474151a';
export const BIG83_BUDGET_IMPLEMENTATION='da52262978c5bb1037993b72d8b98c6185182e0a98d69fa3846ee6e21b7ed688';

// Exactly two saved PKs. This does not execute the trading analysis or budget
// broker and cannot collect prices, create a candidate or send a message.
export async function readSavedBig83BudgetPacket({store,run_id,implementation_sha256,clock=Date.now}){
  if(run_id!==BIG83_BUDGET_AUTO_RUN_ID||implementation_sha256!==BIG83_BUDGET_IMPLEMENTATION||typeof store?.get!=='function')throw Error('EXACT_BIG83_BUDGET_PACKET_REQUIRED');
  const started_ts=clock();
  const run=await store.get('pump:run:'+BIG83_BUDGET_AUTO_RUN_ID);
  const resources=await store.get('pump:resources');
  // The deployed run record has no mode/pin field. Those come from the exact
  // scheduled log; inventing such a field would incorrectly reject its record.
  const bound=run?.run_id===run_id&&Array.isArray(run.checked)&&Array.isArray(run.deferred);
  const code=value=>typeof value==='string'&&/^[A-Z0-9_]{1,100}$/.test(value)?value:'OTHER_OR_MISSING_CODE';
  return {schema:'PUMP_SAVED_BIG83_BUDGET_PACKET_V1',status:bound?'EXACT_SAVED_AUTO_AND_CURRENT_RESOURCE_PACKET_READ':'EXACT_SAVED_AUTO_BINDING_UNPROVEN',
    started_ts,observed_ts:clock(),run_id,expected_implementation_sha256:implementation_sha256,
    implementation_binding_basis:'Named scheduled log proves expected pin; saved run identity checked separately. No invented saved-run implementation field.',
    exact_saved_run_bound:bound,resource_state_valid_schema:resources?.schema==='PUMP_SHARED_RESOURCE_V1',business_PK_reads:2,
    deferred_codes:bound?run.deferred.slice(0,8).map(x=>({status:code(x.status),reason:code(x.source_coverage?.reason),detail:code(x.source_coverage?.detail)})):[],
    resource_snapshot_is_current_not_historical:true,market_HTTP:0,Telegram:0,business_writes:0,
    private_evidence:{run,resources}};
}
