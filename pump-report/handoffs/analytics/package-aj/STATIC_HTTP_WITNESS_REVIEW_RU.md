# AJ — targeted static HTTP-witness review

**STATIC ONLY; actual SENT не проверен.** Прочитаны только новые связи в3 local ROOT файлах ниже; это pending65 code, не доказательство развёртывания/отправки. Tests/imports/fixtures/AG replay/provider/docs/SQL/TG/deploy=0; ROOT bytes не менялись, копий исходников/framework нет. Исходный AJ checklist SHA f174866d… сохранён.

Подтверждено чтением кода:

- `telegram-send.mjs:7–21`: после awaited TG budget CAS фиксируется http_started_ts и повторно проверяются expiry/AUTO window. На ветке, достигающей fetch: **между финальным timing-check и вызовом fetch нет await**. В отказной ветке charge сохраняется, network_attempted=false, затем throw send_attempted=false; fetch не вызывается.
- ACK clock берётся после response.json, до finalize; basis явно CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP. Это call/parsed-ACK witness, не wire timestamp. После успешного ACK нет требования ACK<card expiry и нет продления TTL — поздний ACK допустим.
- `delivery.mjs:65–80`: durable send_started_ts отдельно от HTTP witness. Reply timestamps/basis сохраняются в receipt, затем exact saved-card/receipt readback. Строковый echo mismatch идёт в UNKNOWN; UNKNOWN не входит в допустимые READY/RETRYABLE dispatch states, автоматического resend нет.
- `worker.mjs:67–99,125–134`: sender получает сохранённую card; owner/flags прежние. Capture сверяет original/run/purpose/pin/text и checked receipt chain marker≤HTTP-start<card-expiry, HTTP-start≤parsedACK≤confirmed≤now. Прежняя карточка другой analysis остаётся явно DIFFERENT…NOT_CURRENT_SENT_PROOF.

Два точных предложения до final freeze (не применены; нативного bad-SENT не наблюдалось):

1. **delivery.mjs:69 — presence echo.** Сейчас `typeof message.text!=='string'` принимает присутствующие text:null/number/object. Требование «если echo.text присутствует — exact saved text» для них не выполнено. Заменить только этот предикат:

```js
// Было: (typeof message.text!=='string'||message.text===card.text)
(!Object.hasOwn(message,'text')||message.text===card.text)
```

2. **worker.mjs:90–97 — explicit original/basis binding.** Проверяется card.expires_ts, но не её связь с исходными required facts; basis и saved→created→marker в receipt_bound не сверяются. В текущем pinned producer они следуют из обычного пути, однако capture сам этих условий AJ не доказывает. Минимально добавить после original readback и в существующий receipt_bound:

```js
const originalExpiry=Math.min(...['price','candles','orderbook']
  .map(k=>original.input.facts?.[k]?.expires_ts));
// Дополнительные && к существующей проверке, без новых IO:
Number.isSafeInteger(originalExpiry)&&
Number.isSafeInteger(card.expires_ts)&&card.expires_ts<=originalExpiry&&
card.receipt.http_started_ts<originalExpiry&&
card.receipt.http_clock_basis==='CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP'&&
Number.isSafeInteger(card.created_ts)&&original.saved_ts<=card.created_ts&&
card.created_ts<=card.send_started_ts
```

Неизвестный original expiry даёт NaN и отказ, без default clock. Строже ограниченный card expiry допустим; ACK по-прежнему может прийти позже него. Никаких новых gates стратегии/TTL обязательных фактов/изменений originals этим предложением не вводится. Native ACK/journal/finalization остаются отдельной actual SENT приёмкой ROOT.

Snapshot SHA256:
- runtime/telegram-send.mjs: be08fedc089455dc4d100428a7a6ff8b2fdbb6e364b2fdb2472c6f4403298d56
- runtime/delivery.mjs: a621bf346c70906c632c5e72db41e624b202e908edf6c37b4d6daf3e4768d096
- runtime/worker.mjs: 92c96367be2b5296a89ca48cc4bc47f61ca1b32a30d52c3ca065b2634f3c20bc

Authority main `523a7c18ef73f0f7e6b8df373a19fa1d8905a1f1`, all4 equal/fencefalse/generation прежняя; own10min CAS `b6ccd5babe510ceac822b2fb88ce63ddbd99478a` с FULL bytes/ref, guard blob refs в own lease. Только это дополнение; own release с FULL readback следует после freeze.9пауз/2OWNERdeferrals/caps/spent/unknown/reserves сохранены.
