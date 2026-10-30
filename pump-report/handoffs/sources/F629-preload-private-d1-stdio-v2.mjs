// F629 revision-v2 PREPARED ONLY. V1 core/test/operators remain unchanged.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const allowlist = Object.freeze([
  Object.freeze({
    file:fileURLToPath(new URL('../../operator/candidate-bank-quiescence-once.mjs', import.meta.url)),
    sha256:'2873176e49919b665584882e83dfdc867b32939cbee92c1709c4c51ebf0b3a31'
  }),
  Object.freeze({
    file:fileURLToPath(new URL('../../operator/recent-completed-auto-observation-once.mjs', import.meta.url)),
    sha256:'ed6f2ec64884fc441e40e6ff471960362d64626016f774d6635a55b148477ec9'
  })
]);
if (!process.argv[1]) throw new Error('F629_V2_FROZEN_OPERATOR_REQUIRED');
const selectedPath = path.resolve(process.argv[1]);
const selected = allowlist.find(row => row.file === selectedPath);
if (!selected || sha(fs.readFileSync(selected.file)) !== selected.sha256) throw new Error('F629_V2_FROZEN_OPERATOR_REQUIRED');

const coreURL = new URL('./F629-private-d1-stdio-relay-core.mjs', import.meta.url);
if (sha(fs.readFileSync(coreURL)) !== '897e504e95035628f0f0a8a86f844ffd5972d101a8f28808051157870526dde3') throw new Error('F629_V2_FROZEN_CORE_REQUIRED');
if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function' || typeof process.stdin.unref !== 'function') throw new Error('F629_TTY_TRUE_REQUIRED');
const {createF629Relay} = await import(coreURL.href);

const wasRaw = process.stdin.isRaw === true;
let relay;
const restore = () => {
  try { process.stdin.setRawMode(wasRaw); } catch {}
  process.stdin.pause();
  process.stdin.unref();
};
process.stdin.setRawMode(true);
try {
  relay = createF629Relay({input:process.stdin, output:process.stdout, onFatal:() => { process.exitCode = 1; restore(); }});
} catch (error) { restore(); throw error; }
globalThis.fetch = relay.fetch;
process.once('exit', () => { relay.close(); restore(); });
process.once('SIGINT', () => { relay.close(); restore(); process.exitCode = 130; });
process.once('SIGTERM', () => { relay.close(); restore(); process.exitCode = 143; });
