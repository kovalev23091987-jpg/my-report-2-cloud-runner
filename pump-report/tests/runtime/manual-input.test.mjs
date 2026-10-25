import test from 'node:test';
import assert from 'node:assert/strict';
import {parseManualInput} from '../../runtime/manual-input.mjs';
test('manual selector understands the agreed Russian commands and exact native symbols',()=>{
  for(const [text,symbol] of [['Запусти памп-отчёт для ORDER','ORDER'],['Проверь JCT на памп','JCT'],['BTC-USDT','BTC'],['$BTC','BTC'],['Что сейчас по SUI для памп-отчёта?','SUI']])assert.deepEqual(parseManualInput(text),{status:'PARSED',symbol});
});
test('a contextual coin request needs an explicit context and never guesses a ticker',()=>{
  assert.equal(parseManualInput('Что сейчас по этой монете для памп-отчёта?').status,'CONTEXT_SYMBOL_REQUIRED');
  assert.deepEqual(parseManualInput('Что сейчас по этой монете для памп-отчёта?',{context_symbol:'SUI'}),{status:'PARSED',symbol:'SUI'});
  for(const text of ['BTC ETH','BTC; DROP TABLE x','https://evil.test/BTC','Проверь все монеты'])assert.equal(parseManualInput(text).status,'INVALID_MANUAL_REQUEST');
});
