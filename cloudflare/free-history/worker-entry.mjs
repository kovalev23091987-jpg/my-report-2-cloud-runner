import {archiveHour} from './hourly-archive.mjs';
import {archiveSpot} from './spot-archive.mjs';
import {observeCollectorD1} from '../public-collector/native-cost-observer.mjs';
import {hourlyNativeUsageReceipt} from './native-usage-receipt.mjs';

export default {
  async fetch() { return new Response('Not found',{status:404}); },
  async scheduled(controller,env) {
    const scheduled_ts=controller?.scheduledTime??Date.now();
    const invocation_id=crypto.randomUUID();
    let source=null,archive=null,completed=false;
    try {
    source=env?.DATA_DB?observeCollectorD1(env.DATA_DB):null;
    archive=env?.ARCHIVE_DB?observeCollectorD1(env.ARCHIVE_DB):null;
    env={...env,DATA_DB:source?.db,ARCHIVE_DB:archive?.db};
    const results=[];
    for (const [lane,run] of [
      ['HTX_FUTURES',()=>archiveHour({source_db:env?.DATA_DB,archive_db:env?.ARCHIVE_DB,scheduled_ts})],
      ['HTX_SPOT',()=>archiveSpot({venue:'HTX',archive_db:env?.ARCHIVE_DB,scheduled_ts})]
    ]) {
      try { results.push({lane,...await run()}); }
      catch(error) { results.push({lane,status:'ERROR',reason:String(error?.message??error).slice(0,160)}); }
    }
    const status=results.some(r=>r.status==='ERROR')?'ERROR':results.some(r=>r.status==='SOURCE_MISSING'||r.status==='FREE_STORAGE_GUARD'||r.status==='SOURCE_DAILY_CAP'||r.status==='PAIR_PARTIAL')?'PARTIAL':'CLOSED';
    const outcomes_json=JSON.stringify({scheduled_ts,results,report_triggered:false,telegram:false});
    await env.ARCHIVE_DB.prepare('DELETE FROM report2_archive_run_v1 WHERE scheduled_ts IN (SELECT scheduled_ts FROM report2_archive_run_v1 WHERE scheduled_ts<?1 ORDER BY scheduled_ts LIMIT 8)').bind(scheduled_ts-270*24*3_600_000).run();
    await env.ARCHIVE_DB.prepare('INSERT INTO report2_archive_run_v1(scheduled_ts,status,outcomes_json,created_ts) VALUES(?1,?2,?3,?4) ON CONFLICT(scheduled_ts) DO NOTHING').bind(scheduled_ts,status,outcomes_json,Date.now()).run();
    console.log('REPORT2_FREE_HISTORY_HOURLY',outcomes_json);
    if (results.some(r=>r.status==='ERROR')) throw Error('FREE_HISTORY_LANE_ERROR');
    completed=true;
    } finally {
      // Includes the run-log DELETE/INSERT and failures after lane completion.
      // Keep this in logs: persisting another receipt would add SQL and bytes.
      console.log('REPORT2_FREE_HISTORY_NATIVE_D1',JSON.stringify(hourlyNativeUsageReceipt({invocation_id,scheduled_ts,source,archive,completed})));
    }
  }
};
