import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
import {normalizeBitfinexNativeFlow,qualifiedBitfinexNativeComponent} from '../current-generation/files/src/bitfinex-native-four-hour-flow.mjs';
import {availableFlowContext,validateAvailableFlowEvidence} from '../current-generation/files/src/joint-spot-futures-flow.mjs';
import {consumeBlockResultContext} from '../current-generation/files/src/block-result-context.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const read=(path,expected)=>{const b=fs.readFileSync(path);if(sha(b)!==expected)throw Error('ORIGINAL_GZIP_HASH_MISMATCH:'+path);return JSON.parse(gunzipSync(b));};
const prior=JSON.parse(fs.readFileSync('checkpoints/N05_BITFINEX_THREE_ASSET_ORIGINAL_REPLAY_20261011.json'));
const original=read('checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',prior.retained_htx_identity_sha256);
const identities=normalizeHtxAssetReferences(original);
const catalog=read('checkpoints/n05-bitfinex-pilot-38138499328/BITFINEX-CURRENT-CATALOG.json.gz',prior.retained_catalog_sha256);
const clocks={DASH:1791720971979,ALGO:1791720974692,XMR:1791720977667};
const out={schema:'N05_BITFINEX_THREE_ASSET_CONSUMER_REPLAY_20261011_V1',source_runs:[38138499328,38138608166],sourceHTTP_replay:0,D1_replay:0,MAIN:0,Telegram:0,score_contribution:0,new_fresh_SENT:false,actual_same_run_report_or_telegram_proven:false,assets:[],N05_complete:false};
for(const asset of prior.assets){
 const symbol=asset.symbol,contract=asset.contract,identity=identities.entries[symbol]?.identities?.[0];
 const root='checkpoints/n05-bitfinex-pilot-38138608166/BITFINEX-'+symbol+'-',candles=read(root+'CANDLES1M.json.gz',asset.candle_gzip_sha256),trades=read(root+'TRADES10000.json.gz',asset.trade_gzip_sha256);
 const component=normalizeBitfinexNativeFlow({contract,identity,catalog,candles,trades,window_end_ts:prior.window_end_ts,observed_ts:clocks[symbol]});
 if(!qualifiedBitfinexNativeComponent(component)||component.verified_minutes!==240||component.trade_count!==asset.trade_count||Math.abs(component.buy_quote-asset.buy_quote)>1e-6||Math.abs(component.sell_quote-asset.sell_quote)>1e-6)throw Error('INDEPENDENT_NORMALIZATION_FAILED:'+symbol+':'+component.reason);
 const now=clocks[symbol]+1,context=availableFlowContext({primary:null,external:{components:[component]},contract,now});
 if(!context.check_completed||!validateAvailableFlowEvidence(context.evidence[0],now))throw Error('AVAILABLE_CONSUMER_REJECTED:'+symbol+':'+context.reason);
 const used=consumeBlockResultContext({contract,now,evidence:context.evidence});if(!used.facts?.some(f=>f.block_id==='N05'))throw Error('N05_FACT_NOT_USED:'+symbol);
 out.assets.push({symbol,contract,venue:'BITFINEX',physical_root:component.physical_root,quote:'USD',window_start_ts:component.window_start_ts,window_end_ts:component.window_end_ts,observed_ts:component.observed_ts,verified_minutes:component.verified_minutes,trade_count:component.trade_count,buy_quote:component.buy_quote,sell_quote:component.sell_quote,consumer_status:context.status,consumer_evidence_id:context.evidence[0].evidence_id,limited_one_venue:true,joint_direction_proven:false,score_contribution:0});
}
fs.writeFileSync('checkpoints/N05_BITFINEX_THREE_ASSET_CONSUMER_REPLAY_20261011.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:'REPLAY_VERIFIED',assets:out.assets.map(x=>x.symbol)}));
