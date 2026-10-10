import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {collectChainSupplyEvidence,normalizeChainSupply} from '../files/src/chain-supply-evidence.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
import {consumeBlockResultContext,auditRenderedBlockResults} from '../files/src/block-result-context.mjs';
import {auditCandidateBlocks,planCandidateEvidenceRoutes} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {SOURCE_POLICIES,planEvidenceSourceRequest} from '../files/src/evidence-source-adapters.mjs';
import {canonicalFingerprint,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';

const SYSTEM_START=1506203091,EPOCH_LENGTH=432000,NOW=Date.parse('2026-10-05T04:00:00Z');
const TIP_EPOCH=Math.floor((NOW/1000-SYSTEM_START)/EPOCH_LENGTH),CURRENT=TIP_EPOCH-1,PREVIOUS=TIP_EPOCH-2;
const identity={chain:'cardano',asset_kind:'NATIVE',native_asset_id:'cardano:mainnet',contract_or_mint:null};
function memoryDB(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;}};},async batch(rows){return Promise.all(rows.map(row=>row.run()));}};}
function payload(url,{badNetwork=false,badConservation=false}={}){
 if(url.endsWith('/tip'))return[{hash:'a'.repeat(64),epoch_no:TIP_EPOCH,block_time:Math.floor(NOW/1000)-30}];
 if(url.endsWith('/genesis'))return[{networkmagic:badNetwork?1:764824073,networkid:'Mainnet',epochlength:EPOCH_LENGTH,slotlength:1,maxlovelacesupply:'45000000000000000',systemstart:SYSTEM_START}];
 const epoch=Number(new URL(url).searchParams.get('_epoch_no')),supply=epoch===CURRENT?35000000000000000n:34999000000000000n,reserves=45000000000000000n-supply+(badConservation?1n:0n);
 return[{epoch_no:epoch,supply:String(supply),reserves:String(reserves)}];
}

test('Koios exact ADA route yields bounded N02 and N03 report facts with no vote',async()=>{
 const db=memoryDB(),urls=[],admissions=[];
 const out=await collectChainSupplyEvidence({db,contract:'ADA-USDT',asset_identity:identity,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',run_id:'ADA_KOIOS',now:NOW,clock:()=>NOW,request_admit:row=>{admissions.push(row);return{allowed:true};},fetch_impl:async url=>{urls.push(url);return new Response(JSON.stringify(payload(url)));}});
 assert.equal(out.status,'CLOSED');assert.equal(out.network_calls,4);assert.equal(admissions[0].attempts,4);assert.equal(urls.length,4);assert.deepEqual(out.evidence.map(row=>row.block_id),['N02','N03']);
 assert.deepEqual(out.evidence.map(row=>row.metric_family),['CARDANO_ACTIVE_SUPPLY_OBSERVATION','SUPPLY_REDUCTION_CHECK']);assert.ok(out.evidence.every(row=>row.provider_id==='KOIOS_NATIVE_SUPPLY'&&row.coverage_fraction===.25));
 assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
 const context=consumeBlockResultContext({evidence:out.evidence,contract:'ADA-USDT',now:NOW});assert.deepEqual(context.facts.map(row=>row.block_id),['N03']);assert.match(context.facts[0].value,/сжигание, выкуп и влияние на цену не подтверждены/);assert.ok(context.facts.every(row=>row.score_contribution===0));
 const sources={CHAIN_SUPPLY:out,CHAIN_SUPPLY_COMPARISON:{...out,check_completed:true}};const audit=auditCandidateBlocks({sources,evidence:out.evidence,decision_ts:NOW});assert.equal(audit.blocks.N02.usable_facts,0);assert.equal(audit.blocks.N03.usable_facts,1);
 db.sqlite.close();
});

test('Koios ADA route fails closed for wrong network or broken supply conservation',async()=>{
 for(const mode of [{badNetwork:true},{badConservation:true}]){const db=memoryDB(),out=await collectChainSupplyEvidence({db,contract:'ADA-USDT',asset_identity:identity,run_id:`FAIL_${JSON.stringify(mode)}`,now:NOW,clock:()=>NOW,request_admit:()=>({allowed:true}),fetch_impl:async url=>new Response(JSON.stringify(payload(url,mode)))});assert.notEqual(out.status,'CLOSED');assert.equal(out.evidence.length,0);db.sqlite.close();}
 for(const [contract,id] of [['ADA-USDT',{...identity,asset_kind:'TOKEN',contract_or_mint:'addr1wrapped'}],['BR-USDT',identity],['ADA-USDT',{...identity,native_asset_id:'cardano:testnet'}]])assert.equal(normalizeChainSupply({contract,identity:id,current:{supply:'1',decimals:6,source_ts:NOW,finalized:true},observed_ts:NOW}).status,'EXACT_ASSET_IDENTITY_REQUIRED');
});

test('Cardano route and public quota are explicit and bounded',()=>{
 const plan=planCandidateEvidenceRoutes({contract:'ADA-USDT',asset_identity:identity,run_id:'PLAN'});assert.equal(plan.nativeSupplyEligible,true);assert.ok(plan.routes.some(row=>row.name==='CHAIN_SUPPLY'));
 assert.equal(planCandidateEvidenceRoutes({contract:'OTHER-USDT',asset_identity:identity}).nativeSupplyEligible,false);
 assert.equal(SOURCE_POLICIES.KOIOS_NATIVE_SUPPLY.daily_cap,48);assert.equal(SOURCE_POLICIES.KOIOS_NATIVE_SUPPLY.official_public_daily_cap,5000);assert.equal(SOURCE_POLICIES.KOIOS_NATIVE_SUPPLY.retries,0);
 assert.equal(planEvidenceSourceRequest({source:'KOIOS_NATIVE_SUPPLY',htx_contract:'ADA-USDT',asset_id:'cardano:native:mainnet',registry_verified:true,methods:4}).allowed,true);assert.equal(planEvidenceSourceRequest({source:'KOIOS_NATIVE_SUPPLY',htx_contract:'ADA-USDT',asset_id:'cardano:native:mainnet',registry_verified:true,methods:3}).allowed,false);
});

test('verified Cardano facts retain historical V5 and full manual layouts',()=>{
 const c=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical,tip=Math.floor((c.observed_ts/1000-SYSTEM_START)/EPOCH_LENGTH),epoch=tip-1,prior=epoch-1,closedAt=e=>(SYSTEM_START+(e+1)*EPOCH_LENGTH)*1000;
 const normalized=normalizeChainSupply({identity,contract:'ADA-USDT',identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',previous:{chain:'cardano',address:'native:mainnet',supply:'34999000000000000',decimals:6,block_ref:`epoch:${prior}`,source_ts:closedAt(prior),finalized:true,epoch_no:prior},current:{supply:'35000000000000000',decimals:6,block_ref:`epoch:${epoch}`,source_ts:closedAt(epoch),finalized:true,epoch_no:epoch,supply_measure:'CARDANO_ACTIVE_SUPPLY',unit:'lovelace',provider_query:'KOIOS_TOTALS_CLOSED_EPOCH',max_supply:'45000000000000000'},observed_ts:c.observed_ts});
 c.direction='LONG';c.state='OBSERVE';c.metadata.contract='ADA-USDT';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:c.observed_ts+600000,next_recheck_ts:c.observed_ts+60000,cancel_condition:'price<1'};
 c.metadata.internal_market_context.evidence_v2.evidence=normalized.evidence;c.metadata.supporting_context={facts:consumeBlockResultContext({evidence:normalized.evidence,contract:'ADA-USDT',now:c.observed_ts}).facts};c.source_receipts=[];c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c),telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}),proof=auditRenderedBlockResults({canonical:c,manual,telegram});assert.equal(manual.ok,true);assert.equal(telegram.ok,true);assert.deepEqual(proof.used_context_block_ids,['N03']);assert.deepEqual(proof.telegram_used_context_block_ids,['N03']);for(const rendered of [manual.text,telegram.text]){assert.doesNotMatch(rendered,/Активное предложение нативного ADA/);assert.match(rendered,/Сравнение активного предложения ADA/);}assert.equal(proof.telegram_delivery_proven,false);
});
