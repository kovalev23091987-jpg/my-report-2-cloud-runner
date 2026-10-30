import test from 'node:test';
import assert from 'node:assert/strict';
import {parseManualInput} from '../../runtime/manual-input.mjs';
import {isBingxNativeSymbol} from '../../contracts/index.mjs';
test('manual selector understands the agreed Russian commands and exact native symbols',()=>{
  for(const [text,symbol] of [['Запусти памп-отчёт для ORDER','ORDER'],['Проверь JCT на памп','JCT'],['BTC-USDT','BTC'],['$BTC','BTC'],['Что сейчас по SUI для памп-отчёта?','SUI']])assert.deepEqual(parseManualInput(text),{status:'PARSED',symbol});
});
test('a contextual coin request needs an explicit context and never guesses a ticker',()=>{
  assert.equal(parseManualInput('Что сейчас по этой монете для памп-отчёта?').status,'CONTEXT_SYMBOL_REQUIRED');
  assert.deepEqual(parseManualInput('Что сейчас по этой монете для памп-отчёта?',{context_symbol:'SUI'}),{status:'PARSED',symbol:'SUI'});
  for(const text of ['BTC ETH','BTC; DROP TABLE x','https://evil.test/BTC','Проверь все монеты'])assert.equal(parseManualInput(text).status,'INVALID_MANUAL_REQUEST');
});

test('the documented request Сделай памп по BTC resolves to the same instrument selector',()=>{assert.deepEqual(parseManualInput('Сделай памп по BTC'),{status:'PARSED',symbol:'BTC'});});
test('Unicode crypto names survive manual selection and native validation without Latin transliteration',()=>{
  for(const [text,symbol]of [['币安人生-USDT','币安人生'],['Проверь 币安人生 на памп','币安人生'],['Запусти памп-отчёт для 1000币','1000币'],['Проверь КРИПТО на памп','КРИПТО'],['عملة-USDT','عملة'],['$🐸','🐸'],['e\u0301-USDT','E\u0301']]){assert.deepEqual(parseManualInput(text),{status:'PARSED',symbol});assert.equal(isBingxNativeSymbol(symbol+'-USDT'),true);}
  assert.deepEqual(parseManualInput('Что сейчас по этой монете для памп-отчёта?',{context_symbol:'币安人生'}),{status:'PARSED',symbol:'币安人生'});
  for(const bad of ['币/USDT','币-USDT?redirect=x','币-USDT\n','币-USDC'])assert.equal(isBingxNativeSymbol(bad),false);
});
