export const GATE_PUBLIC_TAKER_REFERENCE=Object.freeze({
  "verified": true,
  "status": "GATE_REST_PUBLIC_TAKER_DIRECTION_PAIRED_PROVEN",
  "reference_id": "GATE_PAIRED_PUBLIC_TAKER_V4_38064035277",
  "qualified_run": 38064035277,
  "paired_trades": 39,
  "source_receipts": [
    {
      "file": "GATE-PUBLIC-WS-DIRECTION.json.gz",
      "body_sha256": "a03654a5c22c2ab554d8d27b7e263570b054b7e8a903384e23af596e2df749b9",
      "gzip_sha256": "72f5697d7130d3ad8a43d609f9c7138a02280e5d467496ff2bb3096368fd24e4",
      "received_ts": 1791646432554,
      "http_status": 101,
      "sourceHTTP": 1
    },
    {
      "file": "GATE-PAIRED-REST-DIRECTION.json.gz",
      "body_sha256": "6eb2bf34937dbdc438acf3c899508ac5e842f95bbe0b95dc8f41ba67046507ce",
      "gzip_sha256": "7bda4799ec4fa5d6f6fa0e40f73aa66e1e7c423584fe81a5c32a994b3b212fd3",
      "received_ts": 1791646434146,
      "http_status": 200,
      "sourceHTTP": 1
    }
  ],
  "documentation": "https://www.gate.com/docs/developers/apiv4/ws/en/#public-trades-channel",
  "scope": "GENERIC_PUBLIC_SPOT_TAKER_SIDE_CONTRACT_PAIRED_ON_BTC_USDT_NOT_ASSET_COVERAGE"
});
