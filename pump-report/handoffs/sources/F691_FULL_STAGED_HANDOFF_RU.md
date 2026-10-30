# F691 — полный staged proposal

PASS_CONTROLLED: единственный новый Node-process,9сценариев,actualHTTP/native/CF/TG0. Source opaque proof + atomic budget consumer + runner helper + worker private bridge реализованы только в staged.

639→638 подтверждено actual staged budget: новый grant11/allocation12, следующий649отказ. CAS callback retries не теряют token; commit после durable result идемпотентен для того же grant. OPEN11 сверяет полный original binding, oldOPEN12 не переоценивается, CLOSED/UNKNOWN не переоткрываются. Broker запрещает map-family доначисления и ограничивает grant11:12япопыткаотказ. Old62holds,638/80%,future3/hour/cost12 и3manual сохранены.

Canonical source/runtime/main не менялись. Патч6файлов, включая2новых; весь staged snapshot и hashes в manifest. Worker wiring подготовлен, но native Cloudflare construction/production acceptance не проверялись. ROOT review и отдельные actual admissions обязательны; это не install permission.

Exact patch SHA256:a247d4263bdea74fcf7179a50d25b3ed7b33d460999d10579c7fb672b64d152b. Ограниченная польза: максимум одна дополнительная11-ceiling commitment в снимкеF689, без обещанияSENT.
