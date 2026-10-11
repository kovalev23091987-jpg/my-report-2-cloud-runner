import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {normalizeHtxAssetReferences} from '../files/src/htx-asset-identity.mjs';
import {exactKrakenNativeBinding,krakenNativeMarketCode} from '../files/src/kraken-four-hour-flow.mjs';

function original(path, expectedHash) {
 const bytes=readFileSync(new URL('../../checkpoints/'+path,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),expectedHash);
 return JSON.parse(gunzipSync(bytes));
}

test('ALGO and XMR bind exact HTX native chains to original Kraken USDT instruments',()=>{
 const htx=normalizeHtxAssetReferences(original(
  'n05-actual-qualification-38049404414/identity-HTX.json.gz',
  'f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c'));
 const pairs=original(
  'n05-window-qualification-38050596507/catalog-KRAKEN-SPOT.json.gz',
  '7d7414eae74dc3d55fd203d077a093c8d124601d8013344cff421d16bba7fa08').result;
 for(const [symbol,chain,base] of [['ALGO','algorand','ALGO'],['XMR','monero','XXMR']]){
  const entry=htx.entries[symbol];
  assert.equal(entry.status,'CLOSED');
  assert.deepEqual(entry.identities,[{chain,asset_kind:'NATIVE',native_asset_id:chain+':mainnet',contract_or_mint:null}]);
  const market=krakenNativeMarketCode(symbol+'-USDT'),instrument=pairs[market];
  assert.equal(instrument.base,base);
  assert.equal(instrument.status,'online');
  assert.equal(exactKrakenNativeBinding({contract:symbol+'-USDT',identity:entry.identities[0],instrument}),true);
  assert.equal(exactKrakenNativeBinding({contract:symbol+'-USDT',identity:{...entry.identities[0],chain:'wrong'},instrument}),false);
  assert.equal(exactKrakenNativeBinding({contract:symbol+'-USDT',identity:entry.identities[0],instrument:{...instrument,quote:'USD'}}),false);
 }
});
