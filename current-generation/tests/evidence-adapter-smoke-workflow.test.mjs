import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('K16 live smoke is isolated from manual queue, full analytics and Telegram',()=>{
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 const smoke=fs.readFileSync(new URL('../../audit-fixes/t16/run-deribit-alt-options-smoke.mjs',import.meta.url),'utf8');
 assert.match(workflow,/inputs\.reason != 'T16_DERIBIT_ALT_OPTIONS_SMOKE'/);
 assert.match(workflow,/inputs\.reason == 'T16_DERIBIT_ALT_OPTIONS_SMOKE'/);
 assert.match(workflow,/inputs\.reason != 'T16_CHAIN_SUPPLY_SMOKE'/);
 assert.match(workflow,/inputs\.reason == 'T16_CHAIN_SUPPLY_SMOKE'/);
 assert.match(workflow,/run-chain-supply-smoke\.mjs runtime/);
 assert.match(workflow,/inputs\.reason != 'T16_SOURCIFY_ABI_SMOKE'/);
 assert.match(workflow,/inputs\.reason == 'T16_SOURCIFY_ABI_SMOKE'/);
 assert.match(workflow,/run-sourcify-abi-smoke\.mjs runtime/);
 assert.match(workflow,/inputs\.reason != 'T16_BLUESKY_ATTENTION_SMOKE'/);
 assert.match(workflow,/inputs\.reason == 'T16_BLUESKY_ATTENTION_SMOKE'/);
 assert.match(workflow,/run-bluesky-attention-smoke\.mjs runtime/);
 assert.match(workflow,/run-deribit-alt-options-smoke\.mjs runtime/);
 assert.match(smoke,/collectDeribitAltOptionsEvidence/);assert.match(smoke,/telegram_network_calls:0/);
 assert.doesNotMatch(smoke,/TELEGRAM_RELAY|sendMessage|runTelegram/);
});

test('K21 Kraken/dYdX smoke is isolated from the report and copied into assembled runtime',()=>{
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8'),smoke=fs.readFileSync(new URL('../../audit-fixes/v13/run-shadow-market-smoke.mjs',import.meta.url),'utf8'),overlay=fs.readFileSync(new URL('../apply-runtime-overlay.mjs',import.meta.url),'utf8');
 assert.match(workflow,/inputs\.reason == 'V13_SHADOW_MARKET_SMOKE'/);assert.match(workflow,/inputs\.reason != 'V13_SHADOW_MARKET_SMOKE'/);assert.match(workflow,/run-shadow-market-smoke\.mjs runtime/);
 assert.match(smoke,/telegram_network_calls:0/);assert.match(smoke,/score_changed:false/);assert.match(smoke,/entry_authorization:false/);assert.doesNotMatch(smoke,/sendMessage|TELEGRAM_RELAY/);
 assert.match(overlay,/shadow-market-pilot\.mjs/);assert.match(overlay,/hyperliquid-market-context\.mjs/);
});
