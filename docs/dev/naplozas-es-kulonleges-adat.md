# Naplózás, incidenskezelés, támogatási hozzáférés és HR-különleges adat – architektúra

Feladat: T-0020 (R4, R5, R7, R11) · Döntések: `adr/0007`, `adr/0008` · Kapcsolódik: `architecture.md` 6–7. pont, ADR-0005/0006 · Kulcskezelés CISO-egyeztetés: T-0048 · DPIA: T-0049

## 1. Modulelhelyezés
- `platform/audit` (AuditService, verify, anchor, olvasó API), `platform/incident`, `platform/support-access`, `platform/crypto` (KeyProvider, FieldCrypto, kulcsforgatás). A `shared/crypto` csak az interfészt és a `Sensitive<T>`-t adja; modulok a `platform` publikus szolgáltatásait használják (`AuditService.record()`, `FieldCrypto.encrypt/decrypt`).
- `hr` modul: `hr.special_record` (`modules/hr/special/`); nem ír közvetlenül naplót és nem kezel kulcsot.

## 2. Naplóbejegyzés (`platform.audit_log`)
`id uuid, company_id, seq bigint, occurred_at timestamptz, category (access|admin|security|support), actor_type (user|system|support|api_key), actor_id, action, resource_type, resource_id, outcome (ok|denied|error), ip (megőrzés: `naplo`), client_hint, request_id, grant_id NULL, details jsonb, prev_hash, hash`.
- Akciók (nyitott lista, kódban `AuditAction` enum): `record.read|create|update|delete|export`, `special.read|write`, `auth.login|login_failed|logout|mfa_failed`, `permission.grant|revoke`, `role.change`, `setting.change`, `dsr.*`, `retention.*`, `key.rotate`, `support.grant|revoke|use|expire`, `audit.read|verify|export`, `incident.*`.
- `details` példa (csak azonosító és mezőnév): `{"fields":["email","phone"],"count":1}`; sosem érték.

## 3. API-szerződés (`/api/v1/platform/…`)

| Végpont | Engedély | Megjegyzés |
|---|---|---|
| `GET /audit?category=&actor=&resource=&from=&to=&cursor=` | `audit.log.read` | kurzoros, whitelistelt szűrők; az olvasás naplózott |
| `GET /audit/verify?from=&to=` | `audit.log.verify` | `{ok, firstBrokenSeq?}`; hibánál `security` bejegyzés + incidens |
| `GET /audit/anchors` · `GET /audit/export?format=csv\|json` | `audit.log.export` | export szintén értékmentes, naplózott |
| `GET/POST /incidents` · `GET /incidents/{id}` | `incident.read` / `incident.manage` | 201 + `authorityDeadlineAt` |
| `POST /incidents/{id}/assess` (kockázat, érintettek becsült köre) · `/report` (hatóság, idő) · `/notify-subjects` · `/close` | `incident.manage` | 409 `INCIDENT_INVALID_TRANSITION`; a lezáráshoz intézkedés kötelező |
| `GET/PUT /settings/security-alerts` (címzettek, küszöbök) | `incident.manage` | 422 ha nincs címzett |
| `POST /support-grants` (támogató, indok, hatókör, `durationHours`≤72, `unmask`) | `support.grant.manage` | 201 + egyszeri kód; 422 `SUPPORT_SCOPE_FORBIDDEN` (`hr.special.*`, titok, kulcs) |
| `GET /support-grants` · `POST /support-grants/{id}/revoke` · `GET /support-grants/{id}/report` | `support.grant.manage` | összesítő a naplóból |
| `POST /support/session` (kód + TOTP) | publikus belépési pont, korlátozva | 401/429; munkamenet a grant lejártáig |
| `GET /hr/special-records?employeeId=` · `GET /hr/special-records/{id}[?reveal=true]` · `POST/PUT /hr/special-records` | `hr.special.read` / `hr.special.write` | lista mindig maszkolt; `reveal` naplózott; 403 `SPECIAL_DATA_FORBIDDEN` |
| `GET /hr/reports/absence-summary` | `hr.reports.read` | csak aggregátum, `<5` elfedés |
| `POST /keys/rotate` · `GET /keys` | `platform.key.rotate` | metaadat (id, státusz, kor), kulcsanyag soha |

Hibaformátum: RFC 9457, a `code` mezők a táblában.

## 4. Jogosultsági modell illesztése
Új engedélyek (`shared/auth/permissions.ts`): `audit.log.read`, `audit.log.verify`, `audit.log.export`, `incident.read`, `incident.manage`, `support.grant.manage`, `hr.special.read`, `hr.special.write`, `platform.key.rotate`.

| Beépített szerepkör | Kapja |
|---|---|
| Adminisztrátor | `audit.log.*`, `incident.*`, `support.grant.manage`, `platform.key.rotate` – **`hr.special.*` nem** |
| HR-vezető | semmi az újak közül (`hr.special.*` sem) |
| Egyedi szerepkör | bármi, kivéve: `hr.special.*` kiosztása `admin` naplót + riasztást ad; `support` actor nem kaphat tiltott engedélyt |
| Támogató (`actor_type=support`) | csak a grant hatóköre, lejárattal, sosem `hr.special.*`/titok/kulcs |

Szabályok: alapból tiltás (meglévő `PermissionGuard`); a naplóhoz nincs írási engedély, mert nincs írási végpont; engedélyt kiosztó személy a saját `hr.special.*` kiosztásáról riasztást generál (négy szem: ajánlott, hogy ne ő legyen az olvasó).

## 5. Folyamatok
- **Olvasás-naplózás:** `@AuditedRead(resourceType)` interceptor + kézi `record()` providerekben; nem személyes adatú listákra nem fut. Különleges adat: dekódolás előtt, rekordonként.
- **Incidens-szabályok (alap):** ≥ 10 sikertelen belépés/10 perc/fiók vagy ≥ 50/10 perc/cég; lánc-ellenőrzési hiba; > 20 különleges rekord-feloldás/óra/felhasználó; támogatói munkamenet grant után; mentési hiba 2× egymás után. Mind `platform.setting`-ből hangolható.
- **72 órás óra:** `awareness_at` kézzel is állítható (indokkal, naplózott); emlékeztető 48/24/6 órával a workerből, outboxon át, személyes adat nélkül.
- **Kulcsforgatás:** ADR-0008 5. pont; worker `KEY_REENCRYPT_BATCH` (alap 200).

## 6. DPIA-szükségesség
HR-különleges adat: **kötelező** ügyféloldali DPIA a HR-szelet előtt (T-0049). Auditnapló: privacy-officer dönt (T-0049); a napló értékmentessége és 1 éves megőrzése csökkentő intézkedés.

## 7. Fejlesztői feladatok és tesztkövetelmény

| Feladat | Szerep | Függ | Kulcs-teszt |
|---|---|---|---|
| T-0050 DB-réteg | db-engineer | T-0034 | trigger/RLS/prune negatívtesztek, fel/le |
| Audit szolgáltatás + API | api-dev | T-0050, T-0035 | lánc helyes, módosított sor/törölt sor/kihagyott seq → verify hibás; párhuzamos írás hézagmentes; ismeretlen `details` kulcs elutasítva; érték sosem kerül naplóba (property-teszt kulcsszavakra: e-mail minta, jelszó, token); fail-closed |
| Kripto + kulcsforgatás | api-dev | T-0050, T-0048 (alapértékekkel indulhat) | GCM roundtrip; AAD-csere (más sor/oszlop/cég) dekódolási hiba; hibás tag; forgatás alatt olvasható/írható; újratitkosítás folytatható; helyreállítási csomagból visszaállítás; kulcs nem kerül logba |
| Incidens + riasztás + támogatási grant | backend-hr | audit, T-0035 | státuszgép-tilalmak; 72 h határidő számítás (időugrással); emlékeztetők; e-mail személyes adat nélkül; grant: lejárat, visszavonás, tiltott hatókör 422, hibás kód 401, egyszeri kód, támogatói művelet naplózott `grant_id`-vel |
| HR-különleges modul | backend-hr | kripto, audit, T-0049 | admin és HR-vezető 403; reveal nélkül maszk; minden olvasás naplóbejegyzés; `payload_enc` a DB-ben nem tartalmaz nyílt szöveget (dump-teszt); riport `<5` elfedés; DSR-export csak két engedéllyel; diagnózis mező nem fogadható (DTO whitelist) |
| Felület (napló, incidens, támogatás, kulcs) | frontend-core | API-k | komponens- és hozzáférési tesztek – később, az API-k után |

Minden feladatra: DoD (kód + egység- és integrációs teszt + migráció + OpenAPI + leírás), tenant- és RLS-teszt, engedély-negatívteszt.
