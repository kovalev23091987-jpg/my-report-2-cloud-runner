import assert from 'node:assert/strict';
import test from 'node:test';
import {sanitizeBindings,sanitizeSchedules,summarizeWorkerContent} from './capture-cloudflare-hub.mjs';

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

test('schedule inventory contains only public trigger metadata',()=>{
  assert.deepEqual(sanitizeSchedules([{cron:'*/10 * * * *',created_on:'2026-01-01',modified_on:'2026-02-01',secret:'never'}]),[
    {cron:'*/10 * * * *',created_on:'2026-01-01',modified_on:'2026-02-01'},
  ]);
});

test('multipart summary hashes stable module bytes, not a random boundary',()=>{
  const worker='export default {fetch(){return new Response("ok")}};';
  const make=boundary=>Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n${worker}\r\n--${boundary}--\r\n`);
  const a=summarizeWorkerContent(make('first'), 'multipart/form-data; boundary=first');
  const b=summarizeWorkerContent(make('second'), 'multipart/form-data; boundary=second');
  assert.equal(a.parts[0].sha256,b.parts[0].sha256);
  assert.equal(a.parts[0].filename,'worker.js');
  assert.equal(a.parts[0].bytes,Buffer.byteLength(worker));
});
