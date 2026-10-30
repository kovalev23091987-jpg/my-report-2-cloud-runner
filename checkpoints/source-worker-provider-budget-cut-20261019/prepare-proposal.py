"""Prepare own-prefix temporary runtimes and ONE shared textpatch; no app execution."""
import difflib
import hashlib
import json
import pathlib
import shutil
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BASE = 'cddaa7964b3f12b821440c3a6f0e5700e83c336e'
TARGETS = [
 'current-generation/files/src/provider-reference-cache.mjs',
 'current-generation/files/src/coingecko-sector-evidence.mjs',
 'current-generation/files/src/coinpaprika-sector-evidence.mjs',
 'current-generation/files/src/run-budget-context.mjs',
 'current-generation/files/runner-main.mjs',
]
before = {p: (ROOT / p).read_text() for p in TARGETS}
for p in TARGETS:
    assert before[p].encode() == subprocess.check_output(['git', 'show', BASE + ':' + p], cwd=ROOT), ('Fixed working-source bytes required', p)
after = dict(before)


def replace(p, a, b):
    assert after[p].count(a) == 1, (p, a)
    after[p] = after[p].replace(a, b)


p = TARGETS[0]
replace(p, 'minute_provider=null,minute_cap=9}={})', 'minute_provider=null,minute_cap=9,budget_observe=null}={})')
replace(p, "  const day_utc=new Date(readTs).toISOString().slice(0,10);", """  const day_utc=new Date(readTs).toISOString().slice(0,10),budgetAttempt=sequence;
  // Optional synchronous technical observer. It never receives URLs/bodies,
  // never changes the return/cache payload, and never admits or refunds work.
  const observeBudget=(phase,fields)=>{if(typeof budget_observe!=='function')return;try{budget_observe({source,run_id,route,reference_key:key,attempt_sequence:budgetAttempt,query_window_end_ts:readTs,day_utc,phase,native_usage_guard_passed:true,...fields});}catch{}};""")
replace(p, "  if(Number(usage?.attempts)>=daily_cap)", """  observeBudget('DAY_PREFLIGHT_ROW',{row_presence:usage===null?'ABSENT':usage&&typeof usage==='object'?'RETURNED':'UNKNOWN',reported_used_units:usage?.attempts,configured_cap:daily_cap});
  if(Number(usage?.attempts)>=daily_cap)""")
replace(p, "   if(!Number.isSafeInteger(Number(rolling?.units))", """   observeBudget('MINUTE_PREFLIGHT_ROW',{row_presence:rolling===null?'ABSENT':rolling&&typeof rolling==='object'?'RETURNED':'UNKNOWN',provider:String(minute_provider).toUpperCase(),reported_used_units:rolling?.units,configured_cap:minute_cap});
   if(!Number.isSafeInteger(Number(rolling?.units))""")
replace(p, '  if(!daily.allowed){denied=daily;return null;}', """  observeBudget('DAY_RESERVATION_REPLY',{returned_allowed:daily.allowed,returned_status:daily.status,reported_own_reserved_units:daily.attempts,configured_cap:daily_cap});
  if(!daily.allowed){denied=daily;return null;}""")
replace(p, "   if(!minute.allowed){denied={...minute,status:'PROVIDER_RATE_LIMIT_LOCAL'};return null;}", """   observeBudget('MINUTE_RESERVATION_REPLY',{provider:minute.provider,returned_allowed:minute.allowed,returned_status:minute.status,reported_used_units:minute.rolling_units,reported_own_reserved_units:minute.reserved_units,configured_cap:minute.cap,minute_bucket:minute.minute_bucket});
   if(!minute.allowed){denied={...minute,status:'PROVIDER_RATE_LIMIT_LOCAL'};return null;}""")

p = TARGETS[1]
replace(p, 'coingecko_demo_api_key=null}={})', 'coingecko_demo_api_key=null,provider_budget_observe=null}={})')
replace(p, 'minute_provider:\'COINGECKO\',minute_cap:access.minute_cap}', "minute_provider:'COINGECKO',minute_cap:access.minute_cap,budget_observe:typeof provider_budget_observe==='function'?e=>provider_budget_observe({...e,contract,run_id}):null}")

p = TARGETS[2]
replace(p, 'strict_fresh_manual=false}={})', 'strict_fresh_manual=false,provider_budget_observe=null}={})')
replace(p, 'daily_cap:SOURCE_POLICIES[SOURCE].daily_cap}', "daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,budget_observe:typeof provider_budget_observe==='function'?e=>provider_budget_observe({...e,contract,run_id}):null}")

p = TARGETS[3]
replace(p, 'day_admission,native_liquidation}={})', 'day_admission,native_liquidation,provider_receipts}={})')
replace(p, '  provider_day_month_rolling60s_headroom:null,manual_provider_reserve_headroom:null,', """  // Local source-ledger observations are separate from unknown provider-account
  // balances. Their earlier query cuts never authorize a new action here.
  technical_provider_receipt_observations:provider_receipts?.schema==='EXISTING_PROVIDER_LEDGER_OBSERVATIONS_V1'&&provider_receipts.run_id===run_id?provider_receipts:null,
  provider_day_month_rolling60s_headroom:null,manual_provider_reserve_headroom:null,""")
after[p] += r"""

// Invocation-local metadata only; serialized copies are not proof/admission tokens.
export function createProviderBudgetReceiptCapture({clock=Date.now}={}){
 const events=[];let invalid=0,overflow=0;
 const sources=['COINGECKO_SECTOR','COINPAPRIKA_SECTOR'];
 const phases=['DAY_PREFLIGHT_ROW','MINUTE_PREFLIGHT_ROW','DAY_RESERVATION_REPLY','MINUTE_RESERVATION_REPLY'];
 const text=(s,n)=>typeof s==='string'&&s.length>0&&Buffer.byteLength(s,'utf8')<=n?s:null;
 const nullableCount=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:null;
 const jsonBytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
 const observe=e=>{
  // No private body/URL/credential/SQL text or unknown caller keys are copied.
  if(!e||!sources.includes(e.source)||!phases.includes(e.phase)||!text(e.run_id,160)||!text(e.contract,80)||!/^\S{1,32}-USDT$/u.test(e.contract)||!text(e.route,64)||!/^[A-Z0-9_]+$/.test(e.route)||!text(e.reference_key,128)||!/^REFERENCE:provider-reference-cache-v1-20261004:[a-f0-9]{64}$/.test(e.reference_key)||!Number.isSafeInteger(e.attempt_sequence)||e.attempt_sequence<0||!Number.isSafeInteger(e.query_window_end_ts)||e.query_window_end_ts<=0||e.query_window_end_ts>8_640_000_000_000_000||e.day_utc!==new Date(e.query_window_end_ts).toISOString().slice(0,10)||e.native_usage_guard_passed!==true){invalid++;return;}
  const captured_ts=clock();if(!Number.isSafeInteger(captured_ts)||captured_ts<e.query_window_end_ts){invalid++;return;}
  const row={source:e.source,run_id:e.run_id,contract:e.contract,route:e.route,phase:e.phase,reference_key:e.reference_key,attempt_sequence:e.attempt_sequence,
   query_window_end_ts:e.query_window_end_ts,day_utc:e.day_utc,captured_ts,
   provider:['COINGECKO','COINPAPRIKA'].includes(e.provider)?e.provider:null,
   row_presence:['ABSENT','RETURNED','UNKNOWN'].includes(e.row_presence)?e.row_presence:null,
   reported_used_units:nullableCount(e.reported_used_units),configured_cap:nullableCount(e.configured_cap),reported_own_reserved_units:nullableCount(e.reported_own_reserved_units),minute_bucket:nullableCount(e.minute_bucket),
   returned_allowed:typeof e.returned_allowed==='boolean'?e.returned_allowed:null,returned_status:typeof e.returned_status==='string'&&/^[A-Z0-9_]{1,80}$/.test(e.returned_status)?e.returned_status:null,native_usage_guard_passed:true};
  if(events.length>=16||jsonBytes(row)>1024){overflow++;return;}events.push(row);
 };
 const summary=run_id=>{
  const bound=text(run_id,160),matching=bound?events.filter(e=>e.run_id===bound):[],foreign=events.length-matching.length;
  const base={schema:'EXISTING_PROVIDER_LEDGER_OBSERVATIONS_V1',run_id:bound,basis:'PROJECT_LOCAL_SOURCE_LEDGER_NOT_PROVIDER_ACCOUNT_BALANCE',status:overflow?'OVERFLOW':invalid||foreign?'PARTIAL_OR_INVALID':matching.length?'CAPTURED_EARLIER_QUERY_CUTS':'NO_CURRENT_CAPTURE',
   events:matching,invalid_observations:invalid,overflow_observations:overflow,foreign_run_omitted:foreign,all_run_observations_complete:false,
   query_cuts_are_distinct:true,reservation_replies_are_helper_returns_not_raw_SQL_body:true,
   provider_account_balances:null,month_headroom:null,manual_held_reserve:null,native_unknown_ops_at_individual_query:null,
   future_work_admitted:false,whole_day_closed:false,serialized_copy_is_not_a_proof_token:true,additional_SQL:0,additional_source_HTTP:0};
  if(jsonBytes(base)>16384)return{...base,status:'OVERFLOW',events:[],overflow_observations:overflow+matching.length};
  return JSON.parse(JSON.stringify(base));
 };
 return{observe,summary};
}
"""

p = TARGETS[4]
replace(p, "import {buildRunBudgetContext} from './src/run-budget-context.mjs';", "import {buildRunBudgetContext,createProviderBudgetReceiptCapture} from './src/run-budget-context.mjs';")
replace(p, '  let currentBlockWeightPolicy=null,blockPolicyLoaded=false;', '  const providerBudgetReceipts=createProviderBudgetReceiptCapture();\n  let currentBlockWeightPolicy=null,blockPolicyLoaded=false;')
replace(p, "...params,main_index_failure_backoff:expectedManualMode!=='LIQUIDATION_ONLY'", "...params,provider_budget_observe:providerBudgetReceipts.observe,main_index_failure_backoff:expectedManualMode!=='LIQUIDATION_ONLY'")
replace(p, 'native_liquidation:canonicalRunOutput.liquidation_source_acquisition_audit?.shared_budget}', 'native_liquidation:canonicalRunOutput.liquidation_source_acquisition_audit?.shared_budget,provider_receipts:providerBudgetReceipts.summary(String(cron.run_id||\'\'))}')

for name in ['.baseline', '.runtime']:
    folder = HERE / name
    if folder.exists():
        shutil.rmtree(folder)
    shutil.copytree(ROOT / 'current-generation/files/src', folder / 'src')
    shutil.copyfile(ROOT / 'current-generation/files/runner-main.mjs', folder / 'runner-main.mjs')
for p in TARGETS:
    relative = pathlib.Path(p).relative_to('current-generation/files')
    (HERE / '.runtime' / relative).write_text(after[p])
patch = ''.join(''.join(difflib.unified_diff(before[p].splitlines(True), after[p].splitlines(True), fromfile='a/'+p, tofile='b/'+p)) for p in TARGETS)
(HERE / 'shared-provider-budget.proposed.patch').write_text(patch)
h = lambda s: hashlib.sha256(s.encode()).hexdigest()
(HERE / 'proposal-targets.json').write_text(json.dumps({'schema':'EXISTING_PROVIDER_REPLY_TECHNICAL_PROPOSAL_TARGETS_V1','fixed_working_base':BASE,'production_files_edited':False,'targets':[{'path':p,'before_sha256':h(before[p]),'after_sha256':h(after[p])} for p in TARGETS]}, indent=2)+'\n')
print(json.dumps({'targets':len(TARGETS),'patch_bytes':len(patch.encode()),'patch_sha256':h(patch),'applications_executed':0}))
