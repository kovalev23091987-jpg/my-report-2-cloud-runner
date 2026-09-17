import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyZeroTelegram } from '../candidate/telegram-zero-reason.mjs';
const out=(status,skipped=[])=>({shadow_decision:{status,sent:false,count:0,skipped}});
test('budget is distinct reason',()=>assert.equal(classifyZeroTelegram({preBudget:{allowed:false,status:'BLOCKED'}}).status,'BUDGET_BLOCKED'));
test('no final decision is distinct from no qualified candidate',()=>{
 assert.equal(classifyZeroTelegram({preBudget:{allowed:true},telegramObserver:{status:'NO_FINAL_DECISION_ROW'},telegramOutput:out('NO_EVENT')}).status,'FINAL_DECISION_NOT_FORMED');
 assert.equal(classifyZeroTelegram({preBudget:{allowed:true},telegramObserver:{row_present:false},telegramOutput:out('NO_FINAL_ENTRY_ELIGIBLE')}).status,'NO_QUALIFIED_FINAL_CANDIDATE');
});
test('data/publication gap is distinct',()=>assert.equal(classifyZeroTelegram({preBudget:{allowed:true},telegramObserver:{row_present:true},telegramOutput:out('NO_NEW_FINAL_AFTER_GATES',[{reason:'CONTEXT_NOT_AVAILABLE'}])}).status,'DATA_OR_PUBLICATION_NOT_CLOSED'));
test('delivery unknown is not no-candidate',()=>assert.equal(classifyZeroTelegram({preBudget:{allowed:true},telegramObserver:{row_present:true},telegramOutput:out('NO_NEW_FINAL_AFTER_GATES',[{reason:'DELIVERY_UNKNOWN'}])}).status,'DELIVERY_UNHEALTHY_OR_UNKNOWN'));
test('sent is explicit',()=>assert.equal(classifyZeroTelegram({preBudget:{allowed:true},telegramOutput:{shadow_decision:{status:'SENT',sent:true,count:1}}}).status,'SENT'));
