import assert from "node:assert/strict";
import fs from "node:fs";

const workerPath =
  new URL(
    "../src/worker.js",
    import.meta.url
  );

const workerSource =
  fs.readFileSync(
    workerPath,
    "utf8"
  );

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(
    workerSource +
      "\nexport { htxUniverseScan };\n"
  ).toString("base64");

const {
  htxUniverseScan,
} = await import(moduleUrl);

let scan = null;
const attempts = [];

for (
  let attempt = 1;
  attempt <= 3;
  attempt += 1
) {
  scan =
    await htxUniverseScan(
      {
        freshness_sec: 300,
      },
      {},
      {
        persist: false,
      }
    );

  attempts.push({
    attempt,
    contracts:
      scan.health?.contracts ===
      true,
    market:
      scan.health?.market ===
      true,
    oi:
      scan.health?.oi === true,
    funding:
      scan.health?.funding ===
      true,
    scope:
      scan.coverage
        ?.crypto_instrument_scope ??
      null,
  });

  if (
    scan.health?.contracts ===
      true &&
    scan.coverage
      ?.crypto_instrument_scope ===
      "closed"
  ) {
    break;
  }

  if (attempt < 3) {
    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          2000
        )
    );
  }
}

assert.equal(
  scan.health.contracts,
  true,
  "HTX contract-info endpoint must be healthy"
);

assert.equal(
  scan.coverage
    .crypto_instrument_scope,
  "closed",
  "all active contracts must have factual HTX scope fields"
);

assert.equal(
  scan.counts
    .instrument_scope_unknown,
  0,
  "unknown scope must fail the pre-deploy audit"
);

assert.ok(
  scan.counts
    .crypto_scope_confirmed > 0
);

assert.ok(
  scan.counts
    .non_crypto_htx_classified > 0
);

function classification(contract) {
  return scan.contracts.find(
    (row) =>
      row.contract_code ===
      contract
  )?.instrument_scope
    ?.classification;
}

assert.equal(
  classification(
    "ETHFI-USDT"
  ),
  "CRYPTO_CONFIRMED"
);

assert.equal(
  classification(
    "BNC-USDT"
  ),
  "NON_CRYPTO_HTX_CLASSIFIED"
);

assert.equal(
  classification(
    "XAU-USDT"
  ),
  "NON_CRYPTO_HTX_CLASSIFIED"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      timestamp_utc:
        scan.timestamp_utc,
      universe_total:
        scan.counts
          .universe_total,
      crypto_scope_confirmed:
        scan.counts
          .crypto_scope_confirmed,
      non_crypto_htx_classified:
        scan.counts
          .non_crypto_htx_classified,
      instrument_scope_unknown:
        scan.counts
          .instrument_scope_unknown,
      scope_coverage:
        scan.coverage
          .crypto_instrument_scope,
      attempts,
      fixtures: {
        "ETHFI-USDT":
          classification(
            "ETHFI-USDT"
          ),
        "BNC-USDT":
          classification(
            "BNC-USDT"
          ),
        "XAU-USDT":
          classification(
            "XAU-USDT"
          ),
      },
    },
    null,
    2
  )
);
