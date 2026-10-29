# ADR-0006 – Megőrzési motor: országprofil, lejárati ütemező, korlátozás, jogi tartás

Státusz: javasolt (T-0019) · Dátum: 2026-10-19 · Forrás: `docs/security/privacy/requirements.md` 3.6–3.7, 4. pont (R3)

## Kontextus
Számlát a megőrzési idő alatt kérésre sem törölhetünk (GDPR 17.3.b), csak korlátozhatunk; lejárat után automatikusan törölni/anonimizálni kell. Az idők és kezdőesemények országonként eltérnek (HU 8 év; PL 5 év a beszámoló jóváhagyását követő év elejétől, kézi jóváhagyással; CZ számla 10 év).

## Döntés
1. **Profil** = `RetentionProfile` (ország, verzió, `draft`, szabályok), a `CountryPack.retentionProfile`-ból (ADR-0004); alapértékek: `src/shared/privacy/retention-profiles.ts`. Amíg a jogász nem erősíti meg, `draft: true`, és kiadásjelöltben ez release-blokkoló figyelmeztetés.
2. **Szabály:** kategória, `durationMonths`, `anchor` (`document_date` | `fiscal_year_end` | `accounts_approved` | `employment_end` | `relationship_end`), `startOffset` (`next_year_start`), `action` (`delete` | `anonymize` | `review`), `manualApproval`, `legalMinimumMonths`. Ügyfél-felülírás csak felfelé a törvényi minimumhoz képest (`422 RETENTION_BELOW_LEGAL_MINIMUM`).
3. **Életciklus** (`decideRetention`): `retain` → lejárat → `restrict` → türelmi idő (alap 30 nap, beállítható) → `await_approval` (ha `manualApproval` vagy `review`) → `execute`. Ismeretlen kezdőesemény (pl. még élő kapcsolat, jóvá nem hagyott beszámoló) = megőrzés.
4. **Jogi tartás:** `platform.legal_hold` (rekordhivatkozás, ok, ki, mikor, feloldás). Aktív tartás minden ponton felfüggeszti az életciklust és a DSR-törlést (`409 LEGAL_HOLD_ACTIVE`).
5. **Korlátozás (`restricted`):** igazság forrása a `platform.restriction` (rekordhivatkozás, ok: `dsr` | `retention_expiry` | `manual`, `until`, DSR-azonosító); a provider saját tábláján denormalizált `privacy_restricted boolean` + `privacy_restricted_until`. Hatás: lista/keresés/riport/export kihagyja (csak `privacy.restricted.read` látja), írás tiltott (DB-trigger, `409 RECORD_RESTRICTED`), kivéve a jelző és az anonimizálás.
6. **DSR-törlés döntése** (platform): rekordonként szabály → ha tartás: elutasítás indokkal; ha nem járt le és `legalMinimumMonths > 0`: korlátozás a lejáratig (`until` = számolt lejárat), a kérelembe indoklás „GDPR 17.3.b, <kategória>, <dátum>”; egyébként a szabály `action`-je azonnal.
7. **Ütemező:** a `worker` naponta (02:00 helyi idő, `RETENTION_RUN_CRON`) cégenként `retention_run`-t indít; providerenként `retentionCandidates()` lapozva (≤ 500/lap), `SKIP LOCKED`-del párhuzamosan futtatható, idempotens (`retention_item` egyedi kulcs: futás × rekord). Minden lépés auditnaplóba kerül (csak azonosítóval). A jóváhagyásra váró lista a felületen + értesítés a `privacy.retention.approve` jogosultnak.
8. **Anonimizálás változatlan bizonylaton:** az `issued` számla UPDATE-tiltó triggere alól egyetlen kivétel a `platform.anonymize_record()` SECURITY DEFINER függvény, ami csak az osztályozásban `pii` mezőket írja fix helyettesítőre (`[anonimizált]`), és csak élő `retention_item` (`execute`) mellett hívható. Pénzösszeg, sorszám, áfaadat marad.

## Következmények
+ Új ország = új profil, kód nélkül; jogászi módosítás = profilverzió-emelés migrációval.
− A PL `accounts_approved` kezdőeseményhez a könyvelés modulnak (Pro) kell majd szolgáltatnia a beszámoló-jóváhagyás dátumát; addig PL-en manuálisan rögzíthető beállítás (`platform.setting`).
− A HR-kategóriák (`hr_torzs`, `ber`, `hr_kulonleges`, `jelenlet`) értékei hiányoznak; a HR-szelet előtt kötelező pótolni (privacy-hu/pl/cz).
