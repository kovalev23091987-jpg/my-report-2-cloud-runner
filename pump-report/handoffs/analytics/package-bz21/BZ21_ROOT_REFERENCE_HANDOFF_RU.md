# BZ21 — минимальные protected references исхода

Подготовлена **reference-only дельта** к существующей матрице35 datasets, без повторного аудита. Authority main `9c81091eb124ad03adfae2196a7d35bc790e4efe`. База S: matrix SHA256 `5ca1963cd98b59e18cca173190b988f9df73942a55b9152be7d40ddbcfa2785a`, edges `253952cf150bb1053063c5555e91e16d0bb89f72158c1b9837dd1854ce72b7c1`. Оба frozen файла не менялись.

Дельта в **BZ21_PROTECTED_OUTCOME_REFERENCE_DELTA.json** содержит8 минимальных групп field→consumer→window→retention requirement:

| S datasets | Что защищено и почему |
|---|---|
| S01/02/09/10 | Exact hashed analysis+input, исходные факты/часы/plan/text/pin. Новый reader сверяет original; capsules/audit требуют точные digests. Потеряв эти bytes, нельзя восстановить их из counters |
| S13–15 | Journal analyses/publications, frozen_anchor immutable/key/digest/origin/selection и фактический terminal. Нужны исходный выбор/UNKNOWN resolution/UNSENT FIRST_READY, без reanchor |
| S17/18 | Card text/source_input_key/dedup/receipt/possible-send. То, что новый viewer читает4PK без card, не отменяет delivery/audit consumers этих ссылок |
| S19 | Signal.analysis_key + immutable T0/P0/plan/rules/mode/map/deadline и publication refs. Нельзя подставить latest analysis |
| S20/21 | Outcome identity, target/hit interval/coverage/reasons/**exact no_hit_basis**, adverse/scenario scalars и lower-bound entry excursion. Status или общий HIT/MISS counter недостаточен |
| S16/22/24–26 | Work targets, ordered source/member/head.pending, V3 source cursor/record receipts/instrument binding, per-wave contribution/witnesses, maturity current/due/scan/ACK |
| S23/25/26 | Immutable summary record и раздельные cohorts/unknowns/denominators. Aggregate не заменяет original или численные per-wave labels |
| S27–29/31 | Existing feature/outcome capsules, summary-capsule-link/protected-refs и manual/audit/owner refs. Global reference closure не доказана; external unresolved refs защищены |

Старые S25/S26 имена production-v2 уточнены до **существующего current production-v3** в дельте; никакой миграции, удаления или переписывания старой S-матрицы нет. Финальный BZ20 reader `c1a00c50e20f6aece6b9ac2150dca469697ca9a2070ba0a5f2781be82510b7d4` сохраняет смысл связей: immutable original → frozen journal → exact signal → bound outcome; partial MISS требует исходный no-hit basis. Formatter не заменяет эти доказательства.

**Четыре часа — consumer window, не TTL хранения.** Отложенная проверка в следующее business window, UNKNOWN/possible-send, replay/rebuild, maturity ACK и существующие audit/owner refs могут жить дольше. Во всех8группах approved_delete_ttl_ms=null, automatic_delete_enabled=false, delete_allowed=false, reference_closure_proven=false. Для будущего удаления нужны отдельные согласованные policy/closure/verified archive-reader/readback; этот пакет их не выдаёт и не назначает бессрочное физическое хранение как новую политику.

Оба OWNERdeferrals, parked prospective-pair hooks, caps/unknowns/выданные обязательства/резервы/manual3/9пауз сохранены. Старые ENTRY-followup/reader/cadence и sustainable storage/200protocol не открыты. Никаких Node/build/tests/nativeSQL/provider/CF/TG/code/cleanup операций. ROOT install14 происходит независимо; exact75/artifact/pin/flags/receipt приёмка не входит в эту reference-часть и будет отдельной. Genuine AUTO и эмпирическая калибровка OPEN.

