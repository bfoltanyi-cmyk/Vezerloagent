# Technikai feltárás: NAV Online Számla 3.0 és KSeF (T-0011)

Státusz: vázlat (appsec javítások beépítve) · Szerep: integration-dev · Épít: ADR-0003 (outbox), ADR-0004 (országcsomag).
Jelölések: ⚠ = jogász ellenőrizze; 🔍 = a hivatalos specifikációból a fejlesztés indulásakor ellenőrizendő (innen nem tudtam verifikálni).

## 1. HU – NAV Online Számla 3.0 (REST/XML)

**Környezetek** (🔍 pontos URL a NAV oldalán): teszt `api-test.onlineszamla.nav.gov.hu/invoiceService/v3`, éles `api.onlineszamla.nav.gov.hu/invoiceService/v3`. A teszt külön technikai felhasználót és kulcsokat igényel; a környezet tenantonként konfigurálható, de csak előre definiált azonosító (`test`|`prod`) lehet (lásd §5.2). Alapértelmezés: teszt.

**Műveletek**
| Művelet | Cél |
|---|---|
| `tokenExchange` | Egyszer használatos, rövid életű (kb. 5 perc) token a beküldéshez; a válasz titkosított |
| `manageInvoice` | Számlák beküldése (CREATE / MODIFY / STORNO), köteg max. 100 számla 🔍; válasz: `transactionId` |
| `manageAnnulment` | Technikai érvénytelenítés (hibás adatszolgáltatás visszavonása; NAV-oldali jóváhagyás kell) |
| `queryTransactionStatus` | Tranzakció állapota, számlánként: RECEIVED, PROCESSING, SAVED, DONE, ABORTED + validációs üzenetek (WARN/ERROR) |
| `queryTransactionList` | Adott időszak tranzakciói (egyeztetés, hiányzó `transactionId` helyreállítása) |
| `queryInvoiceCheck`, `queryInvoiceData`, `queryInvoiceDigest`, `queryInvoiceChainDigest` | Számla létezése / adata / kivonata / módosítási lánc; idempotencia-ellenőrzés és egyeztetés |
| `queryTaxpayer` | Adószám-érvényesség és adóalany adatai (vevő/partner ellenőrzés) |

**Hitelesítés és aláírás** (🔍 részletek)
- Technikai felhasználó (login), jelszava SHA-512 hash-ként, adószám (első 8 jegy), **aláírókulcs** (signKey) és **cserekulcs** (exchangeKey), mind a NAV felületén generálva.
- Minden kérés: `requestId` (egyedi, max. 30 karakter), `timestamp` (UTC), `requestSignature` = SHA3-512(requestId + timestamp `yyyyMMddHHmmss` + signKey); `manageInvoice`-nál az aláírásba a számlaműveletek hash-e is bekerül.
- `tokenExchange` válaszát a cserekulccsal kell visszafejteni (AES-128/ECB 🔍, lásd §5.7); a token a `manageInvoice` kérésbe kerül.
- A kérés tartalmazza a szoftver azonosítóit (`software` blokk); a `softwareId` regisztrációs kötelezettségét ellenőrizni 🔍.

**XML séma**: `invoiceData.xsd`, névtér `http://schemas.nav.gov.hu/OSA/3.0/data`; a számla base64-ben, az `invoiceOperations` elemben megy (opcionális gzip, `compressedContent`). A sémaverziót konfigurációban tartjuk, a NAV-séma fájljait a repóban verziózzuk, beküldés előtt **helyi XSD-validáció** (hibás XML ne is menjen ki; a validátor is DTD/külső entitás nélkül fut, §5.1).
Leképezés: számlázó modul → `InvoiceData` (fejléc, szállító, vevő, tételek, áfa-összesítő HUF-ban is). Pénzösszeg decimális/egész, soha nem float.

**Módosító és sztornó**: `MODIFY`/`STORNO` művelet `invoiceReference` blokkal (`originalInvoiceNumber`, `modifyWithoutMaster`, `modificationIndex` – növekvő sorszám a láncban). Módosítót csak az eredeti számla `DONE` állapota után küldjük (a várólista láncot tart per eredeti számla). Az ERP-ben a helyesbítés/sztornó saját új számlaszámot kap és külön outbox-sor.

**Hibakezelés és újraküldés**
- Technikai hiba (hálózat, 5xx, timeout, `OPERATION_FAILED`, rate limit): újrapróbálás ADR-0003 szerint (30 s → 1 óra, 24 óra után „beavatkozás kell").
- Üzleti/validációs hiba (ABORTED, `INVALID_REQUEST`, séma-hiba): **nem** újrapróbáljuk; státusz `REJECTED`, javítás után új beküldés (új `requestId`), a hibaüzenet a felületen (escape-elve, §5.4).
- Hitelesítési hiba (`INVALID_SECURITY_USER`, lejárt kulcs): a tenant integrációja `SUSPENDED`, riasztás; a sor vár, nem fogy el.
- Timeout `manageInvoice` után: **előbb lekérdezés** (`queryTransactionList`/`queryInvoiceCheck`), csak ha nincs nyoma, akkor új küldés.
- Rate limit: a NAV korlátoz (🔍 számszerű érték); tenantonként és adószámonként tokenbucket + `Retry-After`/hibakód tisztelete. Köteg (≤100) csökkenti a hívásszámot.
- Határidő ⚠: a számla adatait kiállításkor közel valós időben kell jelenteni (rövid határidő 🔍). Ha a NAV elérhetetlen, a számla kiállítható, a beküldés utólag pótolható – jogi feltételeit jogász erősítse meg.

## 2. PL – KSeF

**Határidők** (privacy_lookup: pl-ksef): 2026-02-01 – 200 M PLN feletti forgalmúak; 2026-04-01 – többi áfaalany; 2027-01-01 – mikrovállalkozások ⚠ (besorolás és átmeneti szankciómentesség jogász által megerősítendő). Belépési feltétel a lengyel piacra.

**API/hitelesítés** 🔍 (KSeF API 2.x): kihívás-válasz (challenge) alapú munkamenet; (a) **KSeF-token** (az adózó generálja, jogosultság-hatókörrel), (b) **minősített tanúsítvány / pecsét** (XAdES). Eredmény: rövid életű hozzáférési token + frissítő token. Alapértelmezés: KSeF-token (egyszerűbb dobozos telepítés), tanúsítvány opcionális. Titkok csak titoktárban.

**Számlaformátum**: FA(3) XSD (strukturált XML), verziózott séma, helyi XSD-validáció küldés előtt. PL-specifikus: NIP, GTU/procedúra-jelölők, MPP (split payment), PLN-átszámítás 🔍.

**KSeF-azonosító**: sikeres beküldés után KSeF-szám (kb. 35 karakter) + `referenceNumber` + UPO tárolandó a `*_submission` táblában; a számla változatlan. Visszakereshető/exportálható, a PDF-en QR-kóddal. Megőrzés a számlával azonos ⚠.

**Offline módok** 🔍⚠: `offline24` (kiállítás KSeF nélkül, QR-kóddal; beküldés legkésőbb a következő munkanapon), KSeF-elérhetetlenség/hiba üzemmódok (hivatalos közlemény szerinti határidők), saját rendszer hibája. Az adapter támogatja: `OFFLINE_PENDING` állapot, határidő-számláló, QR-kód (I típus: KSeF-hivatkozás, II típus: tanúsítvány-ellenőrző), lejárat-riasztás. A QR-tartalom szerveroldalon épül, szabad szöveg nélkül, kizárólag validált mezőkből (§5.6).

**Más**: bejövő számlák lehívása KSeF-ből – nincs a v1 körben, PM döntse el.

## 3. CZ
Jelenleg nincs állami valós idejű számla-adatszolgáltatás integráció (a kontrolní hlášení periodikus bevallás, nem számlánkénti küldés). A CZ `NoopAdapter` (állapot: `NOT_REQUIRED`). A jogi helyzet időszakos felülvizsgálata a legal/privacy-cz feladata ⚠.

## 4. Közös absztrakció

Illeszkedik az ADR-0003 `EInvoiceConnector`-hoz; javasolt névvel `TaxAuthorityAdapter`:

```ts
interface TaxAuthorityAdapter {
  readonly country: 'HU' | 'PL' | 'CZ';
  /** Build + locally validate the authority payload; no network. */
  buildPayload(invoice: InvoiceSnapshot): Promise<BuiltPayload>; // xml, hash, warnings
  /** Submit; must be idempotent per (tenantId, invoiceId, revision). */
  submit(ctx: TenantAuthContext, payload: BuiltPayload): Promise<SubmitResult>; // externalRef
  /** Poll processing result of a previous submit. */
  getStatus(ctx: TenantAuthContext, externalRef: string): Promise<AuthorityStatus>;
  /** Idempotency probe before retrying after an unknown outcome. */
  findExisting(ctx: TenantAuthContext, invoiceNumber: string): Promise<ExistingRecord | null>;
  /** Verify credentials without sending invoice data. */
  healthCheck(ctx: TenantAuthContext): Promise<HealthResult>;
}
```
Hibaosztályok: `TransientError` (újra), `ValidationError` (nem újra), `AuthError` (felfüggesztés), `RateLimited` (várakozás).

**Állapotgép** (`*_submission`): `PENDING → SENDING → SENT(externalRef) → PROCESSING → ACCEPTED | ACCEPTED_WITH_WARNINGS | REJECTED`; mellékágak: `RETRY_WAIT`, `NEEDS_ATTENTION` (24 h után / auth hiba), `OFFLINE_PENDING` (PL), `NOT_REQUIRED` (CZ). `ACCEPTED`/`REJECTED` végállapot; `REJECTED`-ből csak új revízió indít új beküldést. Átmenetek csak a worker által, naplózva.

**Idempotencia**: egyedi kulcs `(tenant_id, invoice_id, revision, operation)`; `requestId` a beküldés előtt perzisztálva; ismeretlen kimenetelű küldés után `findExisting`. Módosító láncban sorrendtartás per eredeti számla.

**Várólista**: ADR-0003 outbox (`SKIP LOCKED`, exp. backoff, jitter), tenantonkénti párhuzamosság-korlát, kötegelés (HU ≤100), státusz-poller (`PROCESSING` sorokra), napi egyeztető job (`queryTransactionList`).

## 5. Biztonság és adatvédelem
(privacy_lookup: hu-nav-szamla, pl-ksef)

**5.0 Titkok és adatvédelem**
- A technikai felhasználó jelszava, aláíró- és cserekulcs, KSeF-token, tanúsítvány/privát kulcs **kizárólag titoktárban**; repóban, naplóban, hibaüzenetben, fixtúrában soha.
- Beállítás a felületen írás-only; jogosultság: csak admin; minden változás auditnaplóba.
- ⚠ **Magánszemély vevő (HU)**: a NAV-nak nem megy név és cím (`buildPayload` explicit kihagyja; egység-teszt kötelező). A besorolás a számlán tárolt vevőtípusból jön, bizonytalan esetben a szigorúbb (kihagyó) ág. Jogász ellenőrizze a mezőszabályt (23/2014. NGM r.).
- **Adatszolgáltatási napló**: minden kimenő küldésről: tenant, számla, revízió, időpont (UTC), művelet, `transactionId`/KSeF-ref, státusz, a kiment XML hash-e (és titkosítva az XML maga a megőrzési időre). Megőrzés a számlákéval egyező ⚠ (jogász hagyja jóvá).
- Adatminimalizálás: csak a séma által kért adat megy ki. Harmadik országba nem továbbítunk (NAV/KSeF hatósági címzett). A privacy_officer nézze át a naplótáblát.

**5.1 XXE / gzip-bomba**
- NAV/KSeF válasz és számla-XML parse-ánál (és az XSD-validátornál is) DTD és külső entitás/külső séma-betöltés tiltva; parser-konfiguráció egy közös helyen, nem szabad más parserrel XML-t feldolgozni.
- Támadás: manipulált partnernév vagy válasz `<!ENTITY SYSTEM "file:///...">` fájlt olvas / SSRF-et indít.
- `compressedContent` / gzip kicsomagolásnál kimeneti méretkorlát és tömörítési arány-határ; túllépés → `ValidationError`, a tartalom nem kerül feldolgozásra.
- Teszt: XXE- és gzip-bomba fixtúra, amely elutasításra kerül.

**5.2 SSRF / TLS / környezetváltás**
- A környezet csak előre definiált azonosító (`test`|`prod`); szabad URL nem adható meg. Az URL-t az adapter a kódban lévő térképből oldja fel; host-allowlist (a HTTP kliens más hostra nem csatlakozik, átirányítást nem követ).
- TLS-ellenőrzés (tanúsítvány, hostname) kötelező, kikapcsoló beállítás nincs.
- Éles (`prod`) módra váltás csak adminnak, megerősítéssel (pl. szöveges visszaigazolás), auditnaplóval; váltáskor az eddigi tokenek érvénytelenítve.

**5.3 Titoktár**
- Tenantonkénti kulcs származtatása: master key-ből HKDF-fel (info = tenant_id + cél), vagy envelope encryption (tenantonkénti DEK, a master KEK-kel védve). Titkosítás: AES-256-GCM, egyedi nonce, a tenant_id mint AAD.
- A master key env/fájlból vagy külső vaultból (architekt dönt, §7); a repóban soha. **Rotáció**: master key (KEK) rotáció a DEK-ek újratitkosításával, állásidő nélkül (kulcsverzió-mező); a NAV/KSeF titkok (jelszó, signKey, exchangeKey, token) rotációja a felületen, régi érték azonnali törlésével; a rotációk auditnaplóba kerülnek.
- A titoktábla **nem része az adatexportnak** (érintetti export, tenant-export). A felület és az API soha nem ad vissza titkot, csak állapotot (`configured`, `valid`, `expires`, `lastRotatedAt`).

**5.4 Napló és felület**
- Maszkolandó mindenhol (napló, audit, hibajelentés): `requestSignature`, token, `Authorization`, jelszó(-hash), a teljes XML-body és a NAV nyers hibaüzenete. Naplóban csak hash, `requestId`, státusz, hibakód.
- A hatósági hibaüzenetek a felületen csak escape-elve, hosszkorláttal (pl. 500 karakter) jelennek meg, HTML nem renderelődik (stored XSD/XSS ellen); a nyers üzenet külön, csak admin által, szintén escape-elve és maszkolva érhető el.

**5.5 Naplótábla, tenant-izoláció**
- Az append-only DB-szinten kikényszerített: az alkalmazás DB-szerepköréről UPDATE/DELETE megvonva, plusz trigger, ami tiltja a módosítást; sorok hash-láncba fűzve (`prev_hash`, `row_hash`), ellenőrző job.
- `tenant_id` minden táblán (`*_submission`, napló, titoktábla) + RLS (vagy kötelező szűrő a repository-ban). **Keresztmandátum-teszt** a `*_submission` és a naplótáblára, a worker lekérdezéseire is (a worker tenant-kontextust állít be a sor feldolgozásakor).

**5.6 Bemenet**
- `queryTaxpayer`: adószám-validáció (formátum + ellenőrzőösszeg; HU 8 jegy/NIP 10 jegy ellenőrzőösszeggel) hívás előtt; tenantonkénti rate limit, hogy ne legyen adóalany-kiderítő eszköz.
- QR-tartalom szerveroldalon épül, validált mezőkből, szabad szöveg nélkül.

**5.7 Kripto**
- AES-128/ECB **csak** a NAV `tokenExchange` válaszának visszafejtéséhez, az adapterbe zárt kivételként (kommentben indokolva, máshol tiltva, lint-szabály/teszt). Saját adatra (titoktár, XML-archívum) AES-256-GCM.
- Csak szabványos, karbantartott könyvtár (Node `crypto`), saját kripto nincs.
- `requestId` egyediség és `timestamp` friss (pl. ±5 perc) ellenőrzés és ismétlés-védelem; tesztelve (ismételt requestId elutasítva).

**5.8 Mock és fixtúrák**
- Csak kitalált kulcsok; CI secret-scan (pl. gitleaks) kötelező.
- Negatív tesztek: titok (jelszó, kulcs, token, aláírás) nincs a logban, a hibaüzenetben és az exportban.

## 6. Javasolt fejlesztői bontás (architektnek)
1. `TaxAuthorityAdapter` interfész + hibaosztályok + állapotgép + `*_submission` / adatszolgáltatási napló migráció (fel/le), append-only trigger, hash-lánc, RLS, keresztmandátum-teszt (§5.5).
2. Titoktár (HKDF/envelope, AES-256-GCM, rotáció, export-kizárás) + integrációs beállítások felület/API, csak-állapot válasz, prod-váltás megerősítéssel (§5.2–5.3).
3. HU: XML-építő + biztonságos parser/XSD-validáció (XXE/gzip, §5.1) + aláírás/token (ECB-kivétel, §5.7) + `manageInvoice`/státusz-poller; host-allowlist HTTP kliens.
4. HU: módosító/sztornó lánc, `queryTaxpayer` (validáció + rate limit, §5.6), egyeztető job.
5. PL: KSeF-hitelesítés + FA(3) építő + beküldés + KSeF-szám/UPO tárolás.
6. PL: offline módok, QR-kód (szerveroldali, §5.6), határidő-riasztás.
7. CZ NoopAdapter.
8. Mock NAV/KSeF szerver, fixtúrák (kitalált kulcsok), secret-scan, negatív log/export tesztek (§5.8); kézi teszt a NAV teszt-környezet ellen titkokkal CI-n kívül.
9. Naplómaszkolás közös komponense + UI hibaüzenet-megjelenítés (escape, hosszkorlát, §5.4).
10. Banki import és más külső API külön feltárásban (nem része ennek).

## 7. Nyitott kérdések és kockázatok
**PM-nek**
- KSeF: a v1-ben van-e bejövő számla lehívás? Mely PL-ügyfélkör a célcsoport (2027-es mikrovállalkozás-határidő hatása)?
- Ki regisztrálja a szoftvert / szerzi a teszt-hozzáféréseket (cég vs. ügyfél)? Tulajdonosi döntés.
- Elfogadható-e, hogy az ügyfél maga hozza létre a technikai felhasználót (útmutató a kézikönyvben)?

**Architektnek**
- Titoktár dobozolt környezetben: saját titkosított tábla + master key env/fájlból, vagy külső vault opció? Master key rotáció folyamata a telepítőben.
- Outbox-lánc sorrendiség módosító számláknál; tenantonkénti rate limit több példány esetén.
- Séma-/API-verzióváltás kezelése, sémafájlok frissítése a telepítőben.
- RLS vs. repository-szintű kötelező szűrő döntés.

**Jogi ⚠** (legal/privacy-hu/privacy-pl): jelentési határidők és utólagos pótlás; magánszemély vevő mezőszabály; megőrzés (napló, UPO); KSeF szankciómentes időszak és offline-határidők; mikrovállalkozás-besorolás.

**Kockázatok**: spec-eltérés (🔍 pontok); NAV/KSeF üzemzavar → várólista telítődés; titok szivárgás naplóból; XXE/gzip-bomba hatósági válaszban vagy partneradatban; teszt-környezet eltér az élestől; órák eltérése (timestamp) → NTP-ellenőrzés az installerben.
