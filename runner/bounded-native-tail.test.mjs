import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {tailNativeEvidence,captureCollectorNativeTail} from './bounded-native-tail.mjs';
const version='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',now=Date.now(),context={opened_ts:now-1000,received_ts:now,version};
const counter={requests:2,rows_read:60,rows_written:3,unknown_ops:0};
const native=()=>({schema:'PUBLIC_COLLECTOR_NATIVE_INVOCATION_USAGE_V1',invocation_id:'native-tail-exact',started_ts:now-800,completed_ts:now-200,native_D1:counter,private_price_source_D1:{requests:0,rows_read:0,rows_written:0,unknown_ops:0},collector_excluding_private_price_source_D1:counter,native_totals_closed:true,additional_SQL:0,daily_total:false});
const frame=()=>({scriptName:'my-report-2-hub',eventTimestamp:now-900,event:{cron:'*/5 * * * *'},exceptions:[{message:'unrelated private exception must not be exported'}],logs:[{message:['UNRELATED_PRIVATE','do not export'],timestamp:now-700},{message:['REPORT2_PUBLIC_COLLECTOR_NATIVE_D1',JSON.stringify(native())],timestamp:now-100}]});
const liveFrame=()=>{const e=frame(),r=native();e.eventTimestamp=now;e.logs[1].timestamp=now;r.started_ts=now;r.completed_ts=now;e.logs[1].message[1]=JSON.stringify(r);return e;};
const deployment=(v=version)=>({deployments:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',strategy:'percentage',versions:[{version_id:v,percentage:100}]}]});
function harness({send=frame(),foreign=false,cleanupFails=false,blockedHost=false,socketFails=false,guardLate=false,requireCollection=false}={}){
 const calls=[],saves=[],sockets=[];let reads=0,guards=0;
 class Socket extends EventTarget{constructor(){super();this.closed=false;sockets.push(this);queueMicrotask(()=>{this.dispatchEvent(new Event('open'));for(const f of send===null?[]:Array.isArray(send)?send:[send])this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(f)}));});}send(x){calls.push({socket_send:JSON.parse(x)});}close(){this.closed=true;this.dispatchEvent(new Event('close'));}}
 const call=async(path,opt={})=>{calls.push({path,...opt});if(path.endsWith('/deployments'))return deployment(foreign&&++reads>1?other:version);if(path.endsWith('/tails')&&opt.method==='POST')return{id:'0123456789abcdef0123456789abcdef',url:blockedHost?'wss://foreign.example/secret':'wss://tail.developers.workers.dev/secret-tail-token',expires_at:new Date(now+1000000).toISOString()};if(opt.method==='DELETE'){if(cleanupFails)throw Error('DELETE_ACK_FAILED');return null;}throw Error('FORBIDDEN_ROUTE');};
 return{calls,saves,sockets,run:()=>captureCollectorNativeTail({call,guard:async()=>{if(guardLate&&++guards===4)throw Error('MAIN_MOVED');},clock:()=>now,max_wait_ms:10,require_collection:requireCollection,save:async p=>saves.push(structuredClone(p)),open:()=>{if(socketFails)throw Error('SOCKET_FAILED');return new Socket();}})};
}
test('tail evidence distinguishes explicit vs requested version binding and exports only the native receipt',()=>{
 const p=tailNativeEvidence(frame(),context);assert.equal(p.length,1);assert.equal(p[0].version_binding_basis,'EXACT_TAIL_VERSION_FILTER_AND_STABLE_DEPLOYMENT');assert.equal(p[0].receipt.native_D1.rows_read,60);assert.doesNotMatch(JSON.stringify(p),/UNRELATED_PRIVATE|private exception/);assert.equal(p[0].daily_total,false);
 const e=frame();e.scriptVersion={id:version};assert.equal(tailNativeEvidence(e,context)[0].version_binding_basis,'EXPLICIT_TAIL_EVENT_VERSION');
});
test('foreign, stale, truncated, non-cron and conflicting frames cannot become native acceptance',()=>{
 for(const edit of [e=>e.scriptName='foreign',e=>e.event.cron='foreign',e=>e.eventTimestamp=now-2000,e=>e.eventTimestamp=now-500,e=>e.truncated=true,e=>e.scriptVersion={id:other}]){const e=frame();edit(e);assert.deepEqual(tailNativeEvidence(e,context),[]);}
 const e=frame(),r=native();r.native_D1={...counter,rows_read:61};e.logs.push({message:['REPORT2_PUBLIC_COLLECTOR_NATIVE_D1',JSON.stringify(r)],timestamp:now-100});assert.deepEqual(tailNativeEvidence(e,context),[]);assert.deepEqual(tailNativeEvidence(frame(),{...context,opened_ts:null}),[]);
});
test('one temporary exact-version tail observes a regular cron and is removed without settings or Worker invocation',async()=>{
 const h=harness({send:liveFrame()}),r=await h.run();assert.equal(r.status,'REGULAR_COLLECTOR_NATIVE_TAIL_OBSERVED');assert(r.tail_created&&r.tail_deleted);assert.equal(r.websocket_connections,1);assert.equal(r.receipts.length,1);assert(h.sockets[0].closed);assert.deepEqual(h.calls.find(c=>c.method==='POST').body.filters,[{query:'REPORT2_PUBLIC_COLLECTOR_NATIVE_D1'},{scriptVersion:version}]);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);assert.equal(h.calls.filter(c=>c.method==='DELETE').length,1);assert.equal(r.settings_changed,false);assert.equal(r.Worker_invocations,0);assert.equal(r.SQL,0);assert.equal(r.daily_total,null);assert.doesNotMatch(JSON.stringify(r),/secret-tail-token|foreign.example/);
});
test('quiet window, blocked host and socket failure still remove only the created tail with no retry',async()=>{
 for(const options of [{send:null},{blockedHost:true},{socketFails:true}]){const h=harness(options),r=await h.run();assert.equal(r.status,'TAIL_OBSERVATION_NOT_ACCEPTED');assert(r.tail_deleted);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);assert.equal(h.calls.filter(c=>c.method==='DELETE').length,1);assert.equal(r.receipts.length,0);}
});
test('a moved Worker or late expired main guard refuses attribution after own-tail cleanup',async()=>{
 for(const options of [{foreign:true},{guardLate:true}]){const h=harness({...options,send:liveFrame()}),r=await h.run();assert.equal(r.status,'TAIL_OBSERVATION_NOT_ACCEPTED');assert(r.tail_deleted);assert.deepEqual(r.receipts,[]);assert(r.attribution_refused);}
});
test('a failed own cleanup stays explicit and unaccepted instead of deleting other tails or claiming success',async()=>{
 const h=harness({send:liveFrame(),cleanupFails:true}),r=await h.run();assert.equal(r.status,'TAIL_OBSERVATION_NOT_ACCEPTED');assert.equal(r.tail_deleted,false);assert(r.cleanup_unconfirmed);assert.equal(h.calls.filter(c=>c.method==='DELETE').length,1);assert(h.calls.filter(c=>c.method==='DELETE').every(c=>c.path.endsWith('/0123456789abcdef0123456789abcdef')));
});
test('wire and frame bounds stop observation and preserve cleanup',async()=>{
 const h=harness({send:{huge:'x'.repeat(262145)}}),r=await h.run();assert.equal(r.stream_status,'TAIL_WIRE_OR_FRAME_BOUND');assert(r.tail_deleted);assert.equal(r.status,'TAIL_OBSERVATION_NOT_ACCEPTED');
});
test('collection qualification preserves a no-op receipt and continues to a distinct CLOSED invocation within the same bounded connection',async()=>{
 const noop=liveFrame();noop.logs.push({message:['REPORT2_PUBLIC_COLLECTOR_NOOP','{}'],timestamp:now});const closed=liveFrame(),r=native();r.invocation_id='second-closed-invocation';r.started_ts=now;r.completed_ts=now;closed.logs[1].message[1]=JSON.stringify(r);closed.logs.push({message:['REPORT2_PUBLIC_COLLECTOR_CLOSED','{}'],timestamp:now});
 const h=harness({send:[noop,closed],requireCollection:true}),out=await h.run();assert.equal(out.status,'REGULAR_COLLECTOR_NATIVE_TAIL_OBSERVED');assert.equal(out.frames,2);assert.equal(out.receipts.length,2);assert.deepEqual(out.receipts.map(r=>r.invocation_kind),['NOOP','COLLECTOR_CLOSED']);assert.equal(out.websocket_connections,1);assert(out.tail_deleted);
 const q=await harness({send:noop,requireCollection:true}).run();assert.equal(q.status,'TAIL_OBSERVATION_NOT_ACCEPTED');assert.equal(q.receipts.length,1);assert.equal(q.target_satisfied,false);assert(q.tail_deleted);
});
test('tail mode is disabled by default, remains under inspection and never uses command-line retries or a source endpoint',()=>{
 const y=fs.readFileSync(new URL('../.github/workflows/current-hourly-native-observer-repair.yml',import.meta.url),'utf8'),s=fs.readFileSync(new URL('../tools/read-current-native-cost-observations.mjs',import.meta.url),'utf8');assert.match(y,/tail_collector:[\s\S]+?default: false/);assert.match(y,/TAIL_NATIVE_COLLECTOR: \$\{\{ inputs\.tail_collector \}\}/);assert.match(s,/tailMode\?600000:60000/);assert.match(s,/ownTailId&&path===/);assert.doesNotMatch(s,/wrangler tail|workers\.dev.*fetch|--test-scheduled|runner-main|D1_BRIDGE/);
});
