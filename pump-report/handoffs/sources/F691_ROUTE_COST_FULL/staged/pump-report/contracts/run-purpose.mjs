// Additive annotation of the original acceptance send. Never edit the saved
// analysis, card, origin clocks, price, hash or receipt to apply this purpose.
export const ACCEPTANCE_240=Object.freeze({
  run_id:'pump-native-relative-manual-btc-20261025-one',
  instrument_id:'BINGX:USDT_M:100:BTC-USDT',
  wave_id:'PUMP:BINGX:USDT_M:100:BTC-USDT:1792935000000',
  t0:1792937009606,
  analysis_id:'pump:analysis:083a55f40ac6ce9b7d32a56f127661587726f72b2f1ddea1e9721a1e785d4ec7',
  card_id:'PUMP:190fedda0c458e9aa3ab1b52e4e353b9630d8dcfb694619ae6be73aa7b9b7c46',
  message_id:'240',
  run_purpose:'ACCEPTANCE_TEST',
  evidence_ref:'checkpoints/pump-report-20261025/OWNER_PUBLICATION_AMENDMENTS.json'
});
export function recordPurpose(row){
  const o=row?.origin??row??{};
  if(o.instrument_id===ACCEPTANCE_240.instrument_id&&o.wave_id===ACCEPTANCE_240.wave_id&&o.t0===ACCEPTANCE_240.t0)return 'ACCEPTANCE_TEST';
  return ['PRODUCTION','ACCEPTANCE_TEST'].includes(o.run_purpose)?o.run_purpose:'UNCLASSIFIED';
}
export function productionRecord(row){return recordPurpose(row)==='PRODUCTION'&&row?.origin?.evidence_class==='OBSERVED';}
// Exact bounded acceptance IDs only. Their costs remain in the shared ledger,
// while these checks do not spend the six protected user-manual slots.
export const ACCEPTANCE_MANUAL_RUN_IDS=Object.freeze([ACCEPTANCE_240.run_id,'pump-j-integration-sol-20261025-one']);
