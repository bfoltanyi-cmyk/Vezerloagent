# ADR-0005 – Mezőszintű adatosztályozás és `PersonDataProvider` az érintetti kérelemhez

Státusz: javasolt (T-0019) · Dátum: 2026-10-19 · Forrás: `docs/security/privacy/requirements.md` 1–3., 8. pont (R1, R2, R6)

## Kontextus
Az érintetti kérelemnek (GDPR 12–22.) egy kérésből minden modulban meg kell találnia, exportálnia, helyesbítenie, korlátoznia és törölnie kell egy személy adatait, a modulhatárok (ADR-0001) megsértése nélkül. Az adatkezelési nyilvántartást (GDPR 30.) nem akarjuk kézzel karbantartani.

## Döntés
1. **Osztályozás kódban, a séma mellett.** Minden modul `src/modules/<modul>/privacy/classification.ts`-ben `EntityClassification[]`-t exportál (`src/shared/privacy/classification.ts`): tábla, rekordtípus, érintett-kategória, mezőnként `purpose`, `legalBases`, `retentionCategory`, `sensitivity` (`pii`|`special`), `art9Condition`, `searchableAs`.
   - Validáció induláskor és CI-ban (`validateEntityClassification`): HJ (consent) csak `marketing.*` célra; különleges mezőhöz kötelező 9. cikk szerinti feltétel.
   - CI-kapu (T-0013-ba): migrációval új oszlopot kapó, személyes adatot tartalmazó táblánál az osztályozás hiánya build-hiba (allowlist a nem személyes oszlopokra).
   - DB-ben a metaadat `COMMENT ON COLUMN … IS 'pii:<kategória>'` formában is megjelenik (db-engineer), hogy DBA-eszközből is látható legyen; az igazság forrása a TS-deklaráció.
2. **Nyilvántartás generálása (R6):** `buildProcessingRegister()` modul × cél × érintett-kategória soronként, csak metaadattal. Végpont: `GET /api/v1/platform/privacy/register?format=json|csv|md`. DPIA-jelölt a sor, ha `containsSpecial` vagy a kategória `jelenlet`.
3. **`PersonDataProvider` (`src/shared/privacy/person-data-provider.ts`):** `classifications`, `search`, `export`, `rectify`, `setRestricted`, `erase(delete|anonymize)`, `retentionCandidates`. A provider csak a saját tábláit éri el, a `TransactionContext`-et paraméterként kapja.
4. **A platform vezérel (`PrivacyRegistry` + `DsrService` a `platform` modulban):** kérelemnyilvántartás, határidők (`dsr-deadline.ts`), törlés-vs-megőrzés döntés (ADR-0006), auditnapló. A provider nem dönt megőrzésről és nem naplóz auditot.
5. **Export:** JSON (egy fájl) vagy CSV (rekordtípusonként egy fájl, ZIP), UTF-8, pénz decimális szövegként, dátum ISO-8601 UTC. Harmadik személy adata kimarad (pl. számlán a kiállító munkatárs neve). Az exportfájl titkosítva, 7 napig tárolt, letöltés naplózott.
6. **Helyesbítés:** kiállított bizonylat mezője nem helyesbíthető (`409 RECORD_IMMUTABLE_FIELD`, válaszban a teendő: módosító számla); törzsadatnál verziózott módosítás, régi érték azonosítóval az auditban.

## Elvetett alternatívák
- Központi, minden modul tábláit olvasó DSR-lekérdezés: sérti a modulhatárt, minden sémaváltozásnál törik.
- Osztályozás csak DB-kommentben: nem típusbiztos, nem tesztelhető.

## Következmények
+ Új modul = új provider + osztályozás; a DSR és a nyilvántartás automatikusan bővül.
+ A „teszt-személy minden adata egy kérelemből” elfogadás providerenkénti szerződéstesztté bontható.
− Minden modulnak meg kell írnia a providerét (feladatok: `architecture.md` 9.2).
