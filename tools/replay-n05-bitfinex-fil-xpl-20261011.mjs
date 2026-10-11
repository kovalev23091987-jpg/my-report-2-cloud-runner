import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
import {normalizeBitfinexNativeFlow,qualifiedBitfinexNativeComponent} from '../current-generation/files/src/bitfinex-native-four-hour-flow.mjs';
import {availableFlowContext,validateAvailableFlowEvidence} from '../current-generation/files/src/joint-spot-futures-flow.mjs';
import {consumeBlockResultContext,auditRenderedBlockResults} from '../current-generation/files/src/block-result-context.mjs';
import {canonicalFingerprint,renderCanonicalTelegram} from '../current-generation/files/src/canonical-publication.mjs';
import {formatManualReport} from '../current-generation/files/src/manual-report-formatter.mjs';

const root='checkpoints/n05-bitfinex-fil-xpl-38140143266',summary=JSON.parse(fs.readFileSync(root+'/batch-summary.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=(path,expected)=>{const b=fs.readFileSync(path);assert.equal(sha(b),expected,path);return JSON.parse(gunzipSync(b));};
assert.equal(summary.sourceHTTP,4);assert.equal(summary.D1.unknown_ops,0);
assert.equal(summary.status,'BITFINEX_FIL_XPL_ORIGINAL_WINDOW_RETAINED_NOT_QUALIFIED');
const htx=normalizeHtxAssetReferences(read('checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',summary.original_HTX_identity_sha256));
const catalog=read(summary.retained_catalog.path,summary.retained_catalog.gzip_sha256);
const original={schema:'N05_BITFINEX_FIL_XPL_ORIGINAL_REPLAY_20261011_V1',source_run:38140143266,sourceHTTP_replay:0,window_start_ts:summary.window_start_ts,window_end_ts:summary.window_end_ts,retained_catalog:summary.retained_catalog,original_HTX_identity_file:summary.original_HTX_identity_file,original_HTX_identity_sha256:summary.original_HTX_identity_sha256,assets:[],N05_complete:false};
const consumer={schema:'N05_BITFINEX_FIL_XPL_CONSUMER_REPLAY_20261011_V1',source_run:38140143266,sourceHTTP_replay:0,D1_replay:0,MAIN:0,Telegram:0,new_fresh_SENT:false,actual_same_run_report_or_telegram_proven:false,score_contribution:0,assets:[],N05_complete:false};
for(const asset of summary.assets){
 const symbol=asset.symbol,contract=symbol+'-USDT',identityEntry=htx.entries[symbol],identity=identityEntry?.identities?.[0];
 assert.equal(identityEntry?.status,'CLOSED',symbol);assert.equal(identityEntry.binding_scope,'EXACT_NATIVE_CHAIN_TYPE_0',symbol);
 assert.equal(identity.chain,asset.network);assert.equal(identity.asset_kind,'NATIVE');
 const candleReceipt=summary.sources.find(r=>r.name==='BITFINEX-'+symbol+'-CANDLES1M'),tradeReceipt=summary.sources.find(r=>r.name==='BITFINEX-'+symbol+'-TRADES10000');
 for(const receipt of [candleReceipt,tradeReceipt])assert.equal(receipt?.http_status,200,symbol);
 const candles=read(root+'/'+candleReceipt.file,candleReceipt.gzip_sha256),trades=read(root+'/'+tradeReceipt.file,tradeReceipt.gzip_sha256);
 const component=normalizeBitfinexNativeFlow({contract,identity,catalog,candles,trades,window_end_ts:summary.window_end_ts,observed_ts:tradeReceipt.received_ts});
 assert.equal(qualifiedBitfinexNativeComponent(component),true,symbol+': '+component.reason);assert.equal(component.verified_minutes,240);assert.equal(component.native_network_reference_url,asset.official_network_reference);
 assert.equal(component.trade_count,trades.length);assert.ok(component.buy_quote+component.sell_quote>0);
 original.assets.push({symbol,contract,identity,identity_binding_scope:identityEntry.binding_scope,excluded_wrapped_bindings:identityEntry.wrapped_bindings_excluded,official_network_reference:asset.official_network_reference,market:asset.market,official_label:asset.official_label,verified_minutes:component.verified_minutes,trade_count:component.trade_count,buy_quote:component.buy_quote,sell_quote:component.sell_quote,nonzero_minutes:candles.length,candle_gzip_sha256:candleReceipt.gzip_sha256,trade_gzip_sha256:tradeReceipt.gzip_sha256,trade_candle_base_high_low_reconciled:true,full_response_below_limit:true});
 const now=tradeReceipt.received_ts+1,flow=availableFlowContext({primary:null,external:{components:[component]},contract,now});
 assert.equal(flow.check_completed,true,symbol+': '+flow.reason);assert.equal(validateAvailableFlowEvidence(flow.evidence[0],now),true);
 const facts=consumeBlockResultContext({contract,now,evidence:flow.evidence}).facts;assert.ok(facts.some(f=>f.block_id==='N05'));
 const canonical=structuredClone(JSON.parse(fs.readFileSync('checkpoints/btw-preserved-block-result-input-20261004.json')).canonical);
 canonical.observed_ts=now;canonical.metadata.contract=contract;canonical.metadata.internal_market_context.evidence_v2.evidence=flow.evidence;canonical.metadata.supporting_context={facts};canonical.direction='LONG';canonical.state='OBSERVE';canonical.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};canonical.analytical_fingerprint=canonicalFingerprint(canonical);
 const manual=formatManualReport(canonical);assert.equal(manual.ok,true);assert.match(manual.text,/BITFINEX/);assert.match(manual.text,/данные одной биржи/);
 for(const context_policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical,lifecycle_event:'OBSERVE',context_policy});assert.equal(telegram.ok,true,telegram.status);assert.match(telegram.text,/BITFINEX/);const audit=auditRenderedBlockResults({canonical,manual,telegram});assert.deepEqual(audit.used_context_block_ids,['N05']);assert.deepEqual(audit.telegram_used_context_block_ids,['N05']);assert.equal(audit.telegram_delivery_proven,false);}
 consumer.assets.push({symbol,contract,venue:'BITFINEX',physical_root:component.physical_root,window_start_ts:component.window_start_ts,window_end_ts:component.window_end_ts,observed_ts:component.observed_ts,verified_minutes:240,trade_count:component.trade_count,buy_quote:component.buy_quote,sell_quote:component.sell_quote,consumer_status:flow.status,consumer_evidence_id:flow.evidence[0].evidence_id,limited_one_venue:true,manual_rendered:true,both_approved_telegram_forms_rendered:true,joint_direction_proven:false,score_contribution:0});
}
fs.writeFileSync('checkpoints/N05_BITFINEX_FIL_XPL_ORIGINAL_REPLAY_20261011.json',JSON.stringify(original,null,2)+'\n');
fs.writeFileSync('checkpoints/N05_BITFINEX_FIL_XPL_CONSUMER_REPLAY_20261011.json',JSON.stringify(consumer,null,2)+'\n');
console.log(JSON.stringify({status:'ORIGINAL_AND_CONSUMER_REPLAY_VERIFIED',assets:consumer.assets.map(a=>a.symbol),sourceHTTP_replay:0}));
