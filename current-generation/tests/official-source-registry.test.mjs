import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileOfficialSourceRegistry,mergeOfficialAndConfiguredRegistries} from '../files/src/official-source-registry.mjs';

const source=JSON.parse(fs.readFileSync(new URL('../files/official-event-sources.json',import.meta.url),'utf8'));

test('K16 versioned official registry exposes exact identity and domain but never unsupported HTML as a feed',()=>{
 const out=compileOfficialSourceRegistry(source,{now:Date.parse('2026-09-30T04:20:00Z')});
 assert.equal(out.status,'CLOSED');assert.equal(out.records.length,4);
 assert.equal(out.registry.LINK.chain,'ethereum');assert.equal(out.registry.LINK.contract_or_mint,'0x514910771af9ca656af840dff83e8264ecf986ca');
 assert.deepEqual(out.registry.LINK.official_domains,['chain.link']);assert.deepEqual(out.registry.LINK.official_feeds,[]);
 assert.deepEqual(out.registry.LDO.official_feeds,['https://blog.lido.fi/rss/']);
 assert.deepEqual(out.registry.LDO.official_feed_specs,[{url:'https://blog.lido.fi/rss/',format:'RSS',parser_id:'FIXED_RSS_V1',refresh_period:'1h',timezone:'UTC'}]);
 assert.equal(out.registry.LDO.snapshot_space,'lido-snapshot.eth');
 assert.equal(out.records[0].status,'DISABLED');assert.equal(out.records[0].disabled_reason,'FIXED_HTML_PARSER_NOT_IMPLEMENTED');
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
 assert.equal(out.registry.LINK.snapshot_space,'chainlink.eth');assert.deepEqual(out.registry.LINK.official_feeds,['https://chain.link/events.xml']);assert.equal(out.registry.LINK.contract_or_mint,'0x514910771af9ca656af840dff83e8264ecf986ca');
});

test('K16 runtime loads the versioned registry and overlay carries both registry files',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8'),overlay=fs.readFileSync(new URL('../apply-runtime-overlay.mjs',import.meta.url),'utf8');
 assert.match(runner,/official-event-sources\.json/);assert.match(runner,/supplementalIdentityRegistry\.registry/);
 assert.match(overlay,/official-event-sources\.json/);assert.match(overlay,/official-source-registry\.mjs/);
});
