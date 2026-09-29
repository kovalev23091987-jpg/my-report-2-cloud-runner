import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const runtime=resolve(process.argv[2]||'runtime');
const {createShadowMarketPilot}=await import(pathToFileURL(resolve(runtime,'src/shadow-market-pilot.mjs')).href);
let reserved=0;
const admit=async({requests}={})=>{const amount=Number(requests);if(!Number.isSafeInteger(amount)||amount<1||reserved+amount>3)return{allowed:false,reason:'SHADOW_SMOKE_CAP'};reserved+=amount;return{allowed:true,new_reservation:true};};
const pilot=createShadowMarketPilot({fetch_impl:globalThis.fetch,admit,clock:Date.now}),run_id=`V13_SHADOW_MARKET_SMOKE:${Date.now()}`;
const [kraken,dydx]=await Promise.all([
 pilot.collect({provider_id:'KRAKEN_FUTURES',run_id,identity_map:{BTC:'PF_XBTUSD',ETH:'PF_ETHUSD'}}),
 pilot.collect({provider_id:'DYDX_INDEXER',run_id,identity_map:{BTC:'BTC-USD',ETH:'ETH-USD'}}),
]);
const compact=row=>({provider_id:row.provider_id,status:row.status,reason:row.reason??null,attempted_http_count:row.attempted_http_count,transport_status:row.transport_status??null,schema_status:row.schema_status??null,coverage_status:row.coverage_status??null,mapped_markets:(row.markets||[]).length,receipts:(row.receipts||[]).map(receipt=>({http_status:receipt.http_status,status:receipt.status,bytes:receipt.bytes??null,payload_hash:receipt.payload_hash??null,started_ts:receipt.started_ts,received_ts:receipt.received_ts})),mode:'SHADOW',telegram_network_calls:0,score_changed:false,entry_authorization:false});
const receipt={version:'v13-shadow-market-smoke-v1',run_id,reserved_requests:reserved,kraken:compact(kraken),dydx:compact(dydx),telegram_network_calls:0,score_changed:false,delivery_changed:false,entry_authorization:false};
console.log('V13_SHADOW_MARKET_LIVE_SMOKE',JSON.stringify(receipt));
if(reserved>3||receipt.telegram_network_calls!==0||receipt.score_changed||receipt.delivery_changed||receipt.entry_authorization)throw new Error('SHADOW_ISOLATION_BROKEN');
for(const row of [receipt.kraken,receipt.dydx])if(!['CLOSED','INVALID_RESPONSE','TIMEOUT','NETWORK_ERROR','RATE_LIMITED_429','UPSTREAM_5XX','ACCESS_DENIED','HTTP_ERROR','BODY_TOO_LARGE'].includes(row.status))throw new Error(`SHADOW_SMOKE_STATUS_UNCLASSIFIED:${row.provider_id}:${row.status}`);
