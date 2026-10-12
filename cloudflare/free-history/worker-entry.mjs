import {archiveHour} from './hourly-archive.mjs';
import {archiveSpot} from './spot-archive.mjs';

export default {
  async fetch() { return new Response('Not found',{status:404}); },
  async scheduled(controller,env) {
    const scheduled_ts=controller?.scheduledTime??Date.now();
    const results=[];
    for (const [lane,run] of [
      ['HTX_FUTURES',()=>archiveHour({source_db:env?.DATA_DB,archive_db:env?.ARCHIVE_DB,scheduled_ts})],
      ['HTX_SPOT',()=>archiveSpot({venue:'HTX',archive_db:env?.ARCHIVE_DB,scheduled_ts})],
      ['GATE_SPOT_CANDIDATE',()=>archiveSpot({venue:'GATE',archive_db:env?.ARCHIVE_DB,scheduled_ts})]
    ]) {
      try { results.push({lane,...await run()}); }
      catch(error) { results.push({lane,status:'ERROR',reason:String(error?.message??error).slice(0,160)}); }
    }
    console.log('REPORT2_FREE_HISTORY_HOURLY',JSON.stringify({scheduled_ts,results,report_triggered:false,telegram:false}));
    if (results.some(r=>r.status==='ERROR')) throw Error('FREE_HISTORY_LANE_ERROR');
  }
};
