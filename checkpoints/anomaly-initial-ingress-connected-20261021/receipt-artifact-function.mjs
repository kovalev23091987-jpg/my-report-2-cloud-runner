async function persistRunnerAnomalyReceipts(snapshot) {
  if (snapshot?.schema !== 'ANOMALY_PARENT_BOUNDED_RECEIPTS_V1') throw Error('ANOMALY_RECEIPT_SCHEMA_REQUIRED');
  const body = JSON.stringify(snapshot);
  if (Buffer.byteLength(body,'utf8') > 16384) throw Error('ANOMALY_RECEIPT_METADATA_BOUND');
  const envelope = {schema:'RUNNER_ANOMALY_RECEIPT_ARTIFACT_V1',head:process.env.GITHUB_SHA||null,cloud_run_id:process.env.GITHUB_RUN_ID||null,recorded_ts:Date.now(),scope:'BOUND_OPERATION_METADATA_NOT_NATIVE_EVENT_FIRST_KNOWLEDGE_OR_DELIVERY',receipts:snapshot,additional_SQL:0,provider_HTTP:0,native_qualification_claimed:false,filesystem_durability_qualified:false};
  const text = JSON.stringify(envelope);
  if (Buffer.byteLength(text,'utf8') > 20480) throw Error('ANOMALY_RECEIPT_ARTIFACT_BOUND');
  const file = 'report2-anomaly-domain-receipts.json';
  await fs.writeFile(file+'.tmp',text);
  await fs.rename(file+'.tmp',file);
  return {bytes:Buffer.byteLength(text,'utf8'),sha256:crypto.createHash('sha256').update(text).digest('hex'),native_qualification_claimed:false};
}

