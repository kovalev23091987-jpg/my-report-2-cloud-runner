import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const originalKey=k=>typeof k==='string'&&/^pump:analysis:[a-f0-9]{64}$/.test(k);
export async function readSavedIdolDelay({store,implementation_sha256,first_run_id,instrument_id,wave_id}){
  if(first_run_id!=='3096f8e8-a9a1-45f6-8fe8-2bcc78829f61'||instrument_id!=='BINGX:USDT_M:101334:IDOL-USDT'||wave_id!=='PUMP:BINGX:USDT_M:101334:IDOL-USDT:1793329320000')throw Error('EXACT_IDOL_DELAY_SCOPE');
  const first_run=await store.get('pump:run:'+first_run_id);
  if(first_run?.run_id!==first_run_id||!Array.isArray(first_run.checked))throw Error('FIRST_RUN_NOT_BOUND');
  const first_check=first_run.checked.find(c=>c.analysis?.instrument?.instrument_id===instrument_id&&c.analysis.wave_id===wave_id);
  if(!first_check||!originalKey(first_check.analysis_key))throw Error('FIRST_IDOL_CHECK_NOT_FOUND');
  const readOriginal=async key=>{
    const o=await store.get(key),a=o?.analysis,i=o?.input;
    if(!a||!i||key!=='pump:analysis:'+sha(JSON.stringify(a))||o.implementation_sha256!==implementation_sha256||o.evidence_class!=='OBSERVED'||a.instrument?.instrument_id!==instrument_id||a.wave_id!==wave_id||a.mode!=='AUTO'||i.mode!=='AUTO'||a.run_purpose!=='PRODUCTION'||i.run_purpose!=='PRODUCTION'||a.run_id!==i.run_id||a.analysis_ts!==i.analysis_ts)throw Error('IDOL_ORIGINAL_NOT_BOUND');
    return o;
  };
  const first_original=await readOriginal(first_check.analysis_key);
  if(!equal(first_original.analysis,first_check.analysis))throw Error('FIRST_RUN_ANALYSIS_CONFLICT');
  const journal=await store.get('pump:journal:'+instrument_id+':'+wave_id);
  if(journal&&(!Array.isArray(journal.analyses)||journal.analyses.length>200||!Array.isArray(journal.publications)||journal.publications.length>200))throw Error('JOURNAL_BOUND');
  const readyRows=(journal?.analyses??[]).filter(r=>r.origin?.ready===true&&r.origin.mode==='AUTO'&&r.origin.run_purpose==='PRODUCTION'&&r.origin.instrument_id===instrument_id&&r.origin.wave_id===wave_id&&originalKey(r.analysis_id)&&Number.isSafeInteger(r.origin.t0)).sort((a,b)=>a.origin.t0-b.origin.t0);
  const earliest_ready_row=readyRows[0]??null;
  let earliest_ready_original=null,earliest_ready_run=null;
  if(earliest_ready_row){
    earliest_ready_original=earliest_ready_row.analysis_id===first_check.analysis_key?first_original:await readOriginal(earliest_ready_row.analysis_id);
    if(!earliest_ready_original.analysis.ready||earliest_ready_original.analysis.analysis_ts!==earliest_ready_row.origin.t0)throw Error('EARLIEST_READY_CONFLICT');
    const id=earliest_ready_original.analysis.run_id;
    if(!/^[A-Za-z0-9:._-]{1,160}$/.test(id))throw Error('READY_RUN_ID');
    earliest_ready_run=id===first_run_id?first_run:await store.get('pump:run:'+id);
    if(earliest_ready_run?.run_id!==id)throw Error('READY_RUN_NOT_BOUND');
  }
  const page=await store.scanPrefix('pump:card:',{after_key:'pump:card:',limit:20});
  if(!Array.isArray(page)||page.length>20)throw Error('CARD_PAGE_BOUND');
  const cards=page.filter(r=>r.value?.mode==='AUTO'&&r.value.analysis?.instrument?.instrument_id===instrument_id&&r.value.analysis.wave_id===wave_id).sort((a,b)=>a.value.created_ts-b.value.created_ts);
  let first_card_readback=null;
  if(cards.length){const row=cards[0],id=row.value.card_id;if(!/^PUMP:[a-f0-9]{64}$/.test(id)||row.key!=='pump:card:'+id)throw Error('CARD_KEY');first_card_readback=await store.get(row.key);if(!equal(first_card_readback,row.value))throw Error('CARD_CHANGED_NO_RETRY');}
  return {schema:'SAVED_IDOL_DELAY_ACTUAL_V1',first_run,first_check,first_original,journal,earliest_ready_row,earliest_ready_original,earliest_ready_run,cards,first_card_readback,
    scope:{first_run_PK:1,first_original_PK:1,journal_PK:1,earliest_ready_original_PK_max:1,earliest_ready_run_PK_max:1,card_page_limit:20,card_readback_PK_max:1,business_queries_max:7,total_queries_max:11,hard_query_cap:16,rows_read_cap:500,rows_write_cap:30,originals_max:2,whole_history_claimed:false},market_HTTP:0,Telegram:0,reanalysis:false};
}
