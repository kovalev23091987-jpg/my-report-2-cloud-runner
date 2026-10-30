// Pinned public BingX web-client contract, reconstructed from retained static
// bytes in CLOCK_CONTRACT_STATIC_SPANS_V1.json. This module performs no IO.
export const DISPLAY_INFO_REQUEST_CONTRACT = Object.freeze({
  method: 'GET',
  url: 'https://api-app.acc-de.com/api/coin/v1/display-info/list',
  app_version: '5.3.37',
  platform_id: '30',
  app_site_id: '0',
  // Public frontend build constant, not an account, API or session credential.
  sign_prefix: '95d65c73dc5c4370ae9018fb7f2eab69',
  evidence_ref: 'pump-report/handoffs/sources/CLOCK_CONTRACT_STATIC_SPANS_V1.json'
});

const compactV4 = /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/i;
const canonicalV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reject = code => { throw Object.assign(new Error(code), {code}); };
const normalizeUUID = value => {
  if (typeof value !== 'string' || !compactV4.test(value) && !canonicalV4.test(value)) {
    reject('METADATA_UUID_V4_REQUIRED');
  }
  return value.replace(/-/g, '').toLowerCase();
};
const timestamp = value => {
  // This finite client contract requires contemporary 13-digit Unix ms.
  // It rejects accidental seconds/microseconds and never changes OS clocks.
  if (!Number.isSafeInteger(value) || value < 1000000000000 || value > 9999999999999) {
    reject('METADATA_UNIX_MILLISECONDS_REQUIRED');
  }
  return value;
};

// Inject the platform's crypto.subtle. No Node imports or implicit global
// crypto lookup; the caller supplies the actual Worker-compatible capability.
export function createSubtleSha256(subtle) {
  if (!subtle || typeof subtle.digest !== 'function') reject('METADATA_SUBTLE_DIGEST_REQUIRED');
  return async text => {
    if (typeof text !== 'string') reject('METADATA_HASH_TEXT_REQUIRED');
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32) {
      reject('METADATA_SHA256_BYTES_REQUIRED');
    }
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  };
}

// clock -> number Unix ms; uuid -> canonical/compact UUIDv4;
// sha256 -> Promise<string> or string, exactly 64 hexadecimal characters.
// time_zone_hours must describe the actual requesting client. The factory
// reads no cookies, token, fingerprint, process/env or browser state.
// It retains only one freshly generated anonymous device ID per factory.
export function createAnonymousDisplayInfoRequestFactory({clock, uuid, sha256, time_zone_hours} = {}) {
  if (typeof clock !== 'function' || typeof uuid !== 'function' || typeof sha256 !== 'function') {
    reject('METADATA_CLOCK_UUID_HASH_REQUIRED');
  }
  if (typeof time_zone_hours !== 'number' || !Number.isFinite(time_zone_hours)
    || Math.abs(time_zone_hours) > 14 || !Number.isInteger(time_zone_hours * 60)) {
    reject('METADATA_TIMEZONE_HOURS_REQUIRED');
  }
  let anonymousDeviceId = null;
  async function build() {
    const at = timestamp(clock());
    anonymousDeviceId ??= normalizeUUID(uuid());
    const traceId = normalizeUUID(uuid());
    if (traceId === anonymousDeviceId) reject('METADATA_DISTINCT_DEVICE_AND_TRACE_REQUIRED');
    const contract = DISPLAY_INFO_REQUEST_CONTRACT;
    // Empty GET params are the literal "{}"; URL/method/timeZone are not
    // included in this pinned public preimage. No optional auth branch.
    const preimage = [contract.sign_prefix, String(at), traceId, anonymousDeviceId,
      contract.platform_id, contract.app_version, '', '{}'].join('');
    const digest = await sha256(preimage);
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/i.test(digest)) {
      reject('METADATA_SHA256_HEX_REQUIRED');
    }
    const headers = Object.freeze({
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      platformId: contract.platform_id,
      appSiteId: contract.app_site_id,
      channel: 'official',
      reg_channel: 'official',
      app_version: contract.app_version,
      device_id: anonymousDeviceId,
      lang: 'en',
      appId: '30004',
      mainAppId: '10009',
      timeZone: String(time_zone_hours),
      device_brand: '',
      antiDeviceId: '',
      timestamp: String(at),
      traceId,
      sign: digest.toUpperCase()
    });
    // Build immediately before the independently admitted send. This is a
    // request description, never a fetch, admission, retry or budget reset.
    return Object.freeze({url: contract.url, method: contract.method, headers});
  }
  return Object.freeze({build});
}

