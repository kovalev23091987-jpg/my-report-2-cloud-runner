import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const root='audit-output/n06-coingecko-top15-saved-replay';
const zip='checkpoints/n06-coingecko-trending-pengu-38147765446.zip';
const hash=x=>createHash('sha256').update(x).digest('hex');
const member=x=>execFileSync('unzip',['-p',zip,x],{maxBuffer:400000});
const plan={schema:'N06_COINGECKO_SAVED_TOP15_REPLAY_V1',target_assets:['PENGU','NEAR','ETH','SOL'],sourceHTTP:0,D1:0,MAIN:0,Telegram:0,new_fresh_SENT:false};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
await fs.mkdir(root,{recursive:true});
const original=JSON.parse(member('batch-summary.json').toString());
if(original.run!=='38147765446'||original.status!=='ACTUAL_EXACT_ATTENTION_FACT_IN_CONTROLLED_REPORT'||original.sourceHTTP!==2)throw Error('ORIGINAL_RUN_NOT_ACCEPTED');
const trendingBytes=gunzipSync(member('trending-search-list.json.gz'));
const metadataBytes=gunzipSync(member('exact-token-metadata.json.gz'));
if(hash(trendingBytes)!==original.originals[1].body_sha256||hash(metadataBytes)!==original.originals[0].body_sha256)throw Error('ORIGINAL_BODY_HASH_MISMATCH');
const trending=JSON.parse(trendingBytes),metadata=JSON.parse(metadataBytes);
const manifest=JSON.parse(await fs.readFile('checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json'));
if(manifest.rows?.length!==104||metadata.id!=='pudgy-penguins'||metadata.symbol!=='pengu'||metadata.platforms?.solana!=='2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv')throw Error('EXACT_PENGU_OR_104_MANIFEST_MISSING');
const [{buildEvidenceV2},{NATIVE_SECTOR_BINDINGS,exactNativeSectorBinding},{consumeBlockResultContext},{consumeEvidenceV2},{buildRuntimeCanonicalBundle}]=await Promise.all([
 import('../runtime/src/evidence-source-adapters.mjs'),import('../runtime/src/coingecko-sector-evidence.mjs'),import('../runtime/src/block-result-context.mjs'),import('../runtime/src/evidence-v2.mjs'),import('../runtime/src/canonical-runtime-adapter.mjs')]);
const out={...plan,original_run:original.run,original_head:original.head,original_received_ts:original.originals[1].received_ts,original_body_sha256:original.originals[1].body_sha256,results:[],status:'NOT_CLOSED'};
const items=trending.coins;if(!Array.isArray(items)||items.length!==15)throw Error('TOP15_SCHEMA_INVALID');
for(const symbol of plan.target_assets){
 const route=manifest.rows.find(x=>x.symbol===symbol),binding=NATIVE_SECTOR_BINDINGS[symbol];
 let assetId,coinId,extra={};
 if(symbol==='PENGU'){
  if(route?.identity_status!=='CLOSED'||route.identity?.chain!=='solana'||route.identity?.contract_or_mint!==metadata.platforms.solana)throw Error('PENGU_IDENTITY_MISMATCH');
  assetId='solana:'+metadata.platforms.solana;coinId=metadata.id;extra.identity_body_sha256=original.originals[0].body_sha256;
 }else{
  if(route?.identity_status!=='CLOSED'||!exactNativeSectorBinding({...route.identity,asset_kind:'NATIVE'},route.contract))throw Error(symbol+'_NATIVE_IDENTITY_MISMATCH');
  assetId=binding.chain+':native:mainnet';coinId=binding.coin_id;extra={chain:binding.chain,native_asset_id:binding.chain+':mainnet',identity_body_sha256:null};
 }
 const matches=items.map((x,i)=>({item:x?.item,rank:i+1})).filter(x=>x.item?.id===coinId&&String(x.item?.symbol).toUpperCase()===symbol);
 if(matches.length!==1)throw Error(symbol+'_EXACT_TOP15_ITEM_MISSING');
 const rank=matches[0].rank,observed=original.originals[1].received_ts,decision=observed+1000;
 const evidence=buildEvidenceV2({provider_id:'COINGECKO_ATTENTION',upstream_id:'COINGECKO_SITE_SEARCH',asset_id:assetId,htx_contract:route.contract,block_id:'N06',metric_family:'COINGECKO_TRENDING_SEARCH_CONTEXT',origin_event_id:coinId+':'+observed,dependency_group:'COINGECKO_SITE_SEARCH:'+coinId+':'+observed,source_ts:observed,observed_ts:observed,expires_at:observed+3600000,coverage_status:'TOP_LIST_PRESENCE_ONLY',coverage_fraction:0,directional_strength:null,risk_strength:null,unit:'list_rank',value:rank,extra:{coin_id:coinId,rank,source_clock_policy:'OBSERVATION_TIME_NO_PROVIDER_EVENT_CLOCK',provider_role:'ADDITIONAL_ATTENTION_CONTEXT',directional_vote:false,unique_traders_claim:false,score_contribution:0,entry_authorized:false,trending_body_sha256:original.originals[1].body_sha256,...extra}});
 const context=consumeBlockResultContext({contract:route.contract,evidence:[evidence],now:decision});
 const weight=consumeEvidenceV2([evidence],{base_interest:70,decision_ts:decision});
 const input={contract:route.contract,run_id:'SAVED_TOP15:'+original.run,snapshot_id:'SAVED_TOP15:'+symbol+':'+observed,observed_ts:decision};
 const before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:{evidence:[evidence],sources:{COINGECKO_ATTENTION:{status:'CLOSED',evidence:[evidence]}}}}});
 const passed=context.facts.some(f=>f.block_id==='N06')&&after.manual.ok&&after.manual.text.includes('Интерес к поиску '+symbol)&&after.block_rendered_results.used_context_block_ids.includes('N06')&&JSON.stringify(before.canonical.scores)===JSON.stringify(after.canonical.scores)&&before.canonical.state===after.canonical.state&&before.canonical.direction===after.canonical.direction&&weight.adjustment===0;
 await fs.writeFile(root+'/controlled-'+symbol+'.txt',after.manual.text);
 out.results.push({symbol,contract:route.contract,coin_id:coinId,rank,asset_id:assetId,consumer_checked:passed,report_excerpt:context.facts.find(f=>f.block_id==='N06')?.value??null,report_sha256:hash(after.manual.text),score_adjustment:weight.adjustment,original_source_clock:observed});
 }
out.status=out.results.every(x=>x.consumer_checked)?'SAVED_ORIGINAL_EXACT_4_CONTROLLED_REPORT_PROOFS':'CONTROLLED_REPORT_REPLAY_FAILED';
await fs.writeFile(root+'/batch-summary.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,qualified:out.results.filter(x=>x.consumer_checked).map(x=>x.symbol),sourceHTTP:0}));
