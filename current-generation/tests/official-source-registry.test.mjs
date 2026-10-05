import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileOfficialSourceRegistry,mergeOfficialAndConfiguredRegistries} from '../files/src/official-source-registry.mjs';
import {parseSupplementalIdentityRegistry} from '../files/src/supplemental-candidate-context.mjs';

const source=JSON.parse(fs.readFileSync(new URL('../files/official-event-sources.json',import.meta.url),'utf8'));
const mainSources=JSON.parse(fs.readFileSync(new URL('../files/main-official-event-sources.json',import.meta.url),'utf8'));

test('main-only hosted publisher has exact project identity and issuer authorization',()=>{
 const compiled=compileOfficialSourceRegistry(mainSources,{now:Date.parse('2026-10-05T04:30:00Z')});
 const merged=mergeOfficialAndConfiguredRegistries({official:compiled,configured:compileOfficialSourceRegistry(source).registry});
 const entry=parseSupplementalIdentityRegistry(merged.registry).entries.BTW;
 assert.equal(entry.identity.chain,'bsc');assert.equal(entry.identity.contract_or_mint,'0x444045b0ee1ee319a660a5e3d604ca0ffa35acaa');
 assert.deepEqual(entry.official_domains,['bitway.com']);assert.equal(entry.official_feed_specs[0].publisher_account,'bitwayofficial');
 assert.equal(entry.official_feed_specs[0].publisher_authorization_url,'https://docs.bitway.com/resources/official-links');
 assert.equal(compileOfficialSourceRegistry(source).registry.BTW,undefined);
 for(const bad of [undefined,'https://other.example/official-links']){
  const x=structuredClone(mainSources);x.entries[0].publisher_authorization_url=bad;
  assert.throws(()=>compileOfficialSourceRegistry(x),/CANONICAL_URL/);
 }
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 assert.match(runner,/mainSourceRegistry=expectedManualMode==='LIQUIDATION_ONLY'\?supplementalIdentityRegistry/);
});

test('K16 versioned official registry exposes exact identity and the fixed Chainlink HTML feed',()=>{
 const out=compileOfficialSourceRegistry(source,{now:Date.parse('2026-09-30T12:00:00Z')});
 assert.equal(out.status,'CLOSED');assert.equal(out.records.length,5);
 assert.equal(out.registry.UMA.contract_or_mint,'0x04fa0d235c4abf4bcf4787af4cf447de572ef828');assert.deepEqual(out.registry.UMA.official_feeds,[]);assert.equal(out.registry.LINK.chain,'ethereum');assert.equal(out.registry.LINK.contract_or_mint,'0x514910771af9ca656af840dff83e8264ecf986ca');
 assert.deepEqual(out.registry.LINK.official_domains,['chain.link']);assert.deepEqual(out.registry.LINK.official_feeds,['https://chain.link/newsroom']);assert.deepEqual(out.registry.LINK.official_feed_specs,[{url:'https://chain.link/newsroom',format:'HTML',parser_id:'FIXED_HTML_CHAINLINK_NEWSROOM_V1',refresh_period:'24h',timezone:'UTC'}]);
 assert.deepEqual(out.registry.LDO.official_feeds,['https://blog.lido.fi/rss/']);
 assert.deepEqual(out.registry.LDO.official_feed_specs,[{url:'https://blog.lido.fi/rss/',format:'RSS',parser_id:'FIXED_RSS_V1',refresh_period:'1h',timezone:'UTC'}]);
 assert.equal(out.registry.LDO.snapshot_space,'lido-snapshot.eth');
 assert.equal(out.records[0].status,'ENABLED');assert.equal(out.records[0].disabled_reason,null);
});

test('K16 official registry rejects guessed, conflicting or unsupported enabled sources',()=>{
 const invalid=structuredClone(source);invalid.entries[0].asset_id='LINK';
 assert.throws(()=>compileOfficialSourceRegistry(invalid),/ASSET_ID/);
 const enabled=structuredClone(source);Object.assign(enabled.entries[0],{status:'ENABLED',parser_id:'HTML_GUESS_V1'});
 assert.throws(()=>compileOfficialSourceRegistry(enabled),/ENABLED_PARSER/);
 const compiled=compileOfficialSourceRegistry(source);
 assert.throws(()=>mergeOfficialAndConfiguredRegistries({official:compiled,configured:{LINK:{chain:'ethereum',contract_or_mint:'0x1111111111111111111111111111111111111111'}}}),/IDENTITY_REGISTRY_CONFLICT/);
});

test('K16 configured exact metadata extends versioned entries without losing verified identity',()=>{
 const out=mergeOfficialAndConfiguredRegistries({official:compileOfficialSourceRegistry(source),configured:{LINK:{chain:'ethereum',contract_or_mint:'0x514910771af9ca656af840dff83e8264ecf986ca',snapshot_space:'chainlink.eth',official_feeds:['https://chain.link/events.xml']}}});
 assert.equal(out.registry.LINK.snapshot_space,'chainlink.eth');assert.deepEqual(out.registry.LINK.official_feeds,['https://chain.link/newsroom','https://chain.link/events.xml']);assert.equal(out.registry.LINK.contract_or_mint,'0x514910771af9ca656af840dff83e8264ecf986ca');
});

test('K16 runtime loads the versioned registry and overlay carries both registry files',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8'),overlay=fs.readFileSync(new URL('../apply-runtime-overlay.mjs',import.meta.url),'utf8');
 assert.match(runner,/official-event-sources\.json/);assert.match(runner,/supplementalIdentityRegistry\.registry/);
 assert.match(overlay,/official-event-sources\.json/);assert.match(overlay,/official-source-registry\.mjs/);
});


test('an exact configured identity without category fields preserves versioned sector routes',()=>{
 const identity={chain:'ethereum',contract_or_mint:'0x'+'1'.repeat(40)};
 const official={registry:{ABC:{...identity,coingecko_id:'exact-project',coingecko_category_id:'meme-token',coingecko_category_name:'Meme',official_domains:['abc.example'],official_feeds:['https://abc.example/feed.xml']}}};
 const out=mergeOfficialAndConfiguredRegistries({official,configured:{ABC:identity}});
 assert.equal(out.registry.ABC.coingecko_id,'exact-project');
 assert.equal(out.registry.ABC.coingecko_category_id,'meme-token');
 assert.equal(out.registry.ABC.coingecko_category_name,'Meme');
 assert.deepEqual(out.registry.ABC.official_feeds,['https://abc.example/feed.xml']);
 assert.throws(()=>mergeOfficialAndConfiguredRegistries({official,configured:{ABC:{...identity,contract_or_mint:'0x'+'2'.repeat(40)}}}),/IDENTITY_REGISTRY_CONFLICT/);
});
