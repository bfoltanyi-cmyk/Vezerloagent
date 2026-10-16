# Technikai feltárás: NAV Online Számla 3.0 és KSeF (T-0011)

Státusz: vázlat · Szerep: integration-dev · Épít: ADR-0003 (outbox), ADR-0004 (országcsomag).
Jelölések: ⚠ = jogász ellenőrizze; 🔍 = a hivatalos specifikációból a fejlesztés indulásakor ellenőrizendő (innen nem tudtam verifikálni).

## 1. HU – NAV Online Számla 3.0 (REST/XML)

**Környezetek** (🔍 pontos URL a NAV oldalán): teszt `api-test.onlineszamla.nav.gov.hu/invoiceService/v3`, éles `api.onlineszamla.nav.gov.hu/invoiceService/v3`. A teszt külön technikai felhasználót és kulcsokat igényel; a környezet tenantonként konfigurálható (env/felület), alapértelmezés: teszt.

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
- `tokenExchange` válaszát a cserekulccsal kell visszafejteni (AES-128/ECB 🔍); a token a `manageInvoice` kérésbe kerül.
- A kérés tartalmazza a szoftver azonosítóit (`software` blokk: softwareId, név, verzió, fejlesztő); a `softwareId` regisztrációs/azonosítási kötelezettségét ellenőrizni 🔍.

**XML séma**: `invoiceData.xsd`, névtér `http://schemas.nav.gov.hu/OSA/3.0/data`; a számla base64-ben, az `invoiceOperations` elemben megy (opcionális gzip, `compressedContent`). A sémaverziót konfigurációban tartjuk, a NAV-séma fájljait a repóban verziózzuk, beküldés előtt **helyi XSD-validáció** (hibás XML ne is menjen ki).
Leképezés: számlázó modul → `InvoiceData` (fejléc, szállító, vevő, tételek, áfa-összesítő HUF-ban is). Pénzösszeg decimális/egész, soha nem float.

**Módosító és sztornó**: `MODIFY`/`STORNO` művelet `invoiceReference` blokkal (`originalInvoiceNumber`, `modifyWithoutMaster`, `modificationIndex` – növekvő sorszám a láncban). A sorrend számít: módosítót csak a(z eredeti) számla `DONE` állapota után küldjük (a várólista láncot tart per eredeti számla). Az ERP-ben a helyesbítés/sztornó saját új számlaszámot kap és külön outbox-sor.

**Hibakezelés és újraküldés**
- Technikai hiba (hálózat, 5xx, timeout, `OPERATION_FAILED`, rate limit): újrapróbálás ADR-0003 szerint (30 s → 1 óra, 24 óra után „beavatkozás kell").
- Üzleti/validációs hiba (ABORTED, `INVALID_REQUEST`, séma-hiba): **nem** újrapróbáljuk; státusz `REJECTED`, javítás után új beküldés (új `requestId`), a hibaüzenet a felületen.
- Hitelesítési hiba (`INVALID_SECURITY_USER`, lejárt kulcs): a tenant integrációja `SUSPENDED`, riasztás; a sor vár, nem fogy el.
- Timeout `manageInvoice` után: **előbb lekérdezés** (`queryTransactionList`/`queryInvoiceCheck`), csak ha nincs nyoma, akkor új küldés.
- Rate limit: a NAV korlátoz (🔍 számszerű érték); tenantonként és adószámonként tokenbucket + `Retry-After`/hibakód tisztelete. Beküldés köteggel (≤100) csökkenti a hívásszámot.
- Határidő ⚠: a számla adatait kiállításkor közel valós időben kell jelenteni (általában a kiállítástól számított rövid határidő 🔍). Ha a NAV elérhetetlen, a számla kiállítható, a beküldés utólag pótolható – ennek jogi feltételeit jogász erősítse meg.

## 2. PL – KSeF

**Határidők** (privacy_lookup: pl-ksef): 2026-02-01 – 200 M PLN feletti forgalmúak; 2026-04-01 – többi áfaalany; 2027-01-01 – mikrovállalkozások ⚠ (a kisebb vállalkozás besorolása és az átmeneti szankciómentesség jogász által megerősítendő). Belépési feltétel a lengyel piacra.

**API/hitelesítés** 🔍 (KSeF API 2.x): kihívás-válasz (challenge) alapú munkamenet; két mód: (a) **KSeF-token** (az adózó generálja a KSeF-ben, jogosultság-hatókörrel), (b) **minősített tanúsítvány / pecsét** (XAdES aláírás). Eredmény: rövid életű hozzáférési token + frissítő token. A mi alapértelmezésünk: KSeF-token (egyszerűbb dobozos telepítés), tanúsítvány opcionális. Titkok csak titoktárban.

**Számlaformátum**: FA(3) XSD (strukturált XML), a sémát verziózva tároljuk, helyi XSD-validáció küldés előtt. PL-specifikus: NIP, GTU/procedúra-jelölők, MPP (split payment) jelzők, PLN-átszámítás 🔍.

**KSeF-azonosító**: a sikeres beküldés után kapott KSeF-szám (kb. 35 karakter) + `referenceNumber` + UPO (hivatalos visszaigazolás) tárolandó; a számla változatlan, adat a `*_submission` táblában. Visszakereshető/exportálható, a PDF/vizualizáción QR-kóddal szerepel. Megőrzés: a számlával azonos ⚠.

**Offline módok** 🔍⚠: `offline24` (kiállítás KSeF nélkül, QR-kóddal; beküldés legkésőbb a következő munkanapon), KSeF-elérhetetlenség/hiba üzemmódok (külön, hivatalos közlemény szerinti határidők) és saját rendszer hibája esetén. Az adapternek támogatnia kell: `OFFLINE_PENDING` állapot, határidő-számláló, QR-kód (I típus: KSeF-hivatkozás, II típus: tanúsítvány-ellenőrző) generálás, határidő-lejárat riasztás.

**Más**: vevői oldal – bejövő számlák lehívása KSeF-ből (Pro: beszerzés/könyvelés felé) – nincs a v1 körben, PM döntse el.

## 3. CZ
Jelenleg nincs állami valós idejű számla-adatszolgáltatás integráció (Csehországban a kormányzati e-számla/EET-jellegű valós idejű rendszer nincs érvényben; az áfa-nyilvántartási jelentések – kontrolní hlášení – periodikus bevallások, nem számlánkénti küldés). Az adapter-felület miatt a CZ `NoopAdapter` (állapot: `NOT_REQUIRED`). Jogi helyzet időszakos felülvizsgálata a legal/privacy-cz feladata ⚠.

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

**Várólista**: ADR-0003 outbox (`SKIP LOCKED`, exp. backoff, jitter), tenantonkénti párhuzamosság-korlát, kötegelés (HU ≤100), folyamatos státusz-poller (`PROCESSING` sorokra), napi egyeztető job (`queryTransactionList`).

## 5. Biztonság és adatvédelem
(privacy_lookup: hu-nav-szamla, pl-ksef)
- A technikai felhasználó jelszava, aláíró- és cserekulcs, KSeF-token, tanúsítvány/privát kulcs **kizárólag titoktárban** (titkosítva tárolva, tenantonként külön kulccsal, a mentés is titkosított); repóban, naplóban, hibaüzenetben, teszt-fixtúrában soha. Naplózásnál maszkolás (kérés-/válasz-logban az aláírás, token, jelszó-hash kimarad). Tesztekhez kitalált kulcsok.
- Beállítás a felületen (írás-only mező, visszaolvasáskor maszkolt); jogosultság: csak admin szerep; minden változás auditnaplóba.
- ⚠ **Magánszemély vevő (HU)**: a NAV-nak nem megy név és cím (`buildPayload` explicit kihagyja; egység-teszt kötelező). A besorolás (magánszemély / adóalany) a számlán tárolt vevőtípusból jön, bizonytalan esetben a szigorúbb (kihagyó) ág. Jogász ellenőrizze a pontos mezőszabályt (23/2014. NGM r.).
- **Adatszolgáltatási napló**: minden kimenő küldésről: tenant, számla, revízió, időpont (UTC), művelet, `transactionId`/KSeF-ref, státusz, a kiment XML hash-e (és titkosítva az XML maga a megőrzési időre). Nem módosítható (append-only). Megőrzés a számlákéval egyező ⚠ (jogász hagyja jóvá).
- Adatminimalizálás: csak a séma által kért adat megy ki. Harmadik országba nem továbbítunk (NAV/KSeF hatósági címzett, nem adatfeldolgozó).
- Új integrációs tábla: tenant_id + jogosultság; paraméterezett lekérdezések. A privacy_officer nézze át a naplótáblát.

## 6. Javasolt fejlesztői bontás (architektnek)
1. `TaxAuthorityAdapter` interfész + hibaosztályok + állapotgép + `*_submission` / adatszolgáltatási napló migráció (fel/le).
2. Titoktár-integráció és integrációs beállítások felület/API.
3. HU: XML-építő + XSD-validáció + aláírás/token + `manageInvoice`/státusz-poller.
4. HU: módosító/sztornó lánc, `queryTaxpayer`, egyeztető job.
5. PL: KSeF-hitelesítés + FA(3) építő + beküldés + KSeF-szám/UPO tárolás.
6. PL: offline módok, QR-kód, határidő-riasztás.
7. CZ NoopAdapter.
8. Mock NAV/KSeF szerver (integrációs tesztekhez), teszt a NAV teszt-környezet ellen (kézi, titkokkal CI-n kívül).
9. Banki import és más külső API külön feltárásban (nem része ennek).

## 7. Nyitott kérdések és kockázatok
**PM-nek**
- KSeF: a v1-ben van-e bejövő számla lehívás? Mely PL-ügyfélkör a célcsoport (a 2027-es mikrovállalkozás-határidő hatása a piacra lépésre)?
- Ki regisztrálja a NAV/KSeF felé a szoftvert / szerezi a teszt-hozzáféréseket (cég vs. ügyfél)? Tulajdonosi döntés.
- Elfogadható-e, hogy az ügyfél maga hozza létre a technikai felhasználót (útmutató a kézikönyvben)?

**Architektnek**
- Titoktár dobozolt környezetben: saját titkosított tábla + master key env/fájlból, vagy külső vault opció?
- Outbox-lánc sorrendiség módosító számláknál; tenantonkénti rate limit megvalósítása több példány esetén.
- Séma-/API-verzióváltás kezelése (NAV 3.x, KSeF API 2.x → új), sémafájlok frissítési folyamata a telepítőben.

**Jogi ⚠** (legal/privacy-hu/privacy-pl): jelentési határidők és utólagos pótlás; magánszemély vevő mezőszabály; megőrzés (napló, UPO); KSeF szankciómentes időszak és offline-határidők; mikrovállalkozás-besorolás.

**Kockázatok**: spec-eltérés (a 🔍 pontok); NAV/KSeF üzemzavar → várólista telítődés; titok szivárgás naplóból; teszt-környezet eltér az élestől; órák eltérése (timestamp) az aláírás miatt → NTP-ellenőrzés az installerben.
