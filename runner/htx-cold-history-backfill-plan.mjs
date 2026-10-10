import {isExactHtxUsdtSwapKey} from '../current-generation/files/src/htx-contract-key.mjs';
const DAY=86400000,day=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const dates=(end,count)=>{const t=Date.parse(end+'T00:00:00Z');return Array.from({length:count},(_,i)=>new Date(t-i*DAY).toISOString().slice(0,10));};
// Pure acquisition planner: no network and no availability claim. Each slot
// reserves two HTTP attempts (official ZIP + CHECKSUM) and remains unverified
// until a later exact acquisition/qualification receipt is supplied.
export function planHtxColdHistoryBackfill({census,window_end_day,window_days=30,verified=[],source_http_reservation=16}={}){
 const no=reason=>({schema:'HTX_COLD_HISTORY_BACKFILL_PLAN_V1',status:'NOT_CLOSED',reason,sourceHTTP:0,D1:0,planned:[],project_complete:false});
 if(census?.schema!=='HTX_RETAINED_102_FACTUAL_HISTORY_GAP_CENSUS_V1'||census.status!=='PARTIAL_VERIFIED_RETAINED_EVIDENCE_ONLY'||census.rows?.length!==102||new Set(census.rows.map(x=>x.contract)).size!==102||census.rows.some(x=>!isExactHtxUsdtSwapKey(x.contract))||!day(window_end_day)||![30,90].includes(window_days)||!Number.isSafeInteger(source_http_reservation)||source_http_reservation<2||source_http_reservation>16||source_http_reservation%2||!Array.isArray(verified)||verified.length>9180)return no('EXACT_102_CENSUS_WINDOW_AND_RESERVATION_REQUIRED');
 const wanted=dates(window_end_day,window_days),known=new Set(),counts=new Map(census.rows.map(x=>[x.contract,0]));
 for(const r of verified){
  if(!isExactHtxUsdtSwapKey(r?.contract)||!day(r?.archive_day)||!wanted.includes(r.archive_day)||!['EXACT_NATIVE_ONE_MINUTE_ARCHIVE_RETAINED_NOT_YET_PRICE_QUALIFIED','CHECKSUM_AND_1440_MINUTE_GRID_VERIFIED_PRICE_API_NOT_CROSSCHECKED','CLOSED_PRICE_HISTORY'].includes(r.status))return no('EXACT_VERIFIED_ARCHIVE_RECEIPTS_REQUIRED');
  const key=r.contract+'|'+r.archive_day;if(known.has(key))return no('DUPLICATE_VERIFIED_ARCHIVE_RECEIPT');known.add(key);if(counts.has(r.contract))counts.set(r.contract,counts.get(r.contract)+1);
 }
 const candidates=[];
 for(const d of wanted)for(const row of census.rows){const key=row.contract+'|'+d;if(!known.has(key))candidates.push({contract:row.contract,archive_day:d,verified_days:counts.get(row.contract)});}
 candidates.sort((a,b)=>a.verified_days-b.verified_days||b.archive_day.localeCompare(a.archive_day)||a.contract.localeCompare(b.contract));
 const slots=source_http_reservation/2,planned=candidates.slice(0,slots).map(x=>{const native=x.contract+'-PERP',name=`${native}-klines-1m-${x.archive_day}.zip`,key=`historical_data/futures/daily/klines/${native}/1m/${name}`;return {...x,archive_key:key,archive_url:'https://futures.htx.com/data/'+key,checksum_url:'https://futures.htx.com/data/'+key+'.CHECKSUM',cold_path:`htx/${x.contract}/${x.archive_day}`,source_http_reserved:2,availability_unproven:true,price_or_volume_qualified:false};});
 return {schema:'HTX_COLD_HISTORY_BACKFILL_PLAN_V1',status:planned.length?'BOUNDED_ACQUISITION_PLAN_CLOSED':'REQUESTED_WINDOW_ALREADY_VERIFIED',window_end_day,window_days,assets:102,verified_slots:known.size,missing_slots:candidates.length,planned_slots:planned.length,planned_source_http:planned.length*2,source_http_reservation,unused_source_http:source_http_reservation-planned.length*2,fairness:'FEWEST_VERIFIED_DAYS_THEN_NEWEST_DAY_THEN_CONTRACT',planned,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,actual_ENTRY:false,complete_30d_102_assets:false,complete_90d_102_assets:false,project_complete:false};
}
