# Architektúra – „Számla + Készlet Start" (MVP)

| | |
|---|---|
| Feladat | T-0004 (adatvédelmi rész: T-0019) |
| Alap | `docs/product/prd.md` (T-0002), `docs/security/policy.md` (T-0003), `docs/security/privacy/requirements.md` |
| Döntések | `docs/dev/adr/` (ADR-0001…0006) |
| Kódszabályok, DoD | `docs/dev/conventions.md` (T-0012, tech-lead) |
| Továbbadva | tech-lead és fejlesztők (feladatok: 9. pont) |

## 1. Áttekintés

Egyetlen telepíthető alkalmazás (moduláris monolit, ADR-0001) két futási módban, ugyanabból az image-ből:
- `APP_ROLE=api` – NestJS REST API + a lefordított React felület kiszolgálása,
- `APP_ROLE=worker` – háttérfeladatok: NAV-outbox, értesítések, megőrzési futások, mentés-ütemező.

Konténerek (Docker Compose): `app` (api), `worker`, `db` (PostgreSQL 16), `proxy` (Caddy: TLS, Let's Encrypt vagy saját tanúsítvány). Nincs Redis/üzenetsor: a sor és az outbox PostgreSQL-táblában él (`SELECT … FOR UPDATE SKIP LOCKED`), így a telepítés egyszerű marad (NF-2).

```
React SPA ──HTTPS──> proxy ──> app (api) ──┐
                                           ├── PostgreSQL (sémák modulonként)
                          worker ──────────┘──> NAV / SMTP / frissítés-ellenőrzés (allowlist, AC-26)
```

## 2. Modulok és határok

Repó: `product/backend/src/modules/<modul>/`. Modul más modul tábláját **nem olvassa és nem írja**; csak annak exportált szolgáltatásán (`<Modul>PublicService`) vagy eseményen keresztül kommunikál. Közös kód: `src/shared/` (pénz, jogosultság, tenant-kontextus, események, országcsomag-interfész, adatvédelmi szerződések). Kikényszerítés: ESLint `no-restricted-imports` (T-0013).

| Modul | DB-séma | Felelősség (PRD) | Publikus API mások felé |
|---|---|---|---|
| `platform` | `platform` | felhasználó, szerepkör, hitelesítés, auditnapló, beállítások, titoktár, érintetti kérelem, megőrzés, jogi tartás, mentés-ütemezés (P-1…P-15) | `AuthContext`, `AuditService.record()`, `SecretVault`, `PrivacyRegistry`, `RestrictionReader` |
| `licensing` | – (fájl) | offline licencellenőrzés, funkciókapcsolók, felhasználó-/raktárlimit | `LicenseService.isEnabled(feature)`, `limits()` |
| `masterdata` | `masterdata` | cég, partner, cikk, áfa-kulcs, deviza, import (TD-1…7) | `PartnerReader`, `ItemReader`, `VatRateReader`; `PersonDataProvider` |
| `invoicing` | `invoicing` | számla, sztornó, módosító, díjbekérő, sorszámkör, PDF, e-mail, fizetési státusz (SZ-*) | `InvoiceReader`; események: `InvoiceIssued`, `InvoiceCorrected`; `PersonDataProvider` |
| `inventory` | `inventory` | raktár, bizonylatok, mozgóátlagár, leltár, minimumkészlet (K-*) | `StockService.issueForInvoice()`, `returnForCorrection()`, `StockReader` |
| `nav-connector` | `nav` | HU e-számla csatoló: XML, outbox, státusz, napló (NAV-*) | implementálja a `EInvoiceConnector` interfészt (ADR-0004) |
| `reports` | – (csak olvasás) | R-1…R-7, könyvelői export | – (csak a többiek `*Reader` szolgáltatásait használja) |

Függési irány (körmentes): `platform`, `licensing` ← `masterdata` ← `inventory` ← `invoicing` → `nav-connector` (eseményen át); `reports` mindenkit olvas, őt senki. Adatvédelemnél fordított vezérlés: a `platform` csak a `src/shared/privacy` interfészt ismeri, a modulok induláskor regisztrálják magukat (nincs `platform` → modul import).

## 3. Modulközi kommunikáció és tranzakciók

- **Szinkron, egy tranzakcióban** (NF-3): számla-kiállítás = sorszámfoglalás + számla mentés + `StockService.issueForInvoice()` + outbox-sor, egyetlen DB-tranzakcióban. A tranzakciót a hívó (invoicing) nyitja; a `TransactionContext`-et a publikus szolgáltatások paraméterként kapják. Elégtelen készletnél (AC-11) a teljes kiállítás visszagördül, `409 INSUFFICIENT_STOCK` + elérhető mennyiség.
- **Aszinkron, outbox** (ADR-0003): `InvoiceIssued`/`InvoiceCorrected` → `platform.outbox` sor → worker → `nav-connector`. NAV-hiba nem blokkolja a számlázást (NAV-3, AC-6). Exponenciális várakozás, max. 24 óra után „beavatkozás kell" állapot és riasztás.
- **Minimumkészlet-riasztás** (AC-14): a mozgás tranzakciójában `StockBelowMinimum` esemény az outboxba, worker 30 mp-es ciklusban dolgozza fel.

## 4. Adatmodell (fő entitások)

Minden tábla: `id uuid`, `company_id uuid NOT NULL` (tenant, ADR-0002), `created_at/updated_at timestamptz` (UTC), `created_by`. Pénz: `bigint` minor unitban (`*_minor`) + `currency char(3)`; egységár és mennyiség `numeric(19,4)`; árfolyam `numeric(18,6)`. Lebegőpontos típus tilos. Személyes adatot tartalmazó tábla: + `privacy_restricted boolean`, `privacy_restricted_until timestamptz` (ADR-0006).

| Séma | Táblák (lényeg) |
|---|---|
| platform | `company`, `user`, `role`, `role_permission`, `user_role`, `session`, `audit_log` (append-only), `setting`, `secret` (AES-256-GCM boríték), `outbox`, `dsr_request`, `dsr_item`, `dsr_export_file`, `restriction`, `legal_hold`, `retention_override`, `retention_run`, `retention_item` |
| masterdata | `partner` (típus: `domestic_company`/`eu_company`/`foreign`/`private_person`), `partner_address`, `contact_person`, `item` (készletkezelt, szolgáltatás jelző, VTSZ/SZJ, EAN), `item_min_stock` (raktáranként), `vat_rate` (+ NAV-kód, mentességi jogcím), `currency_rate`, `bank_account` |
| invoicing | `number_sequence` (sorszámkör: prefix, év, telephely, `next_value`), `invoice` (típus: `normal`/`storno`/`modification`/`proforma`/`advance`, `original_invoice_id`, partner-**pillanatkép** JSON), `invoice_line`, `invoice_vat_summary`, `payment`, `email_dispatch_log` |
| inventory | `warehouse` (`allow_negative`), `stock_document` (típus, saját sorszám, `reverses_document_id`), `stock_movement` (cikk, raktár, ± mennyiség, egységköltség), `stock_balance` (cikk×raktár: mennyiség, mozgóátlagár), `stocktake`, `stocktake_line`; előkészítve: `lot_id`/`serial_id` NULL-képes oszlopok (K-10) |
| nav | `nav_submission` (számla, művelet, `transaction_id`, státusz, próbálkozás), `nav_log` (XML-kérés/válasz titok nélkül, 8 év), `nav_error_hint` (hibakód → magyar teendő) |

Kulcsszabályok:
- **Hézagmentes sorszám** (SZ-2, AC-3): `number_sequence` sor `SELECT … FOR UPDATE` a kiállítási tranzakcióban; PostgreSQL `SEQUENCE` tilos (hézagot hagy).
- **Változatlanság** (SZ-2, AC-4, K-2): `issued` állapotú `invoice`/`invoice_line` és minden `stock_document` UPDATE/DELETE-jét trigger tiltja; a változó állapot (NAV-státusz, fizetés) külön táblában él. Javítás csak sztornó/módosító/ellenbizonylat. Egyetlen kivétel: `platform.anonymize_record()` megőrzési lejárat után (ADR-0006 8.).
- **Partner-pillanatkép:** a számla a kiállításkori partneradatot másolja (törzsadat-változás nem írja át a bizonylatot); érintetti exportban és korlátozásban szerepel.
- **Mozgóátlagár** (K-4, AC-12): bevételezéskor `új_átlag = (készlet×átlag + menny×ár) / (készlet+menny)`, 4 tizedesre kerekítve, half-up; kiadás átlagáron. Visszamenőleges készletérték (R-1, AC-17) a `stock_movement` naplóból számolódik.
- **Kerekítés** (NF-3): soronként nettó → áfa → bruttó minor unitra half-up; áfaösszesítő kulcsonként; készpénzes 5 Ft-os kerekítés külön sor (SZ-6 ⚠). Egy helyen: `shared/money`.

## 5. API-szerződések

- REST, prefix `/api/v1/<modul>/…`, JSON; OpenAPI 3.1 generálva (`@nestjs/swagger`), a `docs/dev/api/openapi.json` a CI-ban frissül és diffelődik.
- Hiba: RFC 9457 `application/problem+json`, stabil `code` mező (pl. `INVOICE_IMMUTABLE`, `INSUFFICIENT_STOCK`, `SEQUENCE_CONFLICT`), magyar üzenet i18n-kulcsból.
- Kiállítás idempotens: `Idempotency-Key` fejléc a `POST /invoicing/invoices/{id}/issue` hívásra.
- Lapozás: kurzor alapú (`?cursor=&limit=` max. 200), szűrés whitelistelt mezőkre (NF-1).
- Kiállított bizonylatra `PUT/PATCH/DELETE` → `409 INVOICE_IMMUTABLE` + auditbejegyzés (AC-4).
- Fő végpontok: `masterdata/partners|items|vat-rates|imports`; `invoicing/invoices` (+`/issue`, `/storno`, `/modify`, `/pdf`, `/send`, `/payments`), `invoicing/proformas/{id}/convert`; `inventory/warehouses|documents|balances|stocktakes|alerts`; `nav/submissions` (+`/retry`); `reports/*` (+`?format=csv|xlsx|xml`); `platform/users|roles|audit|settings|secrets|backups`; adatvédelem: 7.3.
- Enterprise nyilvános API (később): ugyanez a felület API-kulccsal, licenckapcsolóval.

## 6. Jogosultsági modell

- Hitelesítés: munkamenet-süti (`HttpOnly`, `Secure`, `SameSite=Strict`), Argon2id, próbálkozás-korlátozás, TOTP (P-2). Nincs JWT a böngészőben.
- Engedélyek `modul.erőforrás.művelet` formában (pl. `invoicing.invoice.issue`), lista: `src/shared/auth/permissions.ts`. Szerepkör = engedélyhalmaz; a PRD öt beépített szerepköre ott definiált, egyedi szerepkör a felületről.
- **Alapból tiltás:** globális `PermissionGuard`; engedély nélküli végpont 403-at ad. `@Public()` csak a bejelentkezésre és a health-re.
- Objektumszint: minden lekérdezés `company_id`-re szűr (repository-réteg) **és** PostgreSQL RLS (`app.company_id` munkamenet-változó) – kettős védelem (ADR-0002).
- Korlátozott rekordot csak `privacy.restricted.read` engedély lát (AC-22); adatvédelmi engedélyek: 7.4.
- Minden engedélyhez negatív teszt (AC-19).

## 7. Személyes adatok, adatvédelem

Adatkörök: PRD 3.7; követelmények: `docs/security/privacy/requirements.md` (R1–R3, R6). Döntések: **ADR-0005** (osztályozás, `PersonDataProvider`), **ADR-0006** (megőrzési motor). Közös kód (kész, tesztelt): `product/backend/src/shared/privacy/` – `classification.ts`, `processing-register.ts`, `person-data-provider.ts`, `dsr-deadline.ts`, `retention.ts`, `retention-profiles.ts`.

### 7.1 Felelősségmegosztás (modulhatár)

| Ki | Mit csinál | Mit nem |
|---|---|---|
| Adatot tároló modul (`masterdata`, `invoicing`, később `hr`) | `privacy/classification.ts` + `PersonDataProvider` a saját tábláira; korlátozott sor kihagyása a saját listáiból | nem dönt megőrzésről, nem naplóz auditot, nem nyúl más modul táblájához |
| `platform/privacy` | `PrivacyRegistry` (regisztráció, induláskori validálás), `DsrService` (kérelem, határidő, export, döntés), nyilvántartás-generálás | nem olvas modultáblát közvetlenül |
| `platform/retention` | profil + ügyfél-felülírás, napi futás, `restriction`, `legal_hold`, jóváhagyás | – |
| DB | RLS, korlátozás-trigger, `anonymize_record()` SECURITY DEFINER, oszlopkommentek | – |

### 7.2 Érintetti kérelem folyamata
Kérelem rögzítése → határidő (1 hónap, indokolt +2, `dsr-deadline.ts`, figyelmeztetés lejárat előtt 7 és 2 nappal) → `search` minden providerben → kezelő kiválasztja a találatokat → művelet (export / helyesbítés / korlátozás / törlés) → rekordonkénti döntés az ADR-0006 6. pont szerint → lezárás eredménnyel. Minden lépés auditnaplóba, csak azonosítóval.

### 7.3 API-szerződés (`/api/v1/platform/…`)

| Végpont | Engedély | Eredmény / hibakód |
|---|---|---|
| `POST /dsr` (`type`: access, portability, rectification, restriction, erasure, objection; azonosítók; beérkezés) · `GET /dsr`, `GET /dsr/{id}` | `privacy.dsr.manage` | 201 + `dueAt` |
| `POST /dsr/{id}/search` | `privacy.dsr.manage` | `PersonRecordHit[]` |
| `POST /dsr/{id}/export` (`format`: json\|csv) → `GET /dsr/{id}/exports/{fileId}` | `privacy.dsr.export` | 202, majd fájl (7 nap) |
| `POST /dsr/{id}/rectify` (`ref`, `changes`) | `privacy.dsr.manage` | 409 `RECORD_IMMUTABLE_FIELD`, `RECORD_RESTRICTED` |
| `POST /dsr/{id}/restrict` · `POST /dsr/{id}/erase` (`refs`) | `privacy.dsr.manage` | rekordonként `erased` / `restricted_until` / `rejected` + indok; 409 `LEGAL_HOLD_ACTIVE` |
| `POST /dsr/{id}/extend` (indok) · `POST /dsr/{id}/close` | `privacy.dsr.manage` | 422 `DSR_EXTENSION_LIMIT` |
| `GET /retention/profile` · `PUT /retention/overrides/{category}` | `privacy.retention.configure` | 422 `RETENTION_BELOW_LEGAL_MINIMUM` |
| `GET /retention/runs` · `GET /retention/pending` · `POST /retention/items/{id}/approve\|reject` | `privacy.retention.approve` | – |
| `POST /legal-holds` · `GET /legal-holds` · `POST /legal-holds/{id}/release` | `privacy.legal_hold.manage` | – |
| `GET /privacy/register?format=json\|csv\|md` | `privacy.register.read` | csak metaadat |

### 7.4 Engedélyek
`privacy.dsr.manage`, `privacy.dsr.export`, `privacy.restricted.read`, `privacy.retention.configure`, `privacy.retention.approve`, `privacy.legal_hold.manage`, `privacy.register.read`. Beépítetten csak az adminisztrátor szerepkör kapja; a jóváhagyás és a konfigurálás szétválasztható (négy szem).

### 7.5 Egyéb szabályok
- Technikai naplóban csak azonosító; központi redaktor (policy 4.2, 7.2) – részletek: T-0020. NAV-XML magánszemélynél név/cím nélkül (NAV-5).
- Megőrzési profilok `draft: true`, amíg a privacy-hu/pl/cz és a jogász nem erősíti meg: release-blokkoló figyelmeztetés.
- Álnevesítés, hozzájárulás-nyilvántartás: T-0021.

### 7.6 DPIA-szükségesség

| Terület | DPIA | Indok |
|---|---|---|
| MVP (számlázás, készlet, törzsadat) | **nem kötelező** (előzetes) | nincs különleges adat, megfigyelés, profilalkotás; privacy-officer megerősíti (T-0006) |
| Érintetti kérelem és megőrzési motor | nem kötelező | kockázatot csökkentő funkció; az export-fájl és az anonimizálás kockázata a fenyegetésmodellbe (T-0037) |
| Auditnapló (felhasználói tevékenység) | megerősítendő | munkavállalói tevékenység rögzítése → privacy-officer döntése |
| HR-szelet (`hr_kulonleges`, `jelenlet`, bér) | **kötelező, a fejlesztés előtt** | különleges adat (9. cikk), munkahelyi adatkezelés; a nyilvántartás ezeket DPIA-jelöltként jelzi |

## 8. Lokalizáció, licenc, telepítés

- **Országcsomag** (ADR-0004, NF-7): `CountryPack` interfész (`src/shared/country/`) – adószám-validátor, áfa-szabályok, `EInvoiceConnector`, megőrzési profil, számlasablon, kerekítés. MVP: `hu`; `pl` (KSeF) és `cz` a magot nem érinti.
- **i18n:** backend és frontend üzenetkulcsok (`hu.json`), dátum UTC-ben tárolva, megjelenítés `Europe/Budapest` szerint.
- **Licenc:** Ed25519-tel aláírt JSON licencfájl (cég adószám, kiadás, funkciók, limitek, lejárat a frissítési jogra), a nyilvános kulcs az image-ben; nincs hazatelefonálás. Részletek: `product/licensing/README.md`.
- **Telepítő:** `product/installer/` – `install.sh` generál telepítésenként véletlen titkokat (`0600` env-fájl/Docker secret), elindítja a compose-t, első indításkor varázsló. Frissítés: `update.sh` = aláírás-ellenőrzés → kötelező titkosított mentés → migráció (`up`) → hiba esetén visszaállítás. Migrációk: `product/db/migrations/NNNN_<név>.up.sql` / `.down.sql`.
- DB-szerepkörök: `erp_migrator` (DDL), `erp_app` (DML, nincs UPDATE/DELETE a `platform.audit_log`-on), nem superuser.

## 9. Fejlesztői feladatok

| Feladat | Szerep | Függ | Azonosító |
|---|---|---|---|
| DB alapok: sémák, RLS, DB-szerepkörök, változatlansági triggerek, sorszámkör, migrációfuttató | db-engineer | – | T-0034 |
| Platform: hitelesítés, felhasználó/szerepkör, PermissionGuard, auditnapló, titoktár | api-dev | T-0034 | T-0035 |
| Telepítő, mentés/visszaállítás, frissítő | devops | T-0034, T-0013 | T-0036 |
| Fenyegetésmodell (architektúra + NAV) | appsec | – | T-0037 |
| Licencellenőrzés és funkciókapcsolók | api-dev | T-0035 | T-0038 |
| Törzsadatok + CSV/XLSX import | backend-accounting | T-0035 | T-0039 |
| Készletkezelés | backend-inventory | T-0039 | T-0040 |
| Számlázás (+PDF, e-mail) | backend-invoicing | T-0040, T-0039 | T-0041 |
| NAV-csatoló, riportok, frontend váz | integration-dev, backend-accounting, frontend-core | 9.1 | *létrehozandó* (9.1) |
| Adatvédelem: DB, DSR, megőrzés, providerek | db-engineer, backend-hr, backend-accounting, backend-invoicing | 9.2 | *létrehozandó* (9.2) |

### 9.1 Még létrehozandó feladatok (napi feladatkorlát miatt elhalasztva)

- **NAV-csatoló** – `modules/nav-connector/`, séma `nav`. `EInvoiceConnector` NAV Online Számla 3.0-ra (T-0011 alapján); outbox-feldolgozás a workerben (SKIP LOCKED, exponenciális várakozás, 24 óra után „beavatkozás kell" + riasztás); `nav_submission`, `nav_log` (titok nélkül), `nav_error_hint`; `POST /api/v1/nav/submissions/{id}/retry`; magánszemélynél név/cím nélküli XML; technikai kulcs csak `SecretVault`-ból. Elfogadás: DoD, NAV-mockkal tesztelt siker/hiba/időtúllépés/újrapróbálás, AC-6.
- **Riportok** – `modules/reports/`, csak `*Reader` szolgáltatásokon át; visszamenőleges készletérték a mozgásnaplóból (AC-17); `?format=csv|xlsx|xml`, kurzoros lapozás; engedélyek negatív teszttel. Elfogadás: DoD, ismert kimenetű tesztadat.
- **Frontend váz** – `product/frontend/`: router, design system, problem+json hibakezelés i18n-kulccsal, bejelentkezés sütivel (nincs token localStorage-ban), TOTP, jogosultságfüggő menü; dátum `Europe/Budapest`, pénz minor unitból. Elfogadás: komponens- és egységtesztek, akadálymentességi alapok, statikus build.

### 9.2 Adatvédelmi feladatok (T-0019 bontása; napi korlát miatt még létrehozandó)

- **P1 · db-engineer · DB adatvédelmi réteg** (függ: T-0034) – migrációk fel/le: a 4. pont `platform` adatvédelmi táblái RLS-sel (`dsr_request` azonosítói titkosítva; `retention_item` egyedi: futás × rekord); `privacy_restricted`/`_until` oszlop + BEFORE UPDATE/DELETE trigger a személyes adatos táblákon (`409 RECORD_RESTRICTED`-re képezhető SQLSTATE; kivétel a jelző és az anonimizálás); `platform.anonymize_record()` SECURITY DEFINER (csak élő `execute` tétel vagy jóváhagyott DSR-törlés mellett, tartás alatt hiba, pénz/sorszám/áfa érintetlen); `COMMENT ON COLUMN 'pii:<kategória>'`. Elfogadás: fel/le teszt, RLS- és trigger-negatívtesztek.
- **P1 · backend-hr · PrivacyRegistry + DSR + nyilvántartás** (függ: T-0035, DB-feladat) – `modules/platform/privacy/`; 7.2–7.4 szerint; `platform.user` saját providere; export titkosítva, 7 nap, letöltés auditálva. Elfogadás: DoD; szerződésteszt mock providerekkel; e2e „teszt-személy minden adata egy kérelemből"; számlára törlési kérés → korlátozás lejáratig; engedély-negatívtesztek; OpenAPI.
- **P2 · backend-hr · Megőrzési motor + jogi tartás** (függ: T-0035, DB-feladat) – `modules/platform/retention/`; ADR-0006 szerint (worker, `RETENTION_RUN_CRON`, ≤ 500/lap, SKIP LOCKED, idempotens; override-korlát; PL `accounts_approved` `platform.setting`-ből). Elfogadás: DoD; álidős integrációs teszt (lejárat, türelmi idő, jóváhagyás, tartás felfüggeszt); ismételt futás nem duplikál.
- **P2 · backend-accounting · masterdata provider** (függ: T-0039) – `partner` (magánszemély, egyéni vállalkozó), `contact_person`, `bank_account` osztályozása és providere; anonimizálás, ha számla hivatkozik rá; `relationship_end` jelöltek. Elfogadás: providerszerződés-teszt, korlátozott rekord negatívteszt.
- **P2 · backend-invoicing · invoicing provider** (függ: T-0041) – `invoice.partner_snapshot`, `email_dispatch_log`; export harmadik személy nélkül; rectify → `409 RECORD_IMMUTABLE_FIELD`; törlés csak `anonymize_record()`-on át. Elfogadás: providerszerződés-teszt; anonimizálás után összegek és sorszám változatlan.
- **Adatvédelmi előfeltétel (privacy-hu/pl/cz):** HR-megőrzési kategóriák értékei és a profilok megerősítése a `draft` jelző levételéhez.
