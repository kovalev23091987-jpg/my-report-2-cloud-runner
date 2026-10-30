# F574 — публичное состояние и vendor liquidation calculation

Два содержательных новых направления — Perennial и Adrena. Flash Trade удержан из-за официального wind-down notice, HMX не дал первичной схемы. Bounded dedup4343 сохранённых JSON/Markdown не нашёл выбранных primary API patterns; это не утверждение всемирной новизны. F562/F570/F573 и прежние отказы не переаудировались; Variational/Decibel оставлены AM.

## Perennial: точный vendor calculator, не готовая карта

[SDK read-only README](https://github.com/equilibria-xyz/perennial-v2-sdk-ts) документирует `markets.read.marketSnapshots({address,...})` для native market/user state и отдельно history. Read-only init требует supplied Arbitrum RPC с eth_call и optional graphUrl, без write-wallet параметров. Это keyless protocol-read interface; конкретный бесплатный RPC/graph access, quotas и Worker access ещё не установлены. SDK вызов не равен одному HTTP.

[Точный source](https://github.com/equilibria-xyz/perennial-v2-sdk-ts/blob/main/src/utils/positionUtils.ts#L45), blob `6d08d16bda36e9f3b5798d981539ff8f3aac4791`, SHA256 `6cb3ec0e81f0c93f3e8a221cb44445b6ad8c63770e5dd1857fb6e139113aa64f`,23540B, из tree `fded0c0399051022438359d1564fb159e8723e1e` содержит `calcLiquidationPrice`. Входы: market snapshot/latestPrice, maintenance/minMaintenance, collateral и position; limitPrice может заменить текущую цену. Результат long/short — vendor calculation; longBelowMargin/shortBelowMargin — другой margin threshold, не liquidation price. При отсутствующих/falsy входах возвращаются0n: это программный default, не реальный нулевой уровень.

В том же source `getStatusForSnapshot` различает open/opening/closing/pricing/closed/resolved и ошибки по current/next magnitude, collateral и price-update state. `isActivePosition` проверяет только status!=resolved: true возможно и для closed либо отсутствующего snapshot. Его нельзя выдавать за доказательство OPEN. Текущую экспозицию и pending settlement надо сохранять отдельно.

[Payoff docs](https://docs.perennial.finance/protocol/markets/payoff-and-positions) задают позиции в единицах payoff, включая nonlinear/leveraged exposures, а не всегда USD/base token. Код использует Big6Math/Big18Math; точные definitions/raw conversions не прочитаны. Не смешивать версии/шкалы и не превращать размер в доллары через BingX liquidation price. Полное связывание реального collateral/fees/unsettled state, oracle version/block, lifecycle ID и snapshot generation ещё не доказано. Helper прочитан как текст и не выполнялся; своих зон/модели нет.

Следующие новые primary code paths уже известны из tree: markets/chain.ts, markets/index.ts, big6Utils.ts. Они не открывались. До native шага нужны эти bindings, существующий ROOT-admitted account set, endpoint/ABI/calldata/call-count и отдельные actual admissions. Сейчас wire proposal не исполним и не отправлялся.

## Adrena: точный метод и поле, доступ ещё не доказан

[Vendor SDK README](https://github.com/AdrenaFoundation/adrena-sdk-ts) документирует `getPositionStatus({wallet,rpc,principalToken,positionAddress})` с pnl/size/collateral/leverage/liquidationPrice/entryPrice. Пример строит PDA из pool/owner/principal custody/side; никакие адреса не выводились и не собирались. Стабильность PDA между close/reopen, текущий OPEN filter, исходные clocks и единицы raw fields не доказаны.

README требует wallet transaction signer и RPC для всех функций. Signer-free реализация именно read-method ещё не прочитана; нет доказанного current free transport/quotas/Worker access. SDK beta и pinned ABI dependency не заменяют доказательство deployed state. Main/commodities pools различаются; synthetic commodities/USDC collateral не делают их crypto target.

Useful-links timeout и adrena-api.d.ts cache miss потрачены без повторов. Новое содержимое реализации core.js видно как repo file link, но не читалось. Это минимальный следующий documentary input для signing/data/oracle path; не разрешение RPC или SDK execution.

## Операционные удержания

У [Flash Trade](https://app.flash.trade/token) primary indexed notice указывает wind-down, close-only/force-close и settlement LP. Даты Aug31/Sep2/Sep15 не содержат года в excerpt: точная chronology не установлена, текущая OPEN availability не подтверждена. Старое описание maintenance/obligations формулы не делает протокол пригодным текущим источником. Нет native запроса и нет утверждения о текущем числе позиций.

По HMX поиск дал только нерелевантные старые GMX/Hyperliquid/community hits, которые проигнорированы. Новый docs.hmx.org недоступен инструменту; это не UNSUPPORTED для протокола/монет.

## Расход, границы и передача

F57412/12 SPENT, включая4/4 single searches и4 failed opens; каждая попытка заранее списана. GitHub static tree и один source file также учтены как primary attempts.0retry/fanout/vendor execution. All550 — NOT_CHECKED, новых пригодных карт/зон0, account discovery0. Current free значит текущий keyless/явно бесплатный режим без неизвестного trial, не вечную цену; реальные transport/quotas пока не квалифицированы.

Provider/market/metadata/RPC/SQL/TG/deploy/privatecaptures0; tests0; production source/runtime/registry/policy не трогались. No account/key creation, registration, purchase, trades, BTC/ETH benchmark или собственных зон. Old spent/unknowns/reserves/caps/9пауз/2OWNERdeferrals и пауза старого report сохранены. F5722SPENT/4unused и F57310SPENT отдельны; их grants не возобновлялись. Live66/TG/budget — ROOT.

Initial main `6123140772f1b3c484fd98c73ec191772edcb4d1`, finish fresh main `ebf84e88e006fbb20e352c41e41f849a36a6f387`; одна own40min CAS `d3c0b6b437bf1c2e2c5a130a6814808e6983462e` FULL. All4/core guards прежние, обновившийся coordinator window прочитан. SOURCE HEAD4b44 без нового коммита, TZ0674/unified384e неизменны. ROOT получает proposals/gaps; готовых production inputs или новых actual admissions этот пакет не даёт.
