import {observeHtxSignedTape} from './htx-signed-tape.mjs';
import {observeHtxTechnicalSnapshot} from './htx-technical-structure.mjs';
import {observeHtxVolumeSnapshot} from './htx-volume-profile.mjs';
// Preserve wire identifiers before JSON Number rounding. No market measures,
// timestamps, quantities, or non-trade responses are converted to strings.
const ID_KEYS = new Set(['id', 'trade-id', 'trade_id']);
export const HTX_TRADE_JSON_VERSION = 'htx-trade-json-v1-20260930';

export function parseHtxTradePayload(raw) {
  if (typeof raw !== 'string' || raw.length > 8 * 1024 * 1024) throw new Error('HTX_TRADE_BODY_LIMIT');
  const chunks = [];
  let cursor = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '"') continue;
    const start = i++;
    while (i < raw.length && raw[i] !== '"') {
      if (raw[i] === '\\') i++;
      i++;
    }
    if (i >= raw.length) break; // JSON.parse below rejects unterminated strings.
    let key;
    try { key = JSON.parse(raw.slice(start, i + 1)); } catch { continue; }
    if (!ID_KEYS.has(key)) continue;
    let j = i + 1;
    while (/\s/.test(raw[j] || '') && j < raw.length) j++;
    if (raw[j++] !== ':') continue;
    while (/\s/.test(raw[j] || '') && j < raw.length) j++;
    const match = /^(?:0|[1-9]\d*)(?=\s*[,}\]])/.exec(raw.slice(j));
    if (!match) continue; // Reject malformed JSON normally; never repair syntax.
    chunks.push(raw.slice(cursor, j), JSON.stringify(match[0]));
    cursor = j + match[0].length;
    i = cursor - 1;
  }
  chunks.push(raw.slice(cursor));
  return JSON.parse(chunks.join(''));
}

export function exactTradeIdentity(trade) {
  const value = trade?.['trade-id'] ?? trade?.trade_id ?? trade?.id;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= 128 ? text : null;
}

export function parseHtxMarketJson(raw, url) {
  const target = new URL(url);
  const futures = target.hostname === 'api.hbdm.com' && /^\/linear-swap-ex\/market\/(?:history\/)?trade$/.test(target.pathname);
  const spot = target.hostname === 'api.htx.com' && /^\/market\/(?:history\/)?trade$/.test(target.pathname);
  if (!futures && !spot) { const payload=JSON.parse(raw); observeHtxVolumeSnapshot(payload,url); observeHtxTechnicalSnapshot(payload,url); observeHtxSignedTape(payload,url); return payload; }
  const payload = parseHtxTradePayload(raw);
  const symbol = target.searchParams.get(futures ? 'contract_code' : 'symbol');
  if (payload?.status === 'ok' && (!symbol || payload.ch !== `market.${symbol}.trade.detail`)) {
    const error = new Error('HTX_TRADE_CHANNEL_MISMATCH');
    error.code = 'HTX_TRADE_CHANNEL_MISMATCH';
    throw error;
  }
  if(futures){observeHtxVolumeSnapshot(payload,url);observeHtxSignedTape(payload,url);}
  return payload;
}
