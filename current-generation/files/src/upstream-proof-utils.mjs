export function stableProjection(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableProjection);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableProjection(value[key])]));
}

export function stableJson(value) {
  return JSON.stringify(stableProjection(value));
}

export function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function digest(value) {
  return fnv1a64(stableJson(value));
}

export function immutableReceipt(value, receiptId, committedTs) {
  const material = structuredClone(value);
  delete material.persistence;
  const contentDigest = digest(material);
  return {
    ...material,
    persistence: {
      status: 'CLOSED',
      receipt_id: receiptId,
      content_digest: contentDigest,
      committed_ts: committedTs,
      immutable: true,
      verification_method: 'D1_IMMUTABLE_RECEIPT',
    },
  };
}

export function safeText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function safeInt(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

export function safeFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
