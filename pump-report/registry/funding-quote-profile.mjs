import {ownerInstrumentExcluded} from '../contracts/index.mjs';
import {qualifyBingxFundingQuote} from '../sources/funding-qualification.mjs';

// Official CCXT consumer convention plus pinned BingX raw-to-unified mapping.
// This is adapter-based evidence; fresh source clock and row period remain required.
export const REVIEWED_FUNDING_QUOTE_PROFILE = Object.freeze({
  "mode": "FUNDING_RATE_QUOTE_SNAPSHOT_V1",
  "evidence_ref": "F593_BINGX_USDT_M_FUNDING_QUOTE_CONSUMER_FRACTION_V1",
  "provider": "BINGX",
  "family": "USDT_M",
  "route": "/openApi/swap/v2/quote/premiumIndex",
  "rate_field": "lastFundingRate",
  "rate_unit": "RATE_FRACTION",
  "qualification_basis": "ADAPTER_BASED_INFERENCE",
  "unit_proof_parts": {
    "native_to_unified": {
      "status": "SUPPORTED_CONSUMER",
      "evidence_ref": "CCXT:d3159f7036f93db086cd0414642132fba5401710:bingx.ts:1827-1867:sha256:94bcede8e332f7c877fa6099708d3ce9e0642463366e13e09a068f116ffc98b0"
    },
    "unified_fraction": {
      "status": "VERIFIED",
      "unit": "RATE_FRACTION",
      "evidence_ref": "CCXT:373c05278144578818098d9aac82204de934b803:crypto-arbitrage-strategies.mdx:86-90:sha256:4516fca6b9b6ea730c3b90c5091ee4642475891c0b6e3489b93302acea873858"
    }
  },
  "clock_proof": {
    "status": "SUPPORTED_CONSUMER",
    "evidence_ref": "CCXT:d3159f7036f93db086cd0414642132fba5401710:bingx.ts:1827-1867:sha256:94bcede8e332f7c877fa6099708d3ce9e0642463366e13e09a068f116ffc98b0",
    "field": "updateTime",
    "role": "RATE_QUOTE_SNAPSHOT",
    "basis": "CCXT_SUPPORTED_CONSUMER"
  },
  "period_proof": {
    "status": "SUPPORTED_CONSUMER",
    "evidence_ref": "CCXT:d3159f7036f93db086cd0414642132fba5401710:bingx.ts:1827-1867:sha256:94bcede8e332f7c877fa6099708d3ce9e0642463366e13e09a068f116ffc98b0",
    "field": "fundingIntervalHours",
    "unit": "HOURS",
    "basis": "SAME_RESPONSE_ROW"
  }
});

export function withReviewedFundingQuoteRegistry(baseRegistry) {
  if (!Array.isArray(baseRegistry?.instruments) || typeof baseRegistry.resolve !== 'function')
    throw Error('REVIEWED_IDENTITY_REGISTRY_REQUIRED');
  const attach = raw => {
    if (!raw) return raw;
    const entry = structuredClone(raw), instrument = entry.instrument;
    if (!ownerInstrumentExcluded(instrument) && entry.family === 'USDT_M'
      && qualifyBingxFundingQuote(REVIEWED_FUNDING_QUOTE_PROFILE, instrument).qualified)
      entry.qualifications = {...entry.qualifications, funding: structuredClone(REVIEWED_FUNDING_QUOTE_PROFILE)};
    return entry;
  };
  return {...baseRegistry, instruments: baseRegistry.instruments.map(attach),
    resolve: query => attach(baseRegistry.resolve(query))};
}

