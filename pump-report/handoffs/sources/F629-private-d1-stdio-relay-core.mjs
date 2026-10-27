// PREPARED ONLY. No network implementation, credential access or SQL execution.
import {randomUUID, createHash} from 'node:crypto';

export const F629_URL = 'https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/d1/database/057a2847-2cc4-4e52-8534-1be1596d21d5/query';
export const F629_PATH = '/accounts/70ee0af85191ea470e74c7383fdec772/d1/database/057a2847-2cc4-4e52-8534-1be1596d21d5/query';
export const F629_LIMITS = Object.freeze({requests:16, body_bytes:8388608, total_payload_bytes:12582912, timeout_ms:30000});
const REQUEST_TAG = 'F629_PRIVATE_D1_REQUEST_V1';
const REPLY_TAG = 'F629_PRIVATE_D1_REPLY_V1';
const MAX_LINE_BYTES = 4 * Math.ceil(F629_LIMITS.body_bytes / 3) + 4096;
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => Object.assign(new Error(code), {code});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => Object.keys(value).sort().join('|') === [...keys].sort().join('|');

// Streams are injected for the single artificial transport case. Importing this
// module never installs fetch, reads credentials, starts a server, or calls IO.
export function createF629Relay({input, output, onFatal = () => {}}) {
  if (!input?.on || !input?.removeListener || !output?.write || !output?.on) throw fail('F629_STREAMS_REQUIRED');
  let pending = null, closed = false, calls = 0, totalBytes = 0;
  let buffered = Buffer.alloc(0);
  const session = randomUUID();

  function clearPending() {
    const item = pending;
    if (!item) return null;
    pending = null;
    clearTimeout(item.timer);
    item.signal?.removeEventListener('abort', item.onAbort);
    input.unref?.();
    return item;
  }
  function detach() {
    input.removeListener('data', onData);
    input.removeListener('end', onEnd);
    // Retain our static error listeners until the streams die: an EPIPE may
    // arrive after a failed write callback closed this relay. Never let that
    // late event produce an unhandled error or print a sensitive IO object.
    buffered = Buffer.alloc(0);
    input.pause?.();
    input.unref?.();
  }
  function poison(code) {
    if (closed) return;
    closed = true;
    const item = clearPending();
    detach();
    item?.reject(fail(code));
    onFatal(code); // Static code only: never an error body, SQL, headers or URL.
  }
  function onEnd() { poison('F629_STDIN_CLOSED'); }
  function onInputError() { poison('F629_STDIN_ERROR'); }
  function onOutputError() { poison('F629_STDOUT_ERROR'); }

  function receive(line) {
    if (!pending) return poison('F629_UNSOLICITED_REPLY');
    if (pending.signal?.aborted) return poison('F629_ORIGINAL_ABORTED_UNKNOWN_NO_RETRY');
    let reply;
    try { reply = JSON.parse(line.toString('utf8')); }
    catch { return poison('F629_INVALID_REPLY_JSON'); }
    if (!object(reply) || reply.tag !== REPLY_TAG || reply.id !== pending.id || reply.request_body_sha256 !== pending.hash) return poison('F629_REPLY_BINDING_MISMATCH');
    if (Object.hasOwn(reply, 'error')) {
      if (!exactKeys(reply, ['tag','id','request_body_sha256','error']) || reply.error !== 'CONNECTOR_CALL_FAILED') return poison('F629_INVALID_ERROR_REPLY');
      return poison('F629_CONNECTOR_CALL_FAILED_UNKNOWN_NO_RETRY');
    }
    if (!exactKeys(reply, ['tag','id','request_body_sha256','status','body_b64','body_basis']) ||
        !Number.isInteger(reply.status) || reply.status < 200 || reply.status > 599 ||
        !['RAW_CONNECTOR_BODY_UTF8','COMPLETE_ACTUAL_CONNECTOR_RESPONSE_JSON'].includes(reply.body_basis) ||
        typeof reply.body_b64 !== 'string' || reply.body_b64.length > 4 * Math.ceil(F629_LIMITS.body_bytes / 3) ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(reply.body_b64)) return poison('F629_INVALID_STATUS_OR_BODY');
    const bytes = Buffer.from(reply.body_b64, 'base64');
    if (bytes.toString('base64') !== reply.body_b64 || bytes.length > F629_LIMITS.body_bytes || totalBytes + bytes.length > F629_LIMITS.total_payload_bytes) return poison('F629_BODY_BOUND');
    if ([204,205,304].includes(reply.status) && bytes.length !== 0) return poison('F629_BODY_FORBIDDEN_FOR_STATUS');
    if (reply.body_basis === 'COMPLETE_ACTUAL_CONNECTOR_RESPONSE_JSON') {
      let complete;
      try { complete = JSON.parse(bytes.toString('utf8')); }
      catch { return poison('F629_CONNECTOR_SERIALIZATION_INVALID'); }
      // Preserve the COMPLETE actual connector response, including its actual
      // success/result/errors/meta. Never synthesize an API envelope from result.
      if (!object(complete) || complete.status !== reply.status) return poison('F629_CONNECTOR_STATUS_MISMATCH');
    }
    let response;
    try { response = new Response(bytes.length ? bytes : null, {status:reply.status}); }
    catch { return poison('F629_RESPONSE_CONSTRUCTION_FAILED'); }
    totalBytes += bytes.length;
    const item = clearPending();
    item.resolve(response);
  }
  function onData(chunk) {
    if (closed) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    // TTY is raw/noecho. Ctrl-C/Ctrl-D means abort, never a new RPC command.
    if (bytes.includes(3) || bytes.includes(4)) return poison('F629_OPERATOR_ABORT');
    if (buffered.length + bytes.length > MAX_LINE_BYTES) return poison('F629_REPLY_LINE_BOUND');
    buffered = Buffer.concat([buffered, bytes]);
    for (;;) {
      const end = buffered.indexOf(10);
      if (end < 0) break;
      let line = buffered.subarray(0, end);
      buffered = buffered.subarray(end + 1);
      if (line.at(-1) === 13) line = line.subarray(0, line.length - 1);
      if (!line.length) return poison('F629_EMPTY_REPLY');
      receive(line);
      if (closed) return;
    }
  }
  input.on('data', onData);
  input.on('end', onEnd);
  input.on('error', onInputError);
  output.on('error', onOutputError);
  input.resume?.();
  input.unref?.();

  async function relayFetch(url, init) {
    if (closed) throw fail('F629_RELAY_CLOSED_NO_RETRY');
    if (typeof url !== 'string' || url !== F629_URL || !object(init) || init.method !== 'POST' || init.redirect !== 'manual') {
      poison('F629_FETCH_SCOPE_REFUSED');
      throw fail('F629_FETCH_SCOPE_REFUSED');
    }
    if (pending) throw fail('F629_ONLY_ONE_PENDING');
    if (calls >= F629_LIMITS.requests) { poison('F629_REQUEST_BOUND'); throw fail('F629_REQUEST_BOUND'); }
    if (typeof init.body !== 'string') { poison('F629_STRING_BODY_REQUIRED'); throw fail('F629_STRING_BODY_REQUIRED'); }
    const bytes = Buffer.from(init.body, 'utf8');
    if (bytes.length > F629_LIMITS.body_bytes || totalBytes + bytes.length > F629_LIMITS.total_payload_bytes) { poison('F629_REQUEST_BODY_BOUND'); throw fail('F629_REQUEST_BODY_BOUND'); }
    let body;
    try { body = JSON.parse(init.body); }
    catch { poison('F629_REQUEST_JSON_INVALID'); throw fail('F629_REQUEST_JSON_INVALID'); }
    if (!object(body) || !exactKeys(body, ['sql','params']) || typeof body.sql !== 'string' || !body.sql.length || !Array.isArray(body.params)) {
      poison('F629_SQL_PARAMS_REQUIRED'); throw fail('F629_SQL_PARAMS_REQUIRED');
    }
    const signal = init.signal;
    if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
      poison('F629_ABORT_SIGNAL_INVALID'); throw fail('F629_ABORT_SIGNAL_INVALID');
    }
    if (signal?.aborted) { poison('F629_ORIGINAL_ABORTED'); throw fail('F629_ORIGINAL_ABORTED'); }
    calls++;
    totalBytes += bytes.length;
    const id = `F629:${session}:${calls}`, hash = sha(bytes);
    return new Promise((resolve, reject) => {
      const onAbort = () => poison('F629_ORIGINAL_ABORTED_UNKNOWN_NO_RETRY');
      const timer = setTimeout(() => poison('F629_TIMEOUT_UNKNOWN_NO_RETRY'), F629_LIMITS.timeout_ms);
      pending = {id, hash, resolve, reject, signal, onAbort, timer};
      signal?.addEventListener('abort', onAbort, {once:true});
      input.ref?.();
      if (signal?.aborted) return onAbort();
      // Deliberately never inspect or serialize init.headers/Authorization.
      const frame = {tag:REQUEST_TAG, id, method:'POST', path:F629_PATH, body, request_body_sha256:hash, request_body_bytes:bytes.length};
      try { output.write(JSON.stringify(frame) + '\n', error => { if (error) poison('F629_STDOUT_ERROR'); }); }
      catch { poison('F629_STDOUT_ERROR'); }
    });
  }
  return Object.freeze({
    fetch:relayFetch,
    close() { if (!closed) { closed = true; const item = clearPending(); detach(); item?.reject(fail('F629_RELAY_CLOSED')); } },
    state:() => ({calls, pending:pending !== null, total_payload_bytes:totalBytes, closed})
  });
}
