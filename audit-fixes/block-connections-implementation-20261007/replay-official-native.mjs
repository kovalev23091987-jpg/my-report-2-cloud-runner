import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {normalizeGithubReleases} from '../../current-generation/files/src/github-official-releases.mjs';
import {consumeBlockResultContext} from '../../current-generation/files/src/block-result-context.mjs';
const input='checkpoints/actual-official-native-feeds-37577657718.json.gz';
const bytes=await fs.readFile(input),actual=JSON.parse(gunzipSync(bytes));
const results=actual.components.map(c=>{
 const response=actual.responses.find(r=>r.contract===c.contract);
 const result=normalizeGithubReleases({contract:c.contract,asset_identity:c.identity,asset_metadata:c.metadata,feed_url:response.url,body:JSON.stringify(response.payload),observed_ts:c.result.evidence[0].observed_ts});
 const consumer=consumeBlockResultContext({contract:c.contract,evidence:result.evidence,now:c.decision_ts});
 if(result.status!=='CLOSED_BOUNDED_OFFICIAL_FEED_CHECK'||result.events.length!==0||consumer.facts.length!==1)throw Error('ORIGINAL_CLOCK_ACTUAL_REPLAY_MISMATCH');
 return{contract:c.contract,status:result.status,event_count:0,source_ts:result.evidence[0].source_ts,observed_ts:result.evidence[0].observed_ts,original_decision_ts:c.decision_ts,checked:true,new_useful_event:false,enabled_new_production_feed:false};
});
const proof={schema:'OFFICIAL_NATIVE_ORIGINAL_CLOCK_REPLAY_20261007',head:process.env.GITHUB_SHA,source_head:actual.head,source_run:actual.run,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,trading:0,new_fresh_SENT:false,results};
await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/official-native-original-clock-replay.json',JSON.stringify(proof,null,2)+'\n');await fs.writeFile('audit-output/actual-official-native-feeds-37577657718.json.gz',bytes);console.log(JSON.stringify(proof));
