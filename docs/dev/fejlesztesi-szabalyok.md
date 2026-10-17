# Fejlesztési szabályok és Definition of Done

| | |
|---|---|
| Feladat | T-0012 |
| Tulajdonos | Tech lead (`tech-lead`) |
| Hatály | Minden kód a `product/` alatt, T-0004 utáni minden fejlesztői feladat |
| Alap | Biztonsági alapszabályzat: `docs/security/policy.md` (T-0003). **Az irányadó; ütközés esetén az a döntő.** Itt csak hivatkozunk rá, nem ismételjük. |
| Kapcsolódó | `docs/dev/architecture.md`; ADR-ek (`docs/dev/adr/`): 0001 moduláris monolit, 0002 tenant-izoláció (`company_id` + RLS), 0003 NAV-outbox, 0004 országcsomag, 0005 adatosztályozás + `PersonDataProvider` *(státusz: javasolt)*, 0006 megőrzési motor *(javasolt)*, 0007 hash-láncolt napló *(javasolt)*, 0008 HR-különleges adat titkosítása *(javasolt, kulcskezelés CISO-jóváhagyásra vár)* |

> A „javasolt" státuszú ADR-ek szabályai addig kötelezőek, amíg a tulajdonos/CISO el nem veti őket; változásuk esetén ezt a dokumentumot is frissíteni kell.

---

## 1. Kódkonvenciók

### 1.1 Általános
- **A kód, a kódkommentek, a commitok és a PR-leírások angolul készülnek.** A dokumentáció magyar.
- TypeScript `strict: true` (`noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`). `any` tilos; indokolt kivétel `// eslint-disable-next-line` + magyarázó komment. `@ts-ignore` tilos (`@ts-expect-error` indoklással megengedett).
- ESLint + Prettier kötelező, a CI-ban hiba, ha elbukik. Formázási vita nincs: a Prettier dönt.
- Elnevezés: fájl `kebab-case` (`invoice-line.entity.ts`), osztály/típus `PascalCase`, változó/függvény `camelCase`, konstans `UPPER_SNAKE_CASE`, DB tábla/oszlop `snake_case`, többes számú táblanév, enum érték `UPPER_SNAKE_CASE`.
- Szuffixumok: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.entity.ts`, `*.dto.ts`, `*.guard.ts`, `*.spec.ts` (unit), `*.int-spec.ts` (integráció), `*.e2e-spec.ts`.
- Függvény ≤ ~40 sor, ciklomatikus komplexitás ≤ 10; a komment a „miért"-et írja, nem a „mit".
- Hibák: típusos domain-kivételek, a HTTP-leképezés egy központi filterben. A felhasználó nem lát stack trace-t (policy 6.).

### 1.2 Pénz, idő, azonosító
- **Pénzösszeg egész minor unitban (fillér/grosz/haléř) vagy decimálisban (`numeric` + decimal könyvtár), soha `number` lebegőpontként.** Minden összeg mellett pénznem-kód (ISO 4217).
- Kerekítés és áfa-számítás csak a közös, országcsomagos szolgáltatásban (`CountryPack`, `src/shared/country/`, ADR 0004), modulonként nem újraírva.
- Időpont DB-ben és API-ban UTC (`timestamptz`, ISO 8601), megjelenítés a felhasználó helyi idejében. Dátum (pl. teljesítés) külön `date` típus.
- Azonosító: UUID; üzleti sorszám (számlaszám) külön, generált mező.

### 1.3 NestJS és modulhatárok (moduláris monolit, ADR 0001)
- Egy NestJS alkalmazás, egy image, `APP_ROLE=api|worker`. Háttérsor és outbox PostgreSQL-ben (`SKIP LOCKED`), külön broker/Redis nincs. ORM: TypeORM (entitásokhoz); a migráció kézzel írt SQL (4. pont).
- Struktúra: `product/backend/src/modules/<modul>/` (`<modul>.module.ts`, `api/`, `application/`, `domain/`, `infra/`, `privacy/`, `index.ts`). **Modulonként külön DB-séma.** Közös kód: `src/shared/`.
- **Modul csak a másik modul `index.ts`-ében exportált `PublicService`-ét vagy domain eseményét használhatja.** Más modul entitását, repository-ját, táblát közvetlenül importálni/lekérdezni tilos (nincs cross-module JOIN, nincs idegen kulcs modulhatáron át, csak azonosító-hivatkozás).
- A határt az ESLint `import/no-restricted-paths` (vagy `eslint-plugin-boundaries`) szabály kényszeríti ki a CI-ban (T-0013); ciklikus modulfüggés tilos.
- Rétegek: controller csak DTO-t fogad/ad és szolgáltatást hív; üzleti logika a service/domain rétegben; DB-elérés csak `infra/` repositoryban.
- **Alapból tiltott végpont:** minden controllerre guard (hitelesítés + szerepkör + erőforrás-tulajdon).
- **Tenant (ADR 0002):** a `company_id` a hitelesített `AuthContext.companyId`-ből jön, soha nem a kérés törzséből/paramétereiből. Minden repository-lekérdezés erre szűr; DB-szinten RLS is véd (4. pont), ezért minden tranzakció elején kötelező a `SET LOCAL app.company_id`.
- **Naplózás (ADR 0007):** audit-bejegyzés csak `AuditService.record()`-on át (közvetlen INSERT tilos), a `details` séma szerint (csak azonosító, enum, szám, mezőnév – érték soha), ugyanabban a tranzakcióban (fail-closed).
- **Különleges adat (ADR 0008):** `Sensitive<T>` burkoló, titkosítás csak a `KeyProvider`-en át; nyílt szöveg nem kerül naplóba, hibaüzenetbe, gyorsítótárba, OpenAPI-példába.
- DTO: `class-validator`, `whitelist: true`, `forbidNonWhitelisted: true`. Minden végpont OpenAPI-dekorált (`@nestjs/swagger`); a specifikáció a CI-ban generálódik és ellenőrzött.
- Konfiguráció csak környezeti változóból, induláskor sémával validálva (hiányzó/érvénytelen érték = induláskori hiba). Kézi szerverbeállítás nincs.
- **Kimenő hívás** (NAV, KSeF, SMTP) csak adapteren át, időkorláttal, újrapróbálkozással, idempotensen, az outboxon át (ADR 0003). Csak engedélyezőlistás (allowlist) célra (SSRF-védelem); **a TLS-ellenőrzés kikapcsolása tilos** (policy 6.). Új kimenő cél jóváhagyáshoz kötött.

### 1.4 React (`product/frontend/`)
- Csak függvénykomponens és hookok; TypeScript strict; komponens `PascalCase.tsx`, hook `useXxx`.
- Közös design system használata; saját stílus-egyedi komponens csak indokkal.
- Minden szöveg i18n-kulccsal (hu/pl/cs), betűrendes kulcsok; szám, pénz, dátum a locale-nak megfelelő formázóval. Szövegek nincsenek beégetve.
- Szerverállapot külön réteg (pl. TanStack Query), nem kézzel szinkronizált globális state. Pénzösszeget a kliens nem számol újra a szerver értékétől eltérően.
- Hozzáférhetőség: billentyűzetes használat, label minden mezőn.
- **`dangerouslySetInnerHTML` alapból tilos** (policy 6.); kivétel csak sanitizált tartalommal (jóváhagyott sanitizer), `appsec` előzetes jóváhagyásával, indoklással a kódban.
- A frontend jogosultság-elrejtése csak UX; a védelem a szerveren van. Különleges adat a felületen alapból maszkolt (ADR 0008).

---

## 2. Verziókezelés és kódellenőrzés

### 2.1 Branch és commit
- Védett `main`; közvetlen push, force-push és történetátírás tilos (policy 8.1).
- Branch: `<típus>/T-<id>-<rövid-leírás>`, pl. `feat/T-0042-invoice-storno`. Típus: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- Commit: Conventional Commits angolul, feladatazonosítóval: `feat(invoicing): add storno document (T-0042)`. Egy commit egy logikai változás. Breaking change: `!` + `BREAKING CHANGE:` lábléc.
- Commitba és PR-be titok, személyes adat nem kerülhet (policy 4.1). Pre-commit: gitleaks, lint, formázás.

### 2.2 Pull request
- **Méret:** cél ≤ 400 módosított sor (generált fájl, lockfile, migráció-snapshot nélkül); 800 felett szét kell bontani. Egy PR egy feladat.
- A PR-leírás tartalma: mit és miért, teszt módja, migráció (fel/le), érintett DoD-pontok, új személyesadat-osztályozás (3.4, 5.), új függőség indoklása.
- Szerző a saját PR-jét nem hagyhatja jóvá; merge csak zöld CI-kapukkal (policy 8.1).

### 2.3 Ellenőrzési folyamat
1. A szerző lefuttatja a helyi ellenőrzéseket és kitölti a DoD-t (5. pont).
2. **`code-reviewer`**: helyesség, modulhatár, konvenciók, tesztminőség, migráció, teljesítmény. A kifogásokat a szerző pontról pontra megoldja.
3. **`appsec`** második jóváhagyóként a policy 8.2 szerinti esetekben (jogosultság, kripto, külső integráció, import/fájl, nyers SQL, napló, mentés/migráció, telepítő, személyes adat, Docker/CI, új függőség). A `privacy-officer` személyes adat új kezelésénél, a `supply-chain` új függőségnél hagy jóvá. **Különleges adatnál (GDPR 9.) a `privacy-officer` ÉS a `ciso` is jóváhagy** (policy 7.2).
4. A tech lead dönt a vitás konvenciókérdésekben és a nehéz hibák ügyében.
- **Biztonsági javításhoz regressziós teszt kell, amely a javítás nélkül elbukna** (a DoD-ban is szerepel).

---

## 3. Tesztelés

### 3.1 Szintek
| Szint | Mit | Eszköz | Elvárás |
|---|---|---|---|
| Unit | domain-logika, számítás (áfa, kerekítés), validáció, mapper | Jest | Gyors, I/O nélkül; minden elágazás és határérték |
| Integráció | service + valódi PostgreSQL (konténer), repository, migrációk, guardok, RLS | Jest + Testcontainers | Minden végpont: jogosultsági negatív teszt, tenant-izolációs teszt, hibaág |
| E2E | kulcsfolyamat API-n/UI-n át (számla kiállítás, készletmozgás, NAV outbox mock) | Supertest / Playwright | Minden PRD-elfogadási kritériumhoz (AC) tartozó folyamat |
| Frontend | komponens- és hook-teszt | Testing Library | Szerepkör szerinti megjelenés, i18n, hibaállapot |
| Szerződés | `PersonDataProvider` modulonként (ADR 0005) | Jest | Teszt-személy minden adata kereshető/exportálható/törölhető |

### 3.2 Lefedettség (CI-kapu, a szint alá esés = build hiba)
- Új/módosított kód: **≥ 80% sor- és ≥ 70% ág-lefedettség**.
- Pénz-, adó-, jogosultság-, tenant-, migráció-, titok- és kriptokezelő kód: **≥ 90%**.
- Modulonként a teljes lefedettség nem csökkenhet. A lefedettség nem pótolja a tesztminőséget: assert nélküli teszt nem számít.
- Instabil (flaky) teszt azonnal javítandó vagy karanténba kerül feladattal; kikapcsolva nem maradhat.

### 3.3 Kötelező biztonsági tesztek
- Jogosultsági negatív teszt szerepkörönként (AC-19), napló-titokteszt (AC-8), kimenő hálózat (AC-26), bizonylat-immutabilitás (SZ-2, AC-4); teljes lista: policy 9.2 K6.
- **Tenant/RLS:** integrációs teszt, hogy `SET LOCAL app.company_id` nélkül a lekérdezés nem ad vissza sort, és másik cég `company_id`-jével sem látszik adat (ADR 0002).
- **Regressziós teszt minden biztonsági javításhoz.**

### 3.4 Tesztadat és személyes adat (GDPR 25. cikk, beépített adatvédelem)
- **Csak kitalált vagy álnevesített/anonimizált tesztadat.** Éles ügyféladat fejlesztői, teszt- és CI-környezetbe, fixture-be, snapshotba, MI-promptba nem kerülhet, hibareprodukcióhoz sem (policy 7.2).
- Generált adat: fix seed-del reprodukálható factory-k (`product/backend/test/factories/`); egyértelműen fiktív minták (pl. `example.test` e-mail, érvénytelen adószám-formátum jelölése, tartalékolt tesztszám-tartományok).
- Álnevesítésnél a kulcs/leképezés nem kerül a repóba; inkább generálunk, mint álnevesítünk.
- Teszt-DB-t a teszt hozza létre és dobja el; nincs megosztott, tartósan élő teszt-adatbázis valós adattal. Teszt-kulcs/KEK csak generált, eldobható.

---

## 4. Adatbázis-migrációk (PostgreSQL)

- Helye: `product/db/migrations/`, időbélyeges, sorrendben futó, kézzel írt SQL; **mindig fel- és lefelé futtatható pár** (`up` + `down`). A CI mindkét irányt futtatja üres és mintaadatos DB-n.
- Beolvasztott migrációt nem módosítunk; hibát új migrációval javítunk.
- **Visszafelé kompatibilitás (N-1 → N):** a frissítésnek az előző kiadású adatról hibátlanul kell futnia (AC-25). Szabály: expand → migrate → contract; oszlop/tábla törlése, átnevezése, típusszűkítése csak legalább egy kiadással azután, hogy a kód már nem használja. Új oszlop `NULL`-képes vagy alapértékes.
- Lock-kockázat: nagy táblán `CREATE INDEX CONCURRENTLY`, `NOT VALID` constraint + külön `VALIDATE`, kötegelt adatmódosítás. Egy migráció egy tranzakcióban, kivéve ahol a művelet ezt tiltja (jelöljük).
- **Tenant és RLS (ADR 0002):** minden üzleti tábla `company_id uuid NOT NULL` (indexelt; Start/Pro-ban is, egy céggel), RLS-szabállyal `company_id = current_setting('app.company_id')::uuid`. Az `erp_app` DB-szerepkör **nem tulajdonosa** a tábláknak (különben az RLS nem érvényes rá). `created_at`/`updated_at` UTC, paraméterezett lekérdezések. Idegen kulcs modulhatáron át tilos (1.3).
- Pénzoszlop: `bigint` minor unit vagy `numeric(p,s)` + pénznem; soha `float`/`real`/`money`.
- Kiállított számla- és készletbizonylat adatbázis-szinten is védett a módosítástól/törléstől (policy 6.; trigger vagy jogosultság + teszt). Kivétel kizárólag a megőrzési motor `platform.anonymize_record()` függvénye (ADR 0006).
- Napló (`platform.audit_log`): `erp_app`-nak nincs UPDATE/DELETE (ADR 0007).
- Alkalmazás DB-felhasználója nem superuser; a migrációt külön felhasználó futtatja (policy 6.).
- **Személyes adatot tartalmazó új oszlop:** `COMMENT ON COLUMN … IS 'pii:<kategória>'` és a modul `privacy/classification.ts`-ének frissítése ugyanabban a PR-ben (ADR 0005). Osztályozás nélkül a CI-kapu hibát ad (T-0013).
- Migráció adatot (seed) nem tartalmaz valós személyes adatot és titkot. Frissítés előtt automatikus mentés készül, hibánál visszaállítható; ezt a telepítő/frissítő kezeli, a migráció nem függhet kézi lépéstől.

---

## 5. Definition of Done (ellenőrzőlista)

A feladat csak akkor zárható (`complete_task`), ha **minden** pont teljesül vagy indokoltan N/A.

**Kód és teszt**
- [ ] TypeScript strict, lint és formázás hibátlan; nincs `any`/`@ts-ignore` indoklás nélkül
- [ ] Modulhatár betartva (csak `PublicService`/esemény), ciklikus függés nincs
- [ ] Egység- és integrációs teszt írva; e2e, ha új felhasználói folyamat; **minden teszt zöld**
- [ ] Lefedettség a 3.2 küszöb felett
- [ ] Jogosultsági guard + negatív teszt + tenant-izolációs teszt minden új végponton
- [ ] Integrációs teszt: `SET LOCAL app.company_id` nélkül nincs sor (új tábla/repository esetén)
- [ ] Biztonsági javításhoz regressziós teszt, amely a javítás nélkül elbukik
- [ ] Bemenet szerveroldalon validált; minden lekérdezés paraméterezett
- [ ] Pénz egész/decimális, idő UTC, nincs beégetett szöveg a UI-ban (i18n hu/pl/cs)

**Adatbázis**
- [ ] Migráció fel + le, mindkét irány CI-ban zöld, N-1 → N kompatibilis
- [ ] `company_id uuid NOT NULL` + RLS + index; `erp_app` nem táblatulajdonos; lock-kockázat átgondolva

**Biztonság** (részletek: `docs/security/policy.md`)
- [ ] CI-kapuk zöldek: SAST, SCA, titokszkennelés, licenc, image-szkennelés
- [ ] **Nincs titok a repóban**, tesztben, naplóban, commitban vagy PR-ben (policy 4.1)
- [ ] Függőség (policy 5.2): lockfile commitolva, telepítés `npm ci`-vel és `--ignore-scripts`-tel, új csomag csak a 7 napos várakozási idő után, Docker image digesttel rögzítve; indokolt, licenc rendben, `supply-chain` jóváhagyta
- [ ] Biztonságos alapértelmezés: nincs új kimenő kapcsolat/jogosultság/telemetria jóváhagyás nélkül; kimenő hívás allowlisttel, TLS-ellenőrzés bekapcsolva (policy 6.)
- [ ] Naplózás `AuditService.record()`-on át, értékek nélkül (ADR 0007)
- [ ] Új modul/külső interfész esetén fenyegetésmodell megvan (policy 6.)
- [ ] `code-reviewer` jóváhagyás + `appsec` jóváhagyás, ahol a policy 8.2 előírja; nyitott kritikus/magas találat nincs

**Adatvédelem** (GDPR 5. és 25. cikk; ADR 0005, 0006, 0008)
- [ ] Minden új/módosított személyes adatmező a modul `privacy/classification.ts`-ében osztályozott: `purpose`, `legalBases` (6. cikk), `retentionCategory` (országprofilonként, ADR 0006), `sensitivity` (`pii`|`special`), `art9Condition` különleges adatnál (policy 7.1); osztályozás nélküli új személyes oszlop = CI-hiba (T-0013); `privacy-officer` jóváhagyta
- [ ] Új személyes adatot kezelő modulhoz `PersonDataProvider` (`search`, `export`, `rectify`, `setRestricted`, `erase`, `retentionCandidates`) + szerződésteszt
- [ ] **Különleges adat (GDPR 9.):** `privacy-officer` ÉS `ciso` jóváhagyás (policy 7.2); DPIA-feltételek ellenőrizve (különleges adat, jelenlét/monitoring → DPIA-jelölt, `privacy-officer` dönt); mezőszintű titkosítás a `KeyProvider`-en át, maszkolás, olvasás-naplózás (ADR 0008)
- [ ] Nem kötelező személyes mező nem kötelező, alapértéke üres (adattakarékosság)
- [ ] Személyes adat nem kerül naplóba/hibaüzenetbe (csak azonosító); tesztadat álnevesített/kitalált
- [ ] Törlés/anonimizálás, export és korlátozás az érintetti jogokhoz működik; megőrzési időn belül zárolás, jogi tartás tiszteletben tartva (ADR 0006)

**Dokumentáció**
- [ ] OpenAPI frissítve és generálva
- [ ] Érintett dokumentum frissítve (architektúra/ADR, felhasználói/telepítési útmutató forrása, kiadási jegyzet-bejegyzés)
- [ ] A feladat lezárásában rövid leírás: mi változott, érintett fájlok, migráció, kockázatok, kapcsolódó új feladatok

---

## 6. Folyamat röviden
`feladat → branch → kód + teszt + migráció → PR (≤ 400 sor) → CI zöld → code-reviewer → (appsec / privacy / supply-chain / ciso) → merge → DoD lezárás`.
Elakadásnál (hiányzó döntés, bemenet): `block_task`, pontos megnevezéssel. Nehéz hibát a tech lead visz.

## 7. Változtatás
Ez a dokumentum a policy-nek alárendelt. Eltérés a konvenciótól a tech lead írásos jóváhagyásával; biztonsági szabálytól csak a policy 10. pontja szerinti CISO-kivétellel.
