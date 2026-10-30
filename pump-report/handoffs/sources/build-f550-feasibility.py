"""Saved receipt metadata + exact non-executing admission plans. No network."""
from pathlib import Path
import json, hashlib

B = Path(__file__).resolve().parent
ROOT = B.parents[2]
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(name, obj): (B/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
pins={
 'pump-report/sources/index.mjs':'46321d410aa41ba5adc7372cf65834206b5aa6ef72b917ac8f4c632dec5a62c2',
 'pump-report/sources/bingx.mjs':'4b835db4ba9e8514c5bef26ab287aed99b982d409976ebff540fdf8403052308',
 'pump-report/sources/recent-trades.mjs':'2894ddd3e9874e2676af1b7093bd41c75e78736c35edc7b843c72f597246079c',
 'pump-report/handoffs/sources/PACKAGE_B550_BUDGET_COVERAGE_CADENCE_FINAL_V1.json':'ea80e183bb3c0d9eaffa003ed9136c1c82cd4f55fcc40458c5cad3bfe7556d0d',
 'pump-report/handoffs/sources/PACKAGE_H125_CORE_HISTORY_FIX_FINAL_V1.json':'3822eaef0aa3b0ea7a5869abcf62c40a5ac8312ed1a8c6e60d696b4e0bfdf9e9'}
for p,h in pins.items(): assert digest(ROOT/p)==h,p
ref=Path('/private/tmp/report2-source-bingx-primary-adapter-20261024/official-ai-docs/skills/swap-market/api-reference.md')
assert digest(ref)=='fd667b1da678c2a74f6660fe4301562f0ef6b3cc8e736d9afe0694ac0709453a'
native=json.loads((B/'NATIVE_BINGX_20261025_METADATA_V1.json').read_text())['evidence']
solp=Path('/private/tmp/pump-post-review-sol-actual.json')
assert digest(solp)=='14d8767e7ddd9144302a177bc3c91f66a0abadb7583c41da2b9c8884089dda53'
sol=json.loads(solp.read_text()); body=sol['body']; result=body['manual_result']; analysis=result['analysis']; resources=body['resources']
assert resources['total']==5 and len(resources['receipts'])==5
receipts={r['request_id']:r for r in resources['receipts']}
ids={}
for f in analysis['fact_ids']:
 for kind in ['price','candles']:
  if ':'+kind+':' in f: ids[kind]=f.rsplit(':',1)[1]
ids['growth_24h']=analysis['day_growth_diagnostic']['fact_id'].rsplit(':',1)[1]
ids['catalog']=body['catalog_coverage']['evidence_ref']
# getCore selected_facts and receipt_ids have the same stable loader order;
# actual reservation order can differ because candles/book execute concurrently.
core=result['source_coverage']
assert core['selected_facts']==['price','candles','orderbook']
assert core['receipt_ids'][0]==ids['price'] and core['receipt_ids'][1]==ids['candles']
ids['orderbook']=core['receipt_ids'][2]
assert set(ids.values())==set(receipts)
day=json.loads((B/'DAY1_ACTUAL_FACT_QUALIFICATION_V1.json').read_text())
swole=json.loads((B/'SWOLE_ACTUAL_ONE_PROBE_QUALIFICATION_V1.json').read_text())
metadata=json.loads((B/'T_CORRECTED_METADATA_ACTUAL_REVIEW_V1.json').read_text())
receipt_index={
 'schema':'SOURCE_F550_SAVED_NATIVE_RECEIPT_INDEX_V1',
 'SOL':{'private_path':str(solp),'file_sha256':digest(solp),'wrapper_bytes':solp.stat().st_size,
  'wrapper_elapsed_ms':sol['received_ts']-sol['started_ts'],'elapsed_scope':'Whole control HTTP wrapper, not per-provider latency or sustainable throughput',
  'run_id':body['run_id'],'run_status_at_capture':body['status'],'ready':analysis['ready'],
  'core_status_at_capture':core['status'],'day_usable_at_capture':analysis['day_growth_diagnostic']['usable'],
  'kind_to_receipt':ids,'provider_receipts':resources['receipts'],'native_receipt':body['native_receipt'],
  'core_candles_closed_rows':core['facts']['candles']['coverage']['returned_rows'],
  'core_book_bids':core['facts']['orderbook']['coverage']['bids'],'core_book_asks':core['facts']['orderbook']['coverage']['asks'],
  'book_complete_census':None,'exact_price_book_original_event_clocks_omitted_by_control':True,
  'publish_requested':body.get('publish_requested'),'no_current_freshness_claim':True,
  'native_H125_current_wiring_proven':False,'source_values_or_raw_prices_exported':False},
 'BTC_catalog_candles_depth':native,
 'BTC_day':{'receipt_id':day['fact']['receipt_id'],'file_sha256':day['private_wrapper_sha256'],'normalized_wrapper_bytes':day['private_wrapper_bytes'],
  'event_ts':day['fact']['event_ts'],'received_ts':day['fact']['received_ts'],'expires_ts':day['fact']['expires_ts'],
  'observed_closed_rows':1440,'costs':day['costs'],'status':'HISTORICAL_CAPTURE_NOW_STALE; owner accepted CCXT time basis'},
 'Swole':{'receipt_id':swole['observed_reply']['receipt_id'],'received_ts':swole['observed_reply']['received_ts'],
  'file_sha256':swole['input']['private_file_sha256'],'wrapper_bytes':swole['input']['private_file_bytes'],
  'bins_observed':4,'qualified_maps':0,'original_as_of':swole['clock']['native_as_of'],
  'independent_epoch_ms_evidence':None,'costs':swole['costs'],
  'limitations':['Canonical cross-provider identity unknown','Venue/currency/current price mapping unknown','usd field not proven USD notional','Only4model bins, no full market coverage']},
 'signed_metadata':{'receipt_id':'9c3ba708-0e31-4ebb-b128-3c09ba22cb8b','received_ts':1792945802427,
  'private_path':'/private/tmp/pump-corrected-metadata-actual.json','sha256':'66c3afe4e3f2d967050fdfbb34fb09741b4612780f1ba264cf504410dc0a3cf9',
  'wrapper_bytes':812308,'rows':5673,'native_coinName_to_catalog_asset_exact_unique_matches':934,
  'raw_type0_matches':554,'raw_type5_matches':380,'universal_coinType_enum_documented':False,
  'metadata_two_attempts_bare_failure_and_signed_success':'2of2SPENT_NO_REPEAT'},
 'clock_probe':{'private_path':'/private/tmp/pump-report-native-clock.json','used_as_price_clock':False},
 'all_wrappers_not_wire_bytes':'File/canonical JSON sizes are not original provider wire lengths. No values exported.',
 'new_market_HTTP_SQL_TG_deploy':0}
write('F550_NATIVE_RECEIPT_INDEX_V1.json',receipt_index)

rate={'status':'RETAINED_OFFICIAL_REFERENCE_NOT_NEW_QUOTA_VERIFICATION','per_IP_per_exact_endpoint':'1 request/second',
 'pin_commit':'7b1c40d29c248b18fcf418767c8e49760d1f6ef0','ref_sha256':digest(ref),
 'monthly_daily_IP_account_shared_scope':'UNKNOWN_FROM_RETAINED_REFERENCE; no paid/free entitlement or current headroom inferred'}
internal={'provider':'BINGX','second':1,'rolling_minute':10,'daily':900,'monthly':27900,
 'qualification_attempt_cap':24,'spent':12,'remaining_before_new_actual_admission':12,
 'scope':'SUMMARY_INDEX_ACCEPTANCE_ONLY, expired17:45UTC, allowedproviders[] at current stage; numerical remaining12 is not authorization'}
rows=[]
def row(key,required,method,batching,semantics,clock,payload,evidence,external=rate,gate=''):
 rows.append({'indicator':key,'required':required,'method':method,'batching':batching,
  'qualified_semantics_units':semantics,'original_clock_and_TTL':clock,'maximum_payload':payload,
  'retained_native_evidence':evidence,'external_limit':external,'current_internal_limit':internal if method.startswith('GET /openApi') else None,
  'remaining_gate':gate,'all550_native_coverage_proven':False})
row('catalog_and_native_instrument_identity',True,'GET /openApi/swap/v2/quote/contracts','ALL contracts when symbol omitted',
 'contractId+asset+symbol+currency/status observed; docs-v3 currency=settle AND margin. No crypto classifier or executable multiplier from size/precision.',
 'Membership observed at original received clock; launchTime is not snapshot or price event time; catalog TTL0.',
 {'documented_row_ceiling':None,'source_row_guard':20000,'broker_body_bytes':2000000,'observed_rows':1278},
 [native['catalog-corrected']['broker_receipt_id'],ids['catalog']],gate='Fresh membership needed for current counts; scope550 is saved economic selection, not current operational registry.')
row('bulk_price_and_prequeue_24h_preview',True,'GET /openApi/swap/v2/quote/ticker','ALL when symbol omitted; source currently uses all-symbol URL even for one selected instrument',
 'Native SOL last price usable at capture, USDT per verified native price-base. reported priceChangePercent/quoteVolume may preview; exact rolling24h open window still requires its own qualification.',
 'closeTime milliseconds in retained reference; original exact SOL price clock omitted by control; producer marked usable then. Price TTL30s, receive/cache time never replaces it.',
 {'documented_row_ceiling':None,'source_row_guard':20000,'broker_body_bytes':2000000,'all550_presence_in_saved_SOL_control':'NOT_PROVEN'},[ids['price']],gate='Need one full bulk payload receipt to count exact current550/missing/duplicate rows and clocks; one SOL observation not whole market.')
row('primary_price_and_price_fallback',True,'GET /openApi/swap/v1/ticker/price?symbol=<verified>; fallback /openApi/swap/v2/quote/ticker?symbol=<verified>',
 'Source primary per-symbol; do not assume undocumented all-symbol batching for v1 price.',
 'Positive price USDT per verified native base; independent native primary v1 clock/shape success not proven by SOL bulk receipt; fallback ticker observed.',
 'Source requires primary row.time or fallback closeTime; TTL30s. No Date-header clock.',
 {'selected_rows':1,'primary_plus_fallback_attempts_max':2,'broker_body_bytes':2000000},[ids['price']],
 external={'primary_v1_external_exact_rate':'UNKNOWN_IN_SELECTED_REFERENCE','fallback_ticker':rate},gate='No new primary-only probe needed for minimum if fresh bulk price usable; primary schema remains a bounded fallback qualification.')
row('OHLC_short_growth_and_pullback_history',True,'GET /openApi/swap/v3/quote/klines?symbol=<verified>&interval=1m&startTime=<end-125m>&endTime=<end-1>&limit=125',
 'Per-symbol. No all-market candles endpoint wired.',
 'OHLC observed. time=OPEN_TIME is owner-accepted CCXT consumer mapping, not native independent vendor guarantee. Required125=60search+5impulse+60baseline; H125 code1PASS synthetic, not new native125SOL proof.',
 'Original object.time on60s grid; only closed bars; event=last closed close; TTL90s.',
 {'vendor_limit':1440,'source_requested':125,'broker_body_bytes':2000000,'native_BTC_rows':125,'native_SOL_old_rows':121},
 [native['candles']['broker_receipt_id'],ids['candles']],gate='One new exact H125 SOL closed-window read closes changed-wire gap. Existing proof does not cover550.')
row('relative_candle_activity_volume',True,'GET /openApi/swap/v3/quote/klines (same response, no extra request)',
 'Same per-symbol candle request reused for movement and volume.',
 'Only SAME_NATIVE_REPORTED_QUANTITY comparison within exact instrument/method/field/interval accepted. volume absolute BASE/USDT and contract multiplier remain UNKNOWN; native object contradicts array-specific reference shape.',
 'Same closed bar clocks/TTL90s; no independent freshness refresh.',{'extra_HTTP':0,'same_125_rows':True},
 [native['candles']['broker_receipt_id'],ids['candles']],gate='No dollar turnover or cross-asset absolute quantity from this volume. Each operational registry qualification retains exact comparison key.')
row('exact_closed_24h_growth','CONDITIONAL_STRATEGY_OR_BRANCH; currentrunnerstillalwaysfetches','GET /openApi/swap/v3/quote/klines?symbol=<verified>&interval=1m&startTime=<end-86400000>&endTime=<end-1>&limit=1440',
 'Per-symbol; current runner calls before each core analysis. Different URL from125m means separate request/cache key.',
 'OHLC boundary return only, no volume/BASE needed. Exact1440 closed rows and both boundaries required under accepted CCXT basis.',
 'event=end of closed window, TTL90s. BTC original event1792938480000, receive1792938526815, expired1792938570000; now stale.',
 {'vendor_and_source_rows_max':1440,'broker_body_bytes':2000000,'original_wire_bytes_observed':None},
 [day['fact']['receipt_id'],ids['growth_24h']],gate='Native BTC1440 and SOL usable diagnostic prove these samples, not every550 asset or every later window.')
row('spread_depth_slippage_execution_capacity',True,'GET /openApi/swap/v2/quote/depth?symbol=<verified>&limit=1000','Per-symbol',
 'Explicit COIN bidsCoin/asksCoin base-asset quantities with retained depth descriptor; prices USDT per verified native base. SOL1000 bids+1000asks accepted; bounded visible book, not full book. Unknown1000-token execution scaling not copied from SOL.',
 'Native T milliseconds; BTC exact T retained, SOL exact eventclock omitted by control but producer status usable. TTL15s.',
 {'vendor_limit_values':[5,10,20,50,100,500,1000],'source_max_per_side':1000,'broker_body_bytes':2000000,'BTC_observed_each_side':20,'SOL_observed_each_side':1000},
 [native['orderbook']['broker_receipt_id'],ids['orderbook']],gate='Fresh book and independent units per selected contract. Not550 verified orderbooks; no new book repeat for semantics unless current connected-core pilot.')
row('recent_executed_notional_and_aggressor',False,'GET /openApi/swap/v2/quote/trades?limit=100&symbol=<verified>','Per-symbol',
 'T3 direct quoteQty in USDT, no BASE division/qty inference. Actual stable vendor id required. isBuyerMaker boolean only: falseBUY/trueSELL; buyerMaker-only/mixed fields UNKNOWN. Native current schema and IDs unexecuted.',
 'Native time Unix milliseconds, original receive/expiry; TTL30s from last fully qualified trade. Latest bounded sample, no full5m tape.',
 {'vendor_max_rows':1000,'T3_requested_and_guard':100,'broker_body_bytes':2000000},[],gate='Exact route absent from old allowlist; new one-time admission1 of remaining12 BINGX, no TG. Synthetic6PASS is not native evidence.')
row('open_interest',False,'GET /openApi/swap/v2/quote/openInterest?symbol=<verified>','Per-symbol; no bulk implemented/documented here',
 'Pinned reference calls openInterest BASE_ASSET; retained native generic descriptor and existing registry do not currently qualify unit/multiplier. No usable new native OI receipt in this package.',
 'row.time ms from selected reference; original clock needs native match; TTL120s.',{'selected_rows':1,'broker_body_bytes':2000000},[],
 gate='Current qualifications empty =>skip without HTTP. One optional native shape read cannot itself prove a unit; ROOT needs explicit evidence acceptance before activating BASE on any row.')
row('funding_rate_and_actual_period',False,'GET /openApi/swap/v2/quote/premiumIndex?symbol=<verified>',
 'Reference permits all-symbol request, but current getOptional is per-symbol; no free bulk funding wiring claimed.',
 'lastFundingRate fraction, actual fundingIntervalHours/period and rate-event clock required. updateTime metadata is not rate time. Current registry qualifications empty; fundingRate history route is distinct and not silently substituted.',
 'Selected rate_clock_field independent of updateTime; TTL300s; nextFundingTime not current rate event.',
 {'selected_rows':1,'bulk_rows_vendor_limit':None,'broker_body_bytes':2000000},[],gate='No call in minimum mandatory pilot. If later admitted1 native premium read lacks effective period/rate clock =>retainUNKNOWN, no history retries.')
row('mark_and_index_context',False,'GET /openApi/swap/v2/quote/premiumIndex (same optional payload)',
 'All-symbol available in retained reference; existing source exposes funding only, not independent mark/index facts.',
 'markPrice/indexPrice semantic field names documented, no native receipt/consumer qualification in current package.',
 'Envelope time ms is not automatically funding effective time; mark/index TTL contract not added.',
 {'broker_body_bytes':2000000,'extra_HTTP_if_same_qualified_payload_reused':0},[],gate='No active consumer requirement justifies new separate collection. Common-format work remains ROOT.')
row('future_liquidation_model_map',False,'GET https://swolecharts.com/api/liquidation-levels/<exact-qualified-provider-asset>',
 'Per-provider-asset; only BTC path admitted historically, now owner-excluded.',
 'Observed4model bins, EXTERNAL_MODEL; usd label not proven actualUSD. Canonical identity, venue/currency/scale and exact BingX price mapping absent.0 usable maps.',
 'as_of numeric interpreted ms by old parser, independent epoch-ms unit missing; original sample already stale, modelTTL300s cannot be renewed by download.',
 {'observed_bins':4,'source_max_per_side':1000,'current_worker_MAP_CHECK_bytecap':262144,'standard_broker_bytes':2000000},
 [swole['observed_reply']['receipt_id']],external={'public_external_rate_limit':'UNKNOWN_FROM_RETAINED_PRIMARY_MATERIAL'},
 gate='Internal Swole1/day1/month1qualification already SPENT, admittedBTC only. Recommend0new retries until semantic prerequisites; absent map nonblocking.')
row('4h_outcomes_closed_history',True,'GET /openApi/swap/v3/quote/klines?symbol=<verified>&interval=1m&startTime=<floor(t0)>&endTime=<queryEnd>&limit=<count+1>',
 'Per published instrument/window; shared data/cache when exact same URL. No night collector.',
 'Same accepted closed-OHLC time basis, preserve boundary ambiguity; closed high crossing in partial boundary bar not exact event proof. No native real4h outcome receipt qualified in this package.',
 'Historical original candle times; expires_ts null, intentionally not live-fact freshness. Full interval only after deadline and complete grid.',
 {'closed_4h_rows_aligned':240,'closed_4h_rows_unaligned':241,'request_limit_aligned':241,'request_limit_unaligned':242,'vendor_max':1440,'broker_body_bytes':2000000},[],
 gate='One later actual due outcome read, not a fake immediate4h check; daytime only or explicit manual, count within protected outcomes24.')
row('support_persistence',False,'NOT_CONNECTED / profile support_persistence_enabled=false','Would need temporal snapshots plus executions; not supplied by one depth response.',
 'No claims that a displayed wall persisted or was executed from one book image.',
 'No current native clock-series contract.',{'native_payload_max':None,'currently_planned_HTTP':0},[],external={'external_limit':'NOT_APPLICABLE_TO_DISABLED_ROUTE'},gate='No new GET in this release; optional deferred feature, not missing mandatory CORE.')
assert len(rows)==14
write('F550_ACTUAL_SOURCE_FEASIBILITY_MATRIX_V1.json',{
 'schema':'SOURCE_F550_ACTUAL_SOURCE_FEASIBILITY_MATRIX_V1','scope_count':550,
 'operational_verified_owner_eligible_registry':11,'not_complete550_native_coverage':True,
 'source_pins_unchanged':pins,'primary_reference':{'path':str(ref),'sha256':digest(ref),'git_blob':'e61be4746c5bd5475e556146448c79f4c58b064f','commit':'7b1c40d29c248b18fcf418767c8e49760d1f6ef0'},
 'common_broker_limits':{'max_response_bytes':2000000,'timeout_ms':10000,'automatic_retries':0,'redirects':0,'provider_receipts_required':True,'cache_does_not_refresh_event_clocks':True},
 'constraints':'Retained reference limits are evidence, not a fresh external entitlement. Vendor exact byte ceilings usually unknown; wrapper size not wire payload size. Current internal grants expired/acceptance only, no IO authorized.',
 'rows':rows,'new_market_HTTP_SQL_TG_deploy':0})

trade_url='https://open-api.bingx.com/openApi/swap/v2/quote/trades?limit=100&symbol=SOL-USDT'
def action(n,name,path,params,why):return {'order':n,'name':name,'provider':'BINGX','host':'open-api.bingx.com','method':'GET','path':path,'params':params,
 'attempts_max':1,'timeout_ms':10000,'response_bytes_max':2000000,'retries_redirects_hostfallback':0,'why_new_read_is_needed':why,'execute_now':False}
actions=[action(1,'recent_SOL_once','/openApi/swap/v2/quote/trades',{'limit':100,'symbol':'SOL-USDT'},'Only unexecuted newT3 wire/IDs/maker/quote/time gap; no TG'),
 action(2,'H125_SOL_once','/openApi/swap/v3/quote/klines',{'symbol':'SOL-USDT','interval':'1m','startTime':'E-125*60000','endTime':'E-1','limit':125},'Changed actual125closed request; old SOL had121, no full old audit replay'),
 action(3,'current_catalog_once','/openApi/swap/v2/quote/contracts',{},'Current active membership/tuple bridge; saved934 counts not a current market snapshot'),
 action(4,'current_bulk_ticker_once','/openApi/swap/v2/quote/ticker',{},'Observe full payload identity/clock/missing/duplicate coverage of currentselectedscope; oldSOL control not fullmarket proof'),
 action(5,'fresh_SOL_depth_for_connected_core','/openApi/swap/v2/quote/depth',{'symbol':'SOL-USDT','limit':1000},'Freshness for connectedCORE only, not re-proving old base-field semantics'),
 action(6,'fresh_SOL_day_for_connected_core','/openApi/swap/v3/quote/klines',{'symbol':'SOL-USDT','interval':'1m','startTime':'E-86400000','endTime':'E-1','limit':1440},'Fresh original complete window for currentCORE, old native fact stale')]
plans={
 'schema':'SOURCE_F550_PRECISE_NATIVE_READ_ADMISSION_PLANS_V1','status':'PROPOSED_NOT_ADMITTED_NOT_EXECUTED',
 'E':'floor(actual admitted send Unix-ms/60000)*60000; freeze per-action boundaries immediately before send, do not reuse stale synthetic times',
 'priority_one_recent':{'exact_url':trade_url,'run_id_proposal':'pump-f550-recent-sol-20261025-one',
  'BINGX_existing_version_unchanged':'pump-manual-native-relative-acceptance-20261025-v1','provider_attempt_delta':1,'old_spent':12,'new_spent_if_attempted':13,'remaining_after':11,
  'qualification_cap_before_after':[24,24],'daily_cap_before_after':[900,900],'monthly_cap_before_after':[27900,27900],
  'exact_new_allowlist_item':'/openApi/swap/v2/quote/trades, additionally bind full URL SOL-USDT/limit100 in single-use runtime admission',
  'no_new_provider_budget_above_remaining_pool':True,'not_a_new_family_or_version':True,'Telegram_attempts':0,
  'expected_outcome':'code0 data[]<=100; actual nativeid, exact makerfield, quoteQty, originalms clocks validated; missing/mixedschema =>UNKNOWN, no further probe/retry.',
  'runtime_blockers':['Current workerstage allowedproviders[] and expiry passed','Server39modules differs from locally built45; ROOT exactartifact/readback before new wiring','Old generic source-probe kinds omit trades; do not pretend existing URL admission includes it','Native CONTROL/MANUAL acceptance operation slot must be checked; old fixed IDs cannot be replayed or renamed to bypass their caps'],
  'nativeSQL':'Use at most one actual admitted standard native invocation5000R/300W/max800queries if ROOT selects that existing envelope; measured cost UNKNOWN. If all existing CONTROL slots consumed, require explicit additional1operation grant, not LOOKUP/family relabel. No such grant here.'},
 'minimal_semantic_gap_pair':{'BINGX_attempts':2,'actions':[1,2],'remaining_of12_after':10,'does_not_claim_current_fullCORE_or_full550':True},
 'minimal_current_breadth_and_one_CORE_pilot':{'BINGX_attempts_max':6,'actions':actions,'old_spent12_new_spent18_remaining6':True,
  'runtime_order_for_freshness':'Catalog+bulk/day/history first, book and any necessary freshprice last. The priority trade qualification may run separately before the currentCORE pilot. Book/candles remain parallel only when measured deadline supports it. No extra automatic fallback beyond this exact6 action plan.',
  'if_same_invocation':'One exact6GET bounded source action needs one positive native envelope;6HTTP is not6SQL calls. If split into6standardinvocations, upperSQL reservation30000R/1800W and operation slots must be admitted separately.',
  'STOP':'Provider429/100410/backoff/unknownACK/bodylimit =>stop, preserve charge/unknown. Incomplete identity/clock/rows =>no fabricated usable facts. Optional trades unknown does not itself block adequate core.',
  'no_TG_deploy_schedule_grant':True,'not550_qualification':True},
 'remaining6_not_automatically_spent':{'price_and_book_publication_refresh_upper':2,'optional_OI_shape_read_if_primaryunitaccepted':1,'optional_premium_shape_read_if_clock_periodpurpose_exists':1,'unallocated_remaining':2,
  'sum':6,'all_require_separate_exact_admission':True,'no_map_retry_or_historical_trade_tape_expansion':True},
 'cold_manual_implemented_route_order':['catalog1','overview1','day1','core candles/book2 with overviewprice reuse, primary+fallback up to2 if needed','whenready optionaltotal2','qualifiedmap up to1 or0truthfulabsent','savedcard/revalidate forcefreshpricebook2','TG1 only after separatefutureadmission','later dueoutcome1'],
 'cold_manual_counts':{'BINGX_upper11':'Requires rolling-minute staging because internal10/min; six immediate66BINGX+6potentialmap+6TG=78, plus6outcomes=84','warm_observed_SOL_source_only':5,'full_ready_native_manual_cost_proven':False},
 'AUTO_cycle':'Two bulk discovery requests every5min in count-plan; only selected candidates need per-symbol day/candles/book. Same bulkURL cache can reuse within30s. Candle/day different minuteURLs do not share90s cache. At same burst2discovery+10coldcandidate BINGX exceeds10/min; ROOT stage before freshcore, no strategy/freshness weakening.',
 'all_164_96_56_12_900_provider_monthly_unknown_reserves_9pauses_2deferrals_preserved':True,
 'new_market_HTTP_SQL_TG_deploy':0}
assert len(actions)==6 and plans['priority_one_recent']['remaining_after']==11
write('F550_PRECISE_NATIVE_READ_ADMISSION_PLANS_V1.json',plans)

category={
 'schema':'SOURCE_F550_CATEGORY_SIMPLE_LIST_ONE_GET_DECISION_V1','status':'POTENTIALLY_USEFUL_ONE_RESPONSE_NOT_NATIVE_PROVEN_NOT_ADMITTED',
 'exact_request':{'provider':'BINGX_WEB_METADATA','method':'GET','url':'https://api-app.acc-de.com/api/coin/v1/quotation/simple-list?bizType=20',
  'query':{'bizType':20},'signed_GET_payload_literal':'{"bizType":"20"}','attempts_max':1,'timeout_ms':10000,'max_body_bytes':2000000,
  'retries_redirects_fallback':0,'auth':'Fresh anonymous public-client signing; no token/cookie/account/fingerprint copied; category anonymous acceptance still unproven'},
 'retained_static_primary_proof':'U3_FUTURE_PRECISE_CATEGORY_READ_PLAN_V1.json exactspans; PERPETUAL_U20=>getPerpetualUCoinList=>getCoinSimpleList; TRADFI_U22 separate, FUTURES_U10 distinct',
 'can_one_answer_help':'Yes for positive same-venue economic market-set membership and exact native name/symbol bridge, IF actual shape is complete and uniquely matches freshcatalog/savedscope. It cannot be promised before observing fields/coverage.',
 'can_one_answer_certify_everything':'No issuer/chain/CA certificate, execution multiplier, candle/depth units/freshness, native liquidity, true sample clocks or currentactive status solely from generic marketset membership.',
 'acceptance_checks':['HTTP200 and businesscode0, actual result[] shape','Requestproduct20 and returned product/currency/venue fields consistent; none guessed',
  'Record full count, unique raw IDs/names/symbols/categories and originalreceive/providertimestamps separately','Join fresh nativecatalog.asset to sameBingX exact unique coinName and/or exact nativesymbol with documented consumer context; contractId and coinId differ by entity, not mismatch by numeric inequality',
  'If quotationId returned, do not declare it contractId without fieldsemantics/verifiedbridge','Report target intersection, missing, extra, inactive and ambiguous; do not force550 if currentmarket changed',
  'PAXG/XAUT/BTCETH owner exclusions separate; preserve Unicode and stock-themed crypto exceptions','No inferred defaultcoinType=0 enum; this read supplies membership context, not a universal numeric classifier',
  'No completeness ifgeo/paging/permissionfilters/omitteditems or bodylimit; stopafterone attemptedanswer, no automaticnextpage'],
 'current_available_provider_budget':0,'old_metadata_attempts':{'barefailure':1,'signedsuccess':1,'total':2,'daily_cap':2,'monthly_cap':2,'qualification_attempt_cap':2,'all_SPENT':True},
 'minimum_new_budget_if_ROOT_chooses_this_read':{'additional_provider_HTTP':1,'same_provider_existing_spent_preserved':True,
  'effective_daily_cap_change_if_same_day':[2,3],'effective_monthly_cap_change':[2,3],'effective_qualification_cap_change':[2,3],
  'explicit_cap_increase_required':True,'not_authorized_here':True,'project900_cap_change_required':False,'counts_against_project900_if_admitted':1,
  'nativeSQL':'One exact new operation envelope/slot must be admitted with actual ledger; standard bound5000R/300W/max800queries if usingcurrentnativepolicy; measuredcostunknown',
  'no_new_family_version_counter_rename_reset_or_old_spent_refund':True,'single_use_close_on_attempt_even_error_UNKNOWN':True},
 'do_not_reassign_to_BINGX_REST_remaining12':'That would hide exhaustion of the same web-metadata provider policy under a new bucket/family. No such reassignment in plan.',
 'zero_extra_budget_alternative':'Do no new category GET. Keep saved934native+5673display exactunique bridge and practicalscope550 with explicit economic inference; use remainingBINGX12 for selected-core/trade qualification only. Nativeall550marketset completeness remains unproved.',
 'waiting_until_next_UTC_day_is_not_fix':'Monthly2 and qualification2 remain SPENT; a clock rollover does not restore them or unknowns.',
 'source_factory_note':'Existing display-info-only factory remains pinned; cannot substitute categoryURL while retaining empty{} signingpayload. New exact query-aware construction belongs to separately admitted ROOT action.',
 'new_market_HTTP_SQL_TG_deploy':0}
write('F550_CATEGORY_ONE_GET_DECISION_V1.json',category)

write('F550_SAVED_EVIDENCE_INTEGRITY_CHECK_V1.json',{
 'schema':'SOURCE_F550_SAVED_EVIDENCE_INTEGRITY_CHECK_V1','result':'PASS_TARGETED_METADATA_INTEGRITY_AND_PLAN_ARITHMETIC_ONLY',
 'checks':{'source_and_B550_H125_frozen_hashes_exact':True,'official_reference_pin_exact':True,'SOL_private_wrapper_hash_exact':True,
  'SOL_five_receipts_mapped_to_exact_source_factids_not_reservation_order':True,'SOL_core121_book1000_not550':True,
  'matrix_indicators':len(rows),'recent_delta1_spent12to13_remaining11_cap24unchanged':True,'minimumpilot6_remaining6':True,
  'category_web2of2SPENT_needs_explicit_plus1_or_noGET':True,'no_family_version_counter_reset':True,
  'no_source_tests_or_full_oldaudit_replayed':True,'no_source_code_changes':True,'new_market_HTTP_SQL_TG_deploy':0},
 'limitations':'Does not requalify actual market data, native costs, live schema, throughput, coverage550, storage capacity or Telegram.'})
print(json.dumps({'result':'PASS_TARGETED_METADATA_INTEGRITY_AND_PLAN_ARITHMETIC_ONLY','matrix_rows':len(rows),
 'SOL_observed_provider_attempts':5,'recent_proposed_attempts':1,'category_extra_grant_needed':1,'new_native_IO':0}))
