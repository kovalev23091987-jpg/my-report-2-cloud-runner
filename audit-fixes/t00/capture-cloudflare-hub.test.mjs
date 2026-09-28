import assert from 'node:assert/strict';
import test from 'node:test';
import {sanitizeBindings} from './capture-cloudflare-hub.mjs';

test('sanitized binding inventory contains no values or identifiers',()=>{
  const actual=sanitizeBindings([
    {name:'REPORT2_KEY',type:'secret_text',text:'never-export-this'},
    {name:'DB',type:'d1',id:'private-account-resource-id'},
    {name:'PLAIN',type:'plain_text',text:'also-private'},
  ]);
  assert.deepEqual(actual,[
    {name:'DB',type:'d1'},
    {name:'PLAIN',type:'plain_text'},
    {name:'REPORT2_KEY',type:'secret_text'},
  ]);
  assert.equal(JSON.stringify(actual).includes('never-export-this'),false);
  assert.equal(JSON.stringify(actual).includes('private-account-resource-id'),false);
});
