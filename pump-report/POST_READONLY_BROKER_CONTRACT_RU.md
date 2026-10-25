# Ограниченные read-only JSON POST: подготовленный контракт ROOT

ТЗ v2 и все прежние caps/unknowns/reserves сохраняются. Поддержка подготовлена локально; серверный pin b35a4b... и действующий разовый statistics grant от этого не меняются. Существующие GET ключи кэша сохранены. Никакого провайдера или положительного допуска этот файл не активирует.

SOURCE получает от ROOT `broker.request({provider,family,purpose,cache_key,url,method:'POST',json_body,timeout_ms,ttl_ms,candidate_id,estimated_cost:{http:1}})`. json_body — обычный сериализуемый объект <=4096 UTF-8 B. Прежний параметр body не используется. Для POST query/hash URL запрещены. Установлены content-type application/json, redirect manual, прежние deadline/body byte limits, измерение исходного receive, pacing и атомарный расход.

Положительная ROOT policy обязана одновременно допускать host/path и содержать не более10 точных `readonly_json_post_templates:[{method:'POST',read_only:true,path:'/info',body:{type:'clearinghouseState',user:'EXACT_ADMITTED_PUBLIC_ADDRESS'}}]`. Все keys/значения body должны совпадать. Другой адрес, иной type, новый endpoint, произвольный body или отсутствие policy отклоняются до HTTP. Нет разрешения на trade/order/exchange endpoints. Пример выше — форма, не настоящий адрес или допуск. Адаптер не создаёт policy из собственного запроса.

Ключ POST включает SHA256 канонического JSON body; перестановка ключей эквивалентна, разные accounts/type не делят cache/coalescing/negative-cache. Число вызовов, в том числе неизвестные исходы, считает прежний общий broker; POST не является новой бесплатной семьёй. SOURCE не делает fetch напрямую. Root policy поставщика, native envelope, реальные квоты, сопоставление актива, currency/units/price basis/clock и конечная выборка аккаунтов требуются отдельно.

Новые ROOT проверки: один связанный POST case (точные body, coalescing/cache isolation, отказы и monotonic old unknown), отдельно один affected GET-cache case (старый ключ, исходные часы,0новых reservation/HTTP). Старые принятые батареи не повторялись. HTTP/SQL/TG/deploy в этих локальных проверках0.
