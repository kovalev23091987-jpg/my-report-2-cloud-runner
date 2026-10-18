import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const moduleURL=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {normalizeCoinBossLiquidationLevels}=await import(moduleURL('coinboss-liquidation-levels.mjs'));
const {normalizeSwolechartsLiquidationLevels}=await import(moduleURL('swolecharts-liquidation-levels.mjs'));
const {normalizeOrderlyPublicPositions}=await import(moduleURL('orderly-public-liquidation-positions.mjs'));
const {buildPumpLiquidationZones}=await import(moduleURL('pump-liquidation-zones.mjs'));
const {displayBriefTelegramLiquidations,RELEVANT_LIQUIDATION_PRESENTATION}=await import(moduleURL('canonical-display.mjs'));
const coinboss=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../checkpoints/source-inputs/coinboss-liq-levels-102-original-20261012.json.gz',import.meta.url))));
const swole=JSON.parse(fs.readFileSync(new URL('../../checkpoints/source-inputs/swolecharts-liq-levels-bounded-20261013.json',import.meta.url)));
const cases=[];
for(const base of ['FIL','AAVE']){
 const raw=coinboss.rows.find(row=>row.requested===base).response,now=raw.data.updatedAt+1000;
 cases.push({name:'CoinBoss '+base,contract:base+'-USDT',now,reference:raw.data.price,source_ts:raw.data.updatedAt,result:normalizeCoinBossLiquidationLevels(raw,{contract:base+'-USDT',reference_price:raw.data.price,observed_ts:now})});
}
for(const base of ['FIL','STRK']){
 const raw=swole.rows.find(row=>row.coin===base).raw,now=raw.as_of+1000;
 cases.push({name:'Swolecharts '+base,contract:base+'-USDT',now,reference:raw.price,source_ts:raw.as_of,result:normalizeSwolechartsLiquidationLevels(raw,{contract:base+'-USDT',reference_price:raw.price,observed_ts:now})});
}
// Orderly's full original platform-position body is not retained here. This
// is the existing controlled HYPE example, not a new AAVE/source qualification.
const orderlyNow=1791830239542,orderlyRaw={success:true,ts:orderlyNow-1000,data:{total_positions:2,rows:[{symbol:'PERP_HYPE_USDC',side:'LONG',mark_price:'83.228',est_liq_price:'80.0944114',notional:'6824.696',margin_mode:'CROSS'},{symbol:'PERP_HYPE_USDC',side:'SHORT',mark_price:'83.228',est_liq_price:'85.1',notional:'120000',margin_mode:'CROSS'}]}};
cases.push({name:'Orderly controlled HYPE',contract:'HYPE-USDT',now:orderlyNow,reference:83.46,source_ts:orderlyRaw.ts,result:normalizeOrderlyPublicPositions(orderlyRaw,{contract:'HYPE-USDT',reference_price:83.46,now:orderlyNow}),controlled:true});
const rows=c=>c.result.scenarios||c.result.levels;
const map=(c,contract=c.contract,input=rows(c))=>buildPumpLiquidationZones({contract,current_price:c.reference,observed_ts:c.now,...(c.result.scenarios?{external_calculated_scenarios:input}:{projected:input})});
const count=(c,p)=>c.result.scenarios?p.calculated_scenario_count:p.provider_zone_count;
for(const c of cases){
 test(`${c.name} normalized rows retain their verified HTX contract and original source clock`,()=>{assert.equal(c.result.status,'CLOSED');assert.ok(rows(c).length);assert.ok(rows(c).every(row=>row.htx_contract===c.contract));assert.ok(rows(c).every(row=>row.source_ts===c.source_ts&&row.decision_target_eligible===false));});
 test(`${c.name} same-asset rows remain useful with the existing model/position distinction and compact display`,()=>{const p=map(c);assert.ok(count(c,p)>0);assert.equal(p.htx_source_backed_model.status,'DISABLED_BY_OWNER_ON_REQUEST_ONLY');if(c.result.scenarios){assert.equal(p.provider_zone_count,0);assert.ok(p.calculated_scenarios.every(row=>row.notional===null&&row.scenario_only&&row.decision_target_eligible===false));}const lines=displayBriefTelegramLiquidations(p,x=>String(x),{policy:RELEVANT_LIQUIDATION_PRESENTATION});assert.ok(lines.length);});
 test(`${c.name} rows cannot become a different asset's projected levels at a controlled identical reference price`,()=>{const p=map(c,c.contract==='FIL-USDT'?'AAVE-USDT':'FIL-USDT');assert.equal(count(c,p),0);assert.equal(p.status,'NOT_CLOSED');});
 test(`${c.name} legacy rows with missing contract do not close newly assembled coverage`,()=>{const p=map(c,c.contract,rows(c).map(row=>{const copy={...row};delete copy.htx_contract;return copy;}));assert.equal(count(c,p),0);});
}
test('mixed exact and foreign model rows retain only the matching original source clocks',()=>{
 const exact=cases[0],foreign=cases[1],p=map(exact,exact.contract,[...rows(exact),...rows(foreign)]);assert.equal(p.calculated_scenario_count,rows(exact).length);assert.ok(p.calculated_scenarios.every(row=>row.source==='CoinBoss'&&row.source_ts===exact.source_ts));
});
