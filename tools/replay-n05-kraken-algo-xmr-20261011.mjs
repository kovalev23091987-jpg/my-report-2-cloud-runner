import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
import {normalizeKrakenNativeFlow,krakenNativeMarketCode,qualifiedKrakenNativeComponent} from '../current-generation/files/src/kraken-four-hour-flow.mjs';
import {KRAKEN_PUBLIC_TAKER_REFERENCE} from '../current-generation/files/src/kraken-public-taker-reference.mjs';
import {availableFlowContext,validateAvailableFlowEvidence} from '../current-generation/files/src/joint-spot-futures-flow.mjs';
import {consumeBlockResultContext} from '../current-generation/files/src/block-result-context.mjs';

const root='checkpoints/n05-kraken-algo-xmr-38135993119/',summary=JSON.parse(fs.readFileSync(root+'batch-summary.json'));
const sha=b=>createHash('sha256').update(b).digest('hex'),raw={};
for(const receipt of summary.sources){
 const compressed=fs.readFileSync(root+receipt.file),body=gunzipSync(compressed);
 if(sha(compressed)!==receipt.gzip_sha256||sha(body)!==receipt.body_sha256)throw Error('ORIGINAL_SOURCE_HASH_MISMATCH:'+receipt.name);
 raw[receipt.name]=JSON.parse(body);
}
const original=fs.readFileSync('checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz');
if(sha(original)!==summary.original_HTX_identity_sha256)throw Error('ORIGINAL_HTX_IDENTITY_HASH_MISMATCH');
const identities=normalizeHtxAssetReferences(JSON.parse(gunzipSync(original)));
const out={schema:'N05_KRAKEN_ALGO_XMR_CONSUMER_REPLAY_20261011_V1',source_run:summary.run,source_head:summary.head,source_main:summary.main,source_summary:root+'batch-summary.json',original_source_bodies_verified:summary.sources.length,sourceHTTP_replay:0,D1_replay:0,MAIN:0,Telegram:0,score_contribution:0,new_fresh_SENT:false,actual_same_run_report_or_telegram_proven:false,assets:[]};
for(const symbol of ['ALGO','XMR']){
 const contract=symbol+'-USDT',identity=identities.entries[symbol].identities[0],market=krakenNativeMarketCode(contract);
 const hits=Object.values(raw['KRAKEN-CURRENT-ASSET-PAIRS'].result).filter(v=>v.altname===market);
 if(hits.length!==1)throw Error('AMBIGUOUS_CURRENT_MARKET:'+symbol);
 const receipt=summary.sources.find(v=>v.name==='KRAKEN-'+symbol+'-HISTORY-1');
 const component=normalizeKrakenNativeFlow({contract,identity,instrument:hits[0],candles:raw['KRAKEN-'+symbol+'-NATIVE240'],pages:[raw['KRAKEN-'+symbol+'-HISTORY-1']],window_end_ts:summary.window_end_ts,observed_ts:receipt.received_ts,direction_reference:KRAKEN_PUBLIC_TAKER_REFERENCE});
 if(!qualifiedKrakenNativeComponent(component,KRAKEN_PUBLIC_TAKER_REFERENCE)||component.status!==summary.windows.find(v=>v.symbol===symbol).status)throw Error('INDEPENDENT_NORMALIZATION_FAILED:'+symbol+':'+component.reason);
 const now=receipt.received_ts+1,context=availableFlowContext({primary:null,external:{components:[component]},contract,now});
 if(!context.check_completed||!validateAvailableFlowEvidence(context.evidence[0],now))throw Error('CONSUMER_REJECTED:'+symbol+':'+context.reason);
 const used=consumeBlockResultContext({contract,now,evidence:context.evidence});
 if(!used.facts?.some(f=>f.block_id==='N05'))throw Error('N05_FACT_NOT_USED:'+symbol);
 out.assets.push({symbol,contract,status:component.status,verified_minutes:component.verified_minutes,trade_count:component.trade_count,buy_quote:component.buy_quote,sell_quote:component.sell_quote,window_start_ts:component.window_start_ts,window_end_ts:component.window_end_ts,observed_ts:component.observed_ts,source_root:component.physical_root,consumer_status:context.status,consumer_evidence_id:context.evidence[0].evidence_id,limited_one_venue:true,joint_direction_proven:false,score_contribution:0});
}
out.individual_full_window_assets_added=out.assets.length;out.total_individual_full_window_assets_ever_if_merged=34;out.N05_complete=false;
fs.writeFileSync('checkpoints/N05_KRAKEN_ALGO_XMR_CONSUMER_REPLAY_20261011.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:'REPLAY_VERIFIED',assets:out.assets.map(x=>x.symbol),original_source_bodies_verified:out.original_source_bodies_verified}));
