import {createHash} from 'node:crypto';
import {discoverDydxRecentBlockAccounts} from './dydx-block-account-discovery.mjs';

// Offline, read-only producer. Never makes requests or authorizes an HTX entry.
// Schema/risk reference: dydxprotocol/v4-chain e278fb0032d511ebfdc58e8dcc7aba3164057c50.
// SerializableInt is Go math/big Gob version1, not ASCII; stdlib go1.23.0/intmarsh.go.
const MAX_BYTES=2_000_000, MAX_U64=(1n<<64n)-1n, PPM=1_000_000n;
const PATHS=['/dydxprotocol.subaccounts.Query/SubaccountAll','/dydxprotocol.perpetuals.Query/AllPerpetuals','/dydxprotocol.perpetuals.Query/AllLiquidityTiers','/dydxprotocol.prices.Query/AllMarketPrices','/dydxprotocol.assets.Query/AllAssets'];
const fail=reason=>{throw Error(reason);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const trustedSnapshots=new WeakMap();
function snapshotDigest(s){return hash(JSON.stringify({...s,perpetuals:[...s.perpetuals],tiers:[...s.tiers],prices:[...s.prices],assets:[...s.assets]},(_,v)=>typeof v==='bigint'?String(v):v));}
export function verifyDydxPinnedSnapshot(s){try{return trustedSnapshots.has(s)&&trustedSnapshots.get(s)===snapshotDigest(s);}catch{return false;}}
function fields(bytes){
 let i=0;const rows=[];
 const uint=()=>{let value=0n;for(let shift=0n;shift<70n;shift+=7n){if(i>=bytes.length)fail('PROTO_TRUNCATED');const x=bytes[i++];value|=BigInt(x&127)<<shift;if(!(x&128)){if(value>MAX_U64)fail('PROTO_UINT64_BOUND');return value;}}fail('PROTO_VARINT_BOUND');};
 while(i<bytes.length){if(rows.length>=10000)fail('PROTO_FIELD_BOUND');const key=uint(),field=Number(key>>3n),wire=Number(key&7n);if(field<1||field>536870911)fail('PROTO_FIELD_INVALID');let value;
  if(wire===0)value=uint();else if(wire===2){const n=Number(uint());if(!Number.isSafeInteger(n)||n>MAX_BYTES||i+n>bytes.length)fail('PROTO_BYTES_BOUND');value=bytes.subarray(i,i+n);i+=n;}
  else if(wire===1||wire===5){const n=wire===1?8:4;if(i+n>bytes.length)fail('PROTO_FIXED_BOUND');value=bytes.subarray(i,i+n);i+=n;}else fail('PROTO_WIRE_UNSUPPORTED');rows.push({field,wire,value});
 }return rows;
}
function one(rows,id,wire,defaultValue){const found=rows.filter(x=>x.field===id);if(found.length>1||found.some(x=>x.wire!==wire))fail('PROTO_SINGULAR_FIELD');if(!found.length){if(defaultValue===undefined)fail('PROTO_REQUIRED_INPUT');return defaultValue;}return found[0].value;}
const uint=(rows,id)=>{const n=one(rows,id,0,0n);if(n<0n||n>0xffffffffn)fail('PROTO_UINT32_BOUND');return Number(n);};
const zig=(rows,id)=>{const n=uint(rows,id);return n%2?-(n+1)/2:n/2;};
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
function nativeID(f){const owner=text(one(f,1,2)),number=uint(f,2);if(!/^dydx1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(owner)||number>=128000)fail('SUBACCOUNT_ID_INVALID');return{owner,number};}
function hexMessage(s){if(typeof s!=='string'||!/^(?:[A-Fa-f0-9]{2}){1,180}$/.test(s))fail('QUERY_PROTO_BOUND');return fields(Buffer.from(s,'hex'));}
export function permittedDydxReadOnlyBody(body){try{
 if(Array.isArray(body)&&body[0]?.id===3&&body.length>=5&&body.length<=8){return permittedDydxReadOnlyBody(body.slice(0,4))&&body.slice(4).every((r,i)=>r?.jsonrpc==='2.0'&&r.id===7+i&&r.method==='block'&&Object.keys(r).sort().join(',')==='id,jsonrpc,method,params'&&r.params&&Object.keys(r.params).join(',')==='height'&&r.params.height===String(BigInt(body[0].params.height)-BigInt(i))&&BigInt(r.params.height)>0n);}

 if(body?.jsonrpc==='2.0'&&body.id===1&&body.method==='status'&&body.params&&Object.keys(body.params).length===0&&Object.keys(body).sort().join(',')==='id,jsonrpc,method,params')return true;
 const rows=Array.isArray(body)?body:[body];if(!rows.length||rows.length>8||new Set(rows.map(r=>r?.id)).size!==rows.length)return false;
 for(const r of rows){if(r?.jsonrpc!=='2.0'||r.method!=='abci_query'||Object.keys(r).sort().join(',')!=='id,jsonrpc,method,params'||!r.params||Object.keys(r.params).sort().join(',')!=='data,height,path,prove'||!/^\d{1,18}$/.test(r.params.height)||BigInt(r.params.height)<=0n||r.params.prove!==false)return false;}
 if(!Array.isArray(body)&&body.id===2&&body.params.path===PATHS[0]){const f=hexMessage(body.params.data);if(f.length!==1||f[0].field!==1||f[0].wire!==2)return false;const p=fields(f[0].value);if(p.some(x=>![1,2,3].includes(x.field))||uint(p,3)!==20)return false;const key=one(p,1,2,Buffer.alloc(0)),offset=one(p,2,0,0n);return key.length<=100&&offset<=2560n&&!(key.length&&offset>0n);}
 if(Array.isArray(body)&&body.length===4&&body.every((r,i)=>r.id===i+3&&r.params.path===PATHS[i+1]&&r.params.data==='0A0318F403'))return true;
 if(Array.isArray(body)&&body.every((r,i)=>r.id===20+i&&r.params.path==='/dydxprotocol.subaccounts.Query/Subaccount')){const ids=body.map(r=>{const f=hexMessage(r.params.data);if(f.length!==1||f[0].field!==1||f[0].wire!==2)fail('QUERY_ID_REQUIRED');const id=nativeID(fields(f[0].value));return id.owner+':'+id.number;});return new Set(ids).size===ids.length;}
 return false;
 }catch{return false;}}
function vi(n){if(n<0n||n>MAX_U64)fail('QUERY_UINT_BOUND');const out=[];do{let b=Number(n&127n);n>>=7n;out.push(n?b|128:b);}while(n);return Buffer.from(out);}
const byteField=(id,b)=>Buffer.concat([vi(BigInt(id*8+2)),vi(BigInt(b.length)),b]);
export function dydxAccountQueryBody(accounts,height){if(!Array.isArray(accounts)||accounts.length<1||accounts.length>8)fail('QUERY_ACCOUNT_BOUND');const result=accounts.map((a,i)=>{nativeID([{field:1,wire:2,value:Buffer.from(a.owner??'')},{field:2,wire:0,value:BigInt(a.number)}]);const id=Buffer.concat([byteField(1,Buffer.from(a.owner)),Buffer.concat([vi(16n),vi(BigInt(a.number))])]);return{jsonrpc:'2.0',id:20+i,method:'abci_query',params:{path:'/dydxprotocol.subaccounts.Query/Subaccount',data:byteField(1,id).toString('hex').toUpperCase(),height,prove:false}};});if(!permittedDydxReadOnlyBody(result))fail('EXACT_NATIVE_QUERY_REQUIRED');return result;}
export function dydxAccountPageBody({height,offset=0,key=null}={}){if(!Number.isSafeInteger(offset)||offset<0||offset>2560||offset%20||key!==null&&(typeof key!=='string'||!/^[a-f0-9]{2,200}$/i.test(key)||key.length%2))fail('BOUNDED_NATIVE_PAGE_REQUIRED');const p=Buffer.concat([...(key?[byteField(1,Buffer.from(key,'hex'))]:offset?[Buffer.concat([vi(16n),vi(BigInt(offset))])]:[]),Buffer.from('1814','hex')]);const body={jsonrpc:'2.0',id:2,method:'abci_query',params:{path:PATHS[0],data:byteField(1,p).toString('hex').toUpperCase(),height,prove:false}};if(!permittedDydxReadOnlyBody(body))fail('EXACT_NATIVE_PAGE_REQUIRED');return body;}
export function decodeDydxGobInt(bytes){if(!Buffer.isBuffer(bytes)||bytes.length>257)fail('GOB_BYTES_BOUND');if(!bytes.length)return 0n;if(bytes[0]>>1!==1)fail('GOB_VERSION_UNSUPPORTED');let n=0n;for(const b of bytes.subarray(1))n=(n<<8n)|BigInt(b);return bytes[0]&1?-n:n;}
const gob=(rows,id)=>decodeDydxGobInt(one(rows,id,2));
const expBound=n=>{if(!Number.isInteger(n)||Math.abs(n)>30)fail('DECIMAL_EXPONENT_BOUND');return n;};
function unique(rows,key){const map=new Map();for(const row of rows){if(map.has(row[key]))fail('DUPLICATE_NATIVE_ID');map.set(row[key],row);}return map;}
function collection(payload,id,height,limit,complete){
 const r=payload?.result?.response;if(payload?.id!==id||payload?.error||!r||![0,'0',undefined].includes(r.code)||String(r.height)!==height||typeof r.value!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(r.value))fail('PINNED_QUERY_NOT_CLOSED');
 const b=Buffer.from(r.value,'base64');if(b.length>MAX_BYTES||b.toString('base64')!==r.value)fail('PROTO_BASE64_INVALID');const f=fields(b),records=f.filter(x=>x.field===1);if(records.some(x=>x.wire!==2)||records.length>limit)fail('NATIVE_RECORD_BOUND');const page=one(f,2,2,Buffer.alloc(0)),next=one(fields(page),1,2,Buffer.alloc(0));if(complete&&next.length)fail('CONTEXT_CATALOG_PARTIAL');return{records:records.map(x=>fields(x.value)),partial:next.length>0};
}
export function decodeDydxPinnedSnapshot({raw,now,max_age_ms=120000}){
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(max_age_ms)||max_age_ms<=0||max_age_ms>120000||!Array.isArray(raw?.raw)||raw.raw.length!==3)fail('BOUNDED_ORIGINAL_SNAPSHOT_REQUIRED');
 for(const row of raw.raw){const r=row.receipt,body=row.raw_body_utf8;if(r?.url!=='https://dydx-rpc.publicnode.com/'||r.method!=='POST'||r.http_status!==200||typeof body!=='string'||Buffer.byteLength(body)>MAX_BYTES||Buffer.byteLength(body)!==r.bytes||hash(body)!==r.sha256||!Number.isSafeInteger(r.received_ts)||r.received_ts>now||now-r.received_ts>max_age_ms||!Number.isSafeInteger(r.started_ts)||r.started_ts>r.received_ts||JSON.stringify(JSON.parse(body))!==JSON.stringify(row.payload))fail('ORIGINAL_HTTP_RECEIPT_NOT_CLOSED');}
 const status=raw.raw[0],accounts=raw.raw.slice(1).find(r=>r.receipt.request_body?.params?.path===PATHS[0]||Array.isArray(r.receipt.request_body)&&r.receipt.request_body[0]?.id===20),context=raw.raw.slice(1).find(r=>Array.isArray(r.receipt.request_body)&&r.receipt.request_body[0]?.id===3);if(!accounts||!context||accounts===context)fail('PINNED_RECEIPT_ROLES_REQUIRED');const s=status.payload?.result,source_ts=Date.parse(s?.sync_info?.latest_block_time),height=String(s?.sync_info?.latest_block_height||'');
 if(status.payload?.id!==1||status.payload.error||status.receipt.request_body?.method!=='status'||status.receipt.request_body.id!==1||s?.node_info?.network!=='dydx-mainnet-1'||s?.sync_info?.catching_up!==false||!/^\d+$/.test(height)||BigInt(height)<=0n||!Number.isSafeInteger(source_ts)||source_ts>status.receipt.received_ts||now-source_ts>max_age_ms||!/^[a-fA-F0-9]{64}$/.test(s.sync_info.latest_block_hash||''))fail('NATIVE_BLOCK_CLOCK_NOT_CLOSED');
 if(raw.raw.some(r=>r.receipt.received_ts<source_ts)||raw.raw.slice(1).some(r=>r.receipt.started_ts<status.receipt.received_ts))fail('NATIVE_QUERY_RECEIPT_ORDER_INVALID');
 if(!raw.raw.every(r=>permittedDydxReadOnlyBody(r.receipt.request_body)))fail('EXACT_PINNED_REQUEST_BINDING_REQUIRED');const requestRows=[accounts.receipt.request_body,context.receipt.request_body].flat();if(requestRows.some(r=>r.method==='abci_query'&&r.params.height!==height)||context.receipt.request_body[0].params.height!==height)fail('EXACT_PINNED_REQUEST_BINDING_REQUIRED');
 if(!Array.isArray(context.payload)||context.payload.length!==context.receipt.request_body.length||new Set(context.payload.map(r=>r.id)).size!==context.receipt.request_body.length||context.payload.some(r=>!context.receipt.request_body.some(q=>q.id===r.id)))fail('PINNED_CONTEXT_BATCH_INVALID');
 const activity=context.receipt.request_body.length>=5?discoverDydxRecentBlockAccounts({payload:context.payload.filter(r=>r.id>=7),chain_id:s.node_info.network,height,source_ts,block_hash:s.sync_info.latest_block_hash}):null;
 if(activity?.selected_accounts.length){if(!Array.isArray(accounts.receipt.request_body))fail('ACTIVITY_EXACT_ACCOUNT_BATCH_REQUIRED');const requested=accounts.receipt.request_body.map(q=>nativeID(fields(one(hexMessage(q.params.data),1,2))));if(JSON.stringify(requested)!==JSON.stringify(activity.selected_accounts.map(({owner,number})=>({owner,number}))))fail('NATIVE_ACTIVITY_REQUESTED_IDENTITY_MISMATCH');}else if(activity&&Array.isArray(accounts.receipt.request_body))fail('EMPTY_ACTIVITY_REQUIRES_BOUNDED_NATIVE_PAGE');

 let ac;if(Array.isArray(accounts.receipt.request_body)){if(!Array.isArray(accounts.payload)||accounts.payload.length!==accounts.receipt.request_body.length||new Set(accounts.payload.map(r=>r.id)).size!==accounts.payload.length)fail('EXACT_ACCOUNT_BATCH_REQUIRED');const records=[];for(const req of accounts.receipt.request_body){const requested=nativeID(fields(one(hexMessage(req.params.data),1,2))),response=accounts.payload.find(r=>r.id===req.id),parsed=collection(response,req.id,height,1,true);if(parsed.records.length!==1)fail('REQUESTED_SUBACCOUNT_NOT_FOUND');const actual=nativeID(fields(one(parsed.records[0],1,2)));if(actual.owner!==requested.owner||actual.number!==requested.number)fail('NATIVE_ACCOUNT_RESPONSE_IDENTITY_MISMATCH');records.push(...parsed.records);}ac={records,partial:true};}else ac=collection(accounts.payload,2,height,20,false);
 const catalogs=[3,4,5,6].map(id=>collection(context.payload.find(r=>r.id===id),id,height,500,true));
 const perpetuals=unique(catalogs[0].records.map(f=>{const p=fields(one(f,1,2));return{id:uint(p,1),ticker:text(one(p,2,2)),market_id:uint(p,3),atomic_resolution:expBound(zig(p,4)),liquidity_tier:uint(p,6),market_type:uint(p,7),funding_index:gob(f,2)};}),'id');
 const tiers=unique(catalogs[1].records.map(f=>{const r={id:uint(f,1),initial_margin_ppm:uint(f,3),maintenance_fraction_ppm:uint(f,4)};if(r.initial_margin_ppm<1||r.initial_margin_ppm>1000000||r.maintenance_fraction_ppm<1||r.maintenance_fraction_ppm>1000000)fail('MARGIN_FRACTION_INVALID');return r;}),'id');
 const prices=unique(catalogs[2].records.map(f=>({id:uint(f,1),exponent:expBound(zig(f,2)),price:one(f,3,0,0n)})),'id');
 const assets=unique(catalogs[3].records.map(f=>({id:uint(f,1),symbol:text(one(f,2,2)),atomic_resolution:expBound(zig(f,7))})),'id');
 const quote=assets.get(0);if(!quote||quote.symbol!=='USDC'||quote.atomic_resolution!==-6||assets.size!==1)fail('QUOTE_ASSET_MODEL_UNSUPPORTED');
 const subaccounts=ac.records.map(f=>{const id=fields(one(f,1,2)),owner=text(one(id,1,2)),number=uint(id,2);if(!/^dydx1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(owner)||number>=128000)fail('SUBACCOUNT_ID_INVALID');
  const parseMany=(field,parser)=>{const xs=f.filter(x=>x.field===field);if(xs.length>100||xs.some(x=>x.wire!==2))fail('SUBACCOUNT_POSITION_BOUND');return xs.map(x=>parser(fields(x.value)));};
  const positions=parseMany(3,p=>({id:uint(p,1),quantums:gob(p,2),funding_index:gob(p,3),quote_balance:gob(p,4)})),asset_positions=parseMany(2,p=>({id:uint(p,1),quantums:gob(p,2)}));unique(positions,'id');unique(asset_positions,'id');return{owner,number,positions,asset_positions,margin_enabled:uint(f,4)};
 });unique(subaccounts.map(a=>({id:a.owner+':'+a.number})),'id');
 const page=!Array.isArray(accounts.payload)?one(fields(Buffer.from(accounts.payload.result.response.value,'base64')),2,2,Buffer.alloc(0)):Buffer.alloc(0),nextKey=one(fields(page),1,2,Buffer.alloc(0));if(nextKey.length>100)fail('NEXT_PAGE_KEY_BOUND');
 const snapshot={schema:'DYDX_PINNED_SNAPSHOT_V1',source_ts,height,block_hash:s.sync_info.latest_block_hash,chain_id:s.node_info.network,perpetuals,tiers,prices,assets,subaccounts,partial_account_sample:ac.partial,account_request_kind:Array.isArray(accounts.payload)?'EXACT_SUBACCOUNT_BATCH':'BOUNDED_SUBACCOUNT_PAGE',next_page_key_hex:nextKey.length?nextKey.toString('hex'):null,run_id:raw.run_id,activity_discovery:activity,receipts:[status,accounts,context].map(r=>r.receipt)};trustedSnapshots.set(snapshot,snapshotDigest(snapshot));return snapshot;
}
const floor=(n,d)=>{let q=n/d;return n<0n&&n%d?q-1n:q;};
const ceil=(n,d)=>{let q=n/d;return n>0n&&n%d?q+1n:q;};
const abs=n=>n<0n?-n:n;
function notional(q,perp,price,value){const n=q*value,e=price.exponent+perp.atomic_resolution+6;return e<0?n/(10n**BigInt(-e)):n*(10n**BigInt(e));}
// Exact protocol rounding: signed notional truncates toward0; base IMR ceil,
// MMR ceil of base IMR * maintenance fraction; aggregate funding floor once.
export function dydxAccountRisk(snapshot,account,override=null){
 let nc=0n,mmr=0n,funding_ppm=0n;for(const a of account.asset_positions){if(a.id!==0&&a.quantums!==0n)fail('MULTICOLLATERAL_UNSUPPORTED');nc+=a.quantums;}
 for(const p of account.positions){const perp=snapshot.perpetuals.get(p.id),price=perp&&snapshot.prices.get(perp.market_id),tier=perp&&snapshot.tiers.get(perp.liquidity_tier);if(!perp||!price||price.price<=0n||!tier||perp.market_type!==1||account.margin_enabled!==0)fail('COMPLETE_CROSS_ACCOUNT_INPUTS_REQUIRED');const value=override?.id===p.id?override.price:price.price;if(value<0n||value>MAX_U64)fail('ORACLE_UINT64_BOUND');const n=notional(p.quantums,perp,price,value),positiveNotional=notional(abs(p.quantums),perp,price,value);const baseImr=ceil(positiveNotional*BigInt(tier.initial_margin_ppm),PPM);mmr+=ceil(baseImr*BigInt(tier.maintenance_fraction_ppm),PPM);nc+=n+p.quote_balance;funding_ppm-= (perp.funding_index-p.funding_index)*p.quantums;}
 const funding=floor(funding_ppm,PPM);nc+=funding;return{net_collateral_quantums:nc,maintenance_margin_quantums:mmr,funding_quantums:funding,liquidatable:mmr>0n&&mmr>nc};
}
export function calculateDydxConditionalLevels(snapshot,{crypto_assets}={}){
 if(!(crypto_assets instanceof Set)||!crypto_assets.size)fail('VERIFIED_CRYPTO_UNIVERSE_REQUIRED');const levels=[],accounts=[];
 for(const account of snapshot.subaccounts){if(!account.positions.some(p=>p.quantums!==0n))continue;const start=levels.length,detail={owner:account.owner,number:account.number,levels:0};accounts.push(detail);
  try{
   // Never silently discard other positions to inflate a crypto account's equity.
   const names=account.positions.map(p=>snapshot.perpetuals.get(p.id)?.ticker);if(names.some(t=>typeof t!=='string'||!t.endsWith('-USD')||t.length<=4))fail('COMPLETE_NATIVE_PRODUCT_IDENTITY_REQUIRED');
   const risk=dydxAccountRisk(snapshot,account);Object.assign(detail,{status:'VERIFIED_COMPLETE_ACCOUNT',net_collateral_quantums:String(risk.net_collateral_quantums),maintenance_margin_quantums:String(risk.maintenance_margin_quantums),funding_quantums:String(risk.funding_quantums)});if(risk.liquidatable){detail.status='ALREADY_LIQUIDATABLE_NOT_FUTURE_LEVEL';continue;}
   for(const p of account.positions){if(p.quantums===0n)continue;const perp=snapshot.perpetuals.get(p.id);if(!crypto_assets.has(perp.ticker.slice(0,-4)))continue;const price=snapshot.prices.get(perp.market_id),isShort=p.quantums<0n;let safe=price.price,unsafe;
    const isLiquidatable=v=>dydxAccountRisk(snapshot,account,{id:p.id,price:v}).liquidatable;
    if(isShort){unsafe=safe;for(let step=0;step<64&&!isLiquidatable(unsafe);step++){if(unsafe===MAX_U64)break;unsafe=unsafe>MAX_U64/2n?MAX_U64:unsafe*2n;}if(!isLiquidatable(unsafe))continue;}
    else{unsafe=1n;if(!isLiquidatable(unsafe)){const e=price.exponent+perp.atomic_resolution+6;unsafe=e<0?ceil(10n**BigInt(-e),abs(p.quantums)):1n;if(unsafe>=safe||!isLiquidatable(unsafe))continue;}}
    for(let step=0;step<64&&abs(unsafe-safe)>1n;step++){const mid=(unsafe+safe)/2n;if(isLiquidatable(mid))unsafe=mid;else safe=mid;}
    if(abs(unsafe-safe)!==1n||!isLiquidatable(unsafe)||isLiquidatable(safe)||(isShort?unsafe<=price.price:unsafe>=price.price))fail('CONDITIONAL_THRESHOLD_BRACKET_NOT_CLOSED');
    if(unsafe>BigInt(Number.MAX_SAFE_INTEGER)||price.price>BigInt(Number.MAX_SAFE_INTEGER))fail('DISPLAY_ORACLE_INTEGER_PRECISION_UNAVAILABLE');
    const numericPrice=Number(unsafe)*10**price.exponent,reference=Number(price.price)*10**price.exponent;if(!Number.isFinite(numericPrice)||numericPrice<=0||!Number.isFinite(reference)||reference<=0)fail('NUMERIC_PRICE_UNAVAILABLE');
    levels.push({provider:'DYDX_PINNED_NATIVE',upstream_group:'DYDX_MAINNET_CHAIN',asset:perp.ticker.slice(0,-4),external_contract:perp.ticker,owner:account.owner,subaccount:account.number,perpetual_id:p.id,position_side:isShort?'SHORT':'LONG',position_quantums:String(p.quantums),position_atomic_resolution:perp.atomic_resolution,price:numericPrice,reference_price:reference,price_quote:'USD',collateral_asset:'USDC',oracle_price_integer:String(unsafe),adjacent_safe_oracle_integer:String(safe),oracle_exponent:price.exponent,source_ts:snapshot.source_ts,height:snapshot.height,block_hash:snapshot.block_hash,run_id:snapshot.run_id,level_kind:'CALCULATED_CONDITIONAL_ACCOUNT_THRESHOLD',calculated:true,exact_exchange_native_liquidation_price:false,method:'DYDX_COMPLETE_CROSS_ACCOUNT_FUNDING_AND_INTEGER_MMR_THRESHOLD_V1',assumptions:['OTHER_ORACLES_FIXED_AT_PINNED_BLOCK','POSITIONS_AND_COLLATERAL_FIXED','FUNDING_INDEX_FIXED_AT_PINNED_BLOCK','NO_INTERVENING_TRADES_TRANSFERS_OR_FEES'],sample_scope:'BOUNDED_PARTIAL_PUBLIC_SUBACCOUNT_SAMPLE',full_market_coverage:false,htx_native_level:false,entry_eligible:false,target_eligible:false,volume_aggregation_eligible:false});detail.levels++;
   }
  }catch(error){levels.splice(start);detail.levels=0;detail.status='NOT_CLOSED';detail.reason=error.message;}
 }return{status:levels.length?'VERIFIED_CONDITIONAL_LEVELS':'NO_VERIFIED_CONDITIONAL_LEVELS',levels,accounts,full_account_census:false,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,production_activation:false};
}
