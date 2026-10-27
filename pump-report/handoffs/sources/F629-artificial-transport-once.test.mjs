// One artificial transport case PREPARED FOR ROOT; SOURCE has not run Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createF629Relay, F629_URL} from './F629-private-d1-stdio-relay-core.mjs';

test('F629 artificial status/body roundtrip, private framing and exact-route refusal', async () => {
  const input = new PassThrough(), output = new PassThrough();
  let captured = '';
  output.on('data', chunk => { captured += chunk.toString('utf8'); });
  const relay = createF629Relay({input, output});
  try {
    const requestBody = {sql:'SELECT ?1 AS artificial_transport_only', params:['ARTIFICIAL_NOT_NATIVE']};
    const responsePromise = relay.fetch(F629_URL, {method:'POST', redirect:'manual',
      headers:{Authorization:'Bearer ARTIFICIAL_SECRET_MUST_NEVER_APPEAR'}, body:JSON.stringify(requestBody)});
    const frame = JSON.parse(captured.trim());
    assert.equal(frame.tag, 'F629_PRIVATE_D1_REQUEST_V1');
    assert.deepEqual(frame.body, requestBody);
    assert.equal(captured.includes('Authorization'), false);
    assert.equal(captured.includes('ARTIFICIAL_SECRET_MUST_NEVER_APPEAR'), false);
    assert.equal(relay.state().pending, true);
    // Artificial bytes have NO success/meta. The relay must not fabricate them.
    const artificial = Buffer.from('{"fixture":"ARTIFICIAL_TRANSPORT_ONLY","errors":[{"code":999,"message":"fixture"}]}');
    const reply = {tag:'F629_PRIVATE_D1_REPLY_V1', id:frame.id, request_body_sha256:frame.request_body_sha256,
      status:503, body_b64:artificial.toString('base64'), body_basis:'RAW_CONNECTOR_BODY_UTF8'};
    const line = JSON.stringify(reply) + '\n', cut = Math.floor(line.length / 2);
    input.write(line.slice(0, cut));
    input.write(line.slice(cut));
    const response = await responsePromise;
    assert.equal(response.status, 503);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), artificial);
    assert.equal(relay.state().calls, 1);
    assert.equal(relay.state().pending, false);
    assert.equal(captured.trim().split('\n').length, 1); // No retry/extra frame.
    await assert.rejects(relay.fetch(F629_URL + '?forbidden=1', {method:'POST', redirect:'manual', body:JSON.stringify(requestBody)}), /F629_FETCH_SCOPE_REFUSED/);
    assert.equal(captured.trim().split('\n').length, 1);
    assert.equal(relay.state().closed, true);
  } finally { relay.close(); input.destroy(); output.destroy(); }
});
