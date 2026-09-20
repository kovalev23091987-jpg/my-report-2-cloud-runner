export function classifyZeroTelegram({ preBudget, telegramObserver, telegramOutput } = {}) {
  if (preBudget && preBudget.allowed === false) {
    return { status:'BUDGET_BLOCKED', reason:preBudget.status || 'D1_PREACTION_BUDGET_NOT_CLOSED' };
  }
  if(telegramOutput?.info_enabled===true) {
    const m=telegramOutput.morning||{},e=telegramOutput.early_info||{};
    if(m.sent===true||e.sent===true)return {status:'SENT',reason:e.sent===true?'EARLY_INFORMATION_SENT':'MORNING_INFORMATION_SENT'};
    const statuses=[m.status,e.status].filter(Boolean);
    if(statuses.some(s=>/ERROR|ACK_UNKNOWN|READBACK|DELIVERY_UNKNOWN|SEND_FAILED/.test(s)))return {status:'DELIVERY_UNHEALTHY_OR_UNKNOWN',reason:statuses.find(s=>/ERROR|ACK_UNKNOWN|READBACK|DELIVERY_UNKNOWN|SEND_FAILED/.test(s))};
    if(e.status==='UPSTREAM_LIFECYCLE_NOT_CLOSED')return {status:'UPSTREAM_PIPELINE_NOT_CLOSED',reason:e.source_status||e.status};
    return {status:'INFORMATION_NOT_SENT',reason:e.status||m.status||'UNKNOWN',upstream_reasons:e.upstream_reasons||[]};
  }
  const shadow = telegramOutput?.shadow_decision || {};
  if (shadow.sent === true || Number(shadow.count || 0) > 0 || shadow.status === 'SENT') {
    return { status:'SENT', reason:'FINAL_MESSAGE_SENT' };
  }
  const skipped = Array.isArray(shadow.skipped) ? shadow.skipped : [];
  if (skipped.some(x => /DELIVERY_UNKNOWN|RELAY|NETWORK|TIMEOUT|SEND_FAILED/i.test(String(x?.reason || '')))) {
    return { status:'DELIVERY_UNHEALTHY_OR_UNKNOWN', reason:'DISPATCH_OR_RELAY_NOT_CLOSED' };
  }
  if (shadow.status === 'ERROR_FAIL_CLOSED') {
    return { status:'DELIVERY_OR_OUTPUT_ERROR', reason:String(shadow.error || shadow.status) };
  }
  if (telegramObserver?.status === 'NO_FINAL_DECISION_ROW') {
    return { status:'FINAL_DECISION_NOT_FORMED', reason:'NO_FINAL_DECISION_ROW' };
  }
  if (shadow.status === 'NO_FINAL_ENTRY_ELIGIBLE') {
    return { status:'NO_QUALIFIED_FINAL_CANDIDATE', reason:'NO_FINAL_ENTRY_ELIGIBLE' };
  }
  if (skipped.some(x => /CONTEXT_NOT_AVAILABLE|NOT_CLOSED|STALE|FUTURE|DATA|COVERAGE|SCORE|ENTRY|FUNDING/i.test(String(x?.reason || '')))) {
    return { status:'DATA_OR_PUBLICATION_NOT_CLOSED', reason:'FINAL_ROW_PRESENT_BUT_REQUIRED_CONTEXT_NOT_CLOSED' };
  }
  if (telegramObserver?.row_present === true) {
    return { status:'FINAL_DECISION_PRESENT_NO_SEND', reason:shadow.status || 'GATES_NOT_CLOSED' };
  }
  return { status:'NO_OUTPUT_UNCLASSIFIED_FAIL_CLOSED', reason:shadow.status || telegramObserver?.status || 'UNKNOWN' };
}
export default classifyZeroTelegram;
