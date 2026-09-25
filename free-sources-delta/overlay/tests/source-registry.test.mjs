import test from 'node:test';import assert from 'node:assert/strict';
import {buildSourceRegistry,SOURCE_STATUSES} from '../src/source-registry.mjs';
test('registry uses only required explicit statuses',()=>{const r=buildSourceRegistry({});for(const x of r.entries)assert.ok(SOURCE_STATUSES.includes(x.status),`${x.id}:${x.status}`);});
test('verified Binance runtime receipt is factual current evidence',()=>{const r=buildSourceRegistry({public_evidence:{evidence:[{venue:'BINANCE',status:'CLOSED'}]}});const b=r.entries.find(x=>x.id==='Binance Live Public');assert.equal(b.status,'PRODUCTION');assert.equal(b.runtime_current,true);});
test('unverified DEX/DefiLlama paths are not falsely claimed production',()=>{const r=buildSourceRegistry({});for(const id of ['DEX Screener','GeckoTerminal','DefiLlama','CoinGecko','Coinalyze','Etherscan'])assert.notEqual(r.entries.find(x=>x.id===id).status,'PRODUCTION');});
test('Alchemy remains BLOCKED until owner authorizes account/secret',()=>{const r=buildSourceRegistry({});assert.equal(r.entries.find(x=>x.id==='Alchemy').status,'BLOCKED');});
