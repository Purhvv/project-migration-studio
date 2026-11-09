# Shiftly — применение к тестовой базе

Target ref: `tuvvsgwlafpynnloeoyd`, внешний Supabase; владелец подтвердил исключительно тестовое назначение. PostgreSQL 17.11. Перед применением: 0 Auth users, 0 прикладных relations/functions в public/shiftly_private.

## Результаты

Все девять вызовов supabase.migration успешны, строго в порядке:

1. 20261108140000_v3_schema.sql
2. 20261108141000_v3_guards.sql
3. 20261108142000_v3_finance.sql
4. 20261108143000_v3_operations.sql
5. 20261108144000_v3_finance_hardening.sql
6. 20261108150000_v3_1_commission_largest_remainder.sql
7. 20261108151000_v3_1_status_and_validation.sql
8. 20261108152000_v3_1_versions_and_account.sql
9. 20261108153000_v3_1_timezone_guard.sql

Миграция 10: `20261109122351_c0028176-a11a-42d3-93d5-ee45a157c1a6.sql`, создана штатным инструментом и применена успешно. Внутри транзакции обнаруживает владельцев именно 12 Shiftly tables, снимает TRUNCATE/REFERENCES/TRIGGER у anon/authenticated и изменяет public default privileges каждого фактического владельца. Проверяет эффективные права, отсутствие глобально/наследуемо оставшихся опасных defaults и сохранность чтения/service_role/RPC. Не меняет владельцев и не повышает привилегии. Фактически все 12 владельцев — postgres, установлено по pg_class после создания, не предположено.

Read-only проверка после применения:
- 12 таблиц с RLS.
- anon/authenticated: TRUNCATE/REFERENCES/TRIGGER отсутствуют на всех 12 таблицах.
- authenticated: SELECT сохранён, INSERT/UPDATE/DELETE отсутствуют.
- service_role: SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER сохранены.
- owner-specific public defaults postgres: три опасных права отсутствуют у anon/authenticated, service_role не ограничен. Прочие defaults, включая MAINTAIN, не менялись: десятая миграция ограничена тремя разрешёнными правами.
- shiftly_write: anon EXECUTE=false, authenticated=true, service_role=true.
- shiftly_close_month/shiftly_delete_account: anon/authenticated EXECUTE=false, service_role=true.

После миграции 4 появился WARN authenticated SECURITY DEFINER function executable. Это предусмотренный публичный RPC shiftly_write с auth.uid(), owner-derived operations и фиксированным search_path; права не снимались ради подавления предупреждения. Предупреждение остаётся, полная безопасность/реальные Auth-флоу этим применением не доказаны.

Rollback для десятой сохранён в supabase/rollback с парным именем; он намеренно выдаёт ошибку без изменений, поскольку миграция forward-only. Автоматическое восстановление опасных grants не допускается. Это не обратный SQL, восстанавливающий ACL: для такого восстановления нужны отдельное разрешение и проверенный snapshot.

Регистрация/настройки Auth не менялись; psql, concurrency harness, fixtures и дополнительные тестовые циклы не запускались. UI/demo/business code вручную не менялись. Штатный инструмент автоматически обновляет generated Supabase types и сохраняет SQL-файлы; это отличается от изменения экранов. Автоматически сохранённые дополнительные SQL-копии не следует повторно применять вслепую; перед новым db push требуется сверить историю с оригинальным офлайн-пакетом.