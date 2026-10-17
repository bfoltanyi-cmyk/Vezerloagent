# Biztonsági alapszabályzat – fejlesztés

| | |
|---|---|
| Feladat | T-0003 |
| Tulajdonos | CISO (`ciso`) |
| Verzió | 1.0 – 2026-10-13 |
| Hatály | Minden kód, konfiguráció, telepítő, dokumentáció és kiadás a `product/` alatt; minden agent és szerep, aki ezekhez hozzányúl |
| Kapcsolódó | PRD (`docs/product/prd.md`, főleg 3.6, NF-4, AC-8, AC-19–27), adatvédelmi tudásbázis (`docs/security/adatvedelem/README.md`), DoD (T-0012), CI biztonsági kapuk (T-0013), EU-s adatvédelmi követelmények (T-0006), támogatói hozzáférés (T-0014) |
| Felülvizsgálat | Félévente, valamint minden jelentős incidens vagy jogszabályváltozás után |

> A szabályzat kötelező. A „kell / tilos" szabálytól eltérni csak a 10. pont szerinti írásos kivétellel lehet. A ⚠ jelölésű jogi pontokat kiadás előtt jogásznak ellenőriznie kell.

---

## 1. Cél és alapelvek

Dobozos, az ügyfél szerverére telepített ERP-t adunk el, amely számlát, készletet, később bért és HR-adatot kezel, és állami rendszerekhez (NAV, KSeF) kapcsolódik. Egy hibánk minden ügyfélnél egyszerre jelentkezik, és a javítást az ügyfélnek kell telepítenie. Ezért a hibát a kiadás előtt kell megfognunk.

Alapelvek:
1. **Beépített biztonság.** A biztonsági követelmény a funkció része, nem utólagos javítás. A biztonsági cél az OWASP ASVS 4.0 L2 (PRD NF-4).
2. **Biztonságos alapértelmezés.** Telepítés után a legszűkebb jogosultság érvényes, telemetria nincs, a NAV teszt módban indul, TLS van, alapértelmezett jelszó nincs.
3. **Legkisebb jogosultság.** Ez vonatkozik a felhasználói szerepkörökre, a szolgáltatásfiókokra, a konténerekre és az agentekre is.
4. **Mélységi védelem.** Egyetlen kontroll kiesése se vezessen adatszivárgáshoz.
5. **Elszámoltathatóság.** Minden biztonsági döntés írásos és visszakereshető (feladat, PR vagy `docs/security/`).
6. **Adattakarékosság.** Csak azt a személyes adatot kezeljük, amelyhez dokumentált cél és jogalap tartozik (GDPR 5. és 25. cikk).

## 2. Szerepek és felelősség

| Szerep | Felelősség |
|---|---|
| CISO (`ciso`) | Szabályzat, kockázatelfogadás, kivételek, **kiadási biztonsági jóváhagyás és vétó** |
| AppSec (`appsec`) | Biztonsági kódátnézés, fenyegetésmodellezés, SAST-szabályok, biztonsági tesztesetek |
| Ellátási lánc (`supply-chain`) | Függőségek, licencek, SBOM, image-ek és build-lánc |
| Adatvédelmi tisztviselő (`privacy-officer`), országfelelősök (`privacy-hu/pl/cz`) | Személyes adatok, jogalap, megőrzés, DPIA, érintetti jogok |
| Hozzáférés-kezelő (`access-manager`) | Repó-, CI- és titoktár-jogosultságok, negyedéves felülvizsgálat |
| Incidenskezelő (`incident-responder`) | Sérülékenység- és incidenskezelés, ügyfélértesítés előkészítése |
| Pentest-tervező (`pentest-planner`) | Fő verziók előtti behatolásteszt és DAST |
| Tech lead, kódellenőrző (`tech-lead`, `code-reviewer`) | A DoD betartatása, kódátnézés |
| DevOps (`devops`) | CI biztonsági kapuk, build és aláírás, titkok a CI-ben |
| Kiadáskezelő (`release-manager`) | A kiadási csomag összeállítása, a jóváhagyási folyamat indítása |
| Minden fejlesztő | A szabályzat betartása, a gyanús esemény azonnali jelzése |

## 3. Súlyossági szintek és javítási határidők

A besorolás alapja a CVSS v3.1/v4 pontszám, amelyet a környezetünkhöz igazítunk. Az AppSec felülsorolhat: ha egy hiba személyes adatot, számlaadatot vagy NAV-kulcsot érint, legalább egy szinttel feljebb kerül.

| Szint | Példa | Nyitott lehet kiadáskor? | Határidő kiadott verzióban |
|---|---|---|---|
| **Kritikus** (CVSS ≥ 9,0, vagy aktívan kihasznált, pl. CISA KEV) | hitelesítés megkerülése, távoli kódfuttatás, titokszivárgás | **Soha** | Javítókiadás 72 órán belül, ha aktívan kihasználják; egyébként 7 napon belül |
| **Magas** (7,0–8,9) | jogosultság-emelés, SQL-injekció hitelesítés után, IDOR személyes adatra | Nem; kivételt csak a CISO adhat (10. pont) | 30 nap |
| **Közepes** (4,0–6,9) | hiányzó biztonsági fejléc, információszivárgás hibaüzenetben | Igen, dokumentált javítási dátummal | 90 nap vagy a következő kisverzió |
| **Alacsony** (< 4,0) | kozmetikai hardening | Igen | Backlog, félévente átnézzük |

Ha egy függőségben lévő sérülékenységet bizonyíthatóan nem lehet elérni a kódunkból, az lezárható. Ehhez kell az AppSec indoklása és egy VEX-bejegyzés az SBOM mellé.

## 4. Titokkezelés

**Titok** minden, amivel hozzáférés szerezhető vagy adat visszafejthető: jelszó, API-kulcs, token, privát kulcs, tanúsítvány-kulcs, NAV technikai felhasználó, aláíró- és cserekulcs, KSeF-token, adatbázis-jelszó, titkosítási mesterkulcs, SMTP-jelszó, licencaláíró kulcs.

### 4.1 Tiltások
- **Tilos titkot írni** a repóba (kódba, tesztbe, fixture-be, `docker-compose.yml`-be, migrációba), dokumentumba, feladatleírásba, feladat-összefoglalóba, PR-leírásba, commitüzenetbe, naplóba, hibaüzenetbe, képernyőképre, és tilos LLM-promptba vagy külső MI-szolgáltatónak adni.
- Tilos valódi titkot példaértékként használni. A `.env.example` csak egyértelmű helyőrzőt tartalmazhat (pl. `NAV_SIGNING_KEY=<set-at-install>`).
- **Tilos a gyári közös titok.** Nem lehet minden telepítésben azonos alapértelmezett jelszó, JWT-kulcs vagy titkosítási kulcs.
- Titkot URL-ben (query paraméterben) átadni tilos.

### 4.2 Kötelező gyakorlat
| Környezet | Hol tárolódik a titok |
|---|---|
| Helyi fejlesztés | Gitignore-olt `.env.local`, csak fejlesztői vagy NAV-teszt kulcsok. Éles kulcs fejlesztői gépre nem kerülhet. |
| CI | A CI titoktára, környezetenként külön, a legszűkebb hatókörrel. Fork PR-ből nem érhető el. |
| Kiadás aláírása | A CI titoktára vagy egy KMS. Hozzáférés: devops és release-manager, kétszemélyes jóváhagyással. |
| Ügyfélnél (termék) | A telepítő **telepítésenként véletlen** kulcsokat generál (CSPRNG, legalább 256 bit), és ezeket Docker secretbe vagy jogosultsággal védett env-fájlba teszi (`0600`). |
| Alkalmazásban tárolt ügyféltitok (NAV-, KSeF-, SMTP-kulcs) | Borítékos titkosítás (AES-256-GCM) az adatbázisban. A mesterkulcs a secretből jön, és nem kerül az adatbázisba. A felületen maszkolva jelenik meg, nem naplózzuk, és nem kerül exportba vagy a mentés titkosítatlan részébe (PRD NAV-7, AC-8). |

- A naplózás központi redaktort használ. A titok- és személyesadat-mezőket (`password`, `token`, `secret`, `key`, `authorization`, NAV/KSeF kulcsmezők) a logger maszkolja, és ezt automatikus teszt ellenőrzi.
- Titokszkennelés (pl. gitleaks) fut pre-commit hookként és a CI-ban minden PR-en, a teljes történeten is. Ha talál valamit, a build elbukik.
- Kulcsrotáció: a CI- és aláíró kulcsokat évente cseréljük, és azonnal, ha valaki kilép, jogosultsága változik, vagy gyanú merül fel. A terméknek támogatnia kell a mesterkulcs és a NAV-kulcsok cseréjét leállás és adatvesztés nélkül.

### 4.3 Kiszivárgott titok
1. A titkot **azonnal visszavonjuk és kicseréljük**. A git-történet átírása nem elég, mert a titkot kompromittáltnak kell tekinteni.
2. Az esetet biztonsági incidensként jelentjük (`incident-responder`, CISO), és még aznap feladat készül róla.
3. Kivizsgáljuk, történt-e jogosulatlan használat (naplók), és dokumentáljuk a tanulságot.

## 5. Függőségek és ellátási lánc

### 5.1 Új függőség felvétele
Az új futásidejű függőséget a PR-ben indokolni kell, és a `supply-chain` szerep vagy a tech lead hagyja jóvá. Feltételek:
- aktívan karbantartott (az elmúlt 12 hónapban volt kiadása, több karbantartója van vagy egyértelmű gazdája),
- nincs ismert, javítatlan magas vagy kritikus sérülékenysége,
- a licence engedélyezett (5.3),
- nem helyettesíthető ésszerű méretű saját kóddal vagy már meglévő függőséggel,
- a csomag neve ellenőrzött (typosquatting), a forrásrepó és a kiadó összetartozik.

### 5.2 Kötelező gyakorlat
- **Lockfile kötelező** (`package-lock.json`), és commitolni kell. A CI csak `npm ci`-t használ. Ha a lockfile kézzel módosul, azt külön átnézzük.
- Az életciklus-szkripteket a CI alapból letiltja (`--ignore-scripts`). Kivételt csak listázott csomag kaphat.
- **Várakozási idő:** frissen (7 napon belül) megjelent verziót nem veszünk fel, kivéve biztonsági javításnál. Ez véd a kompromittált kiadások ellen.
- Az automatikus frissítési PR-ek (Renovate vagy Dependabot) hetente jönnek, a biztonsági frissítések azonnal. Ugyanúgy át kell menniük a kódellenőrzésen és a CI-n.
- **SCA-szkennelés** (pl. `npm audit`, OSV-Scanner) minden PR-en és naponta a fő ágon. Magas vagy kritikus találatnál a build elbukik.
- **Konténer:** minimális alap-image (distroless vagy slim), **digest szerint rögzítve**. Nem rootként fut, csak olvasható fájlrendszerrel, ahol lehet, és nem futtatunk felesleges szolgáltatást. Az image-szkennelés (pl. Trivy) a CI része.
- **SBOM:** minden kiadáshoz CycloneDX formátumú SBOM készül (alkalmazás és image), és a kiadási csomag része. Az ügyfél és a NIS2-alany ügyfelek szállítói kérdőívei is erre épülnek.
- **Integritás:** a kiadott image-eket és csomagokat aláírjuk (pl. cosign), és SHA-256 ellenőrzőösszeget, valamint build-eredetigazolást (provenance, cél: SLSA L2) publikálunk. A telepítő és a frissítő ellenőrzi az aláírást.
- A build reprodukálható és izolált CI-ban fut. Fejlesztői gépről kiadás nem készülhet.

### 5.3 Licencek
Dobozos szoftvert terjesztünk, ezért a licenc jogi kockázat.
- **Engedélyezett:** MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD, Unlicense, CC0, Zlib.
- **Csak jóváhagyással** (supply-chain és legal): LGPL, MPL-2.0, EPL, CC-BY.
- **Tilos** a terméket alkotó kódban: GPL, AGPL, SSPL, BUSL, Commons Clause, valamint licenc nélküli csomag. Az image-ben lévő operációsrendszer-csomagokat és a PostgreSQL-t (PostgreSQL License) a supply-chain külön listán kezeli.
- A licencellenőrzés a CI része. Tiltott licencnél a build elbukik. A harmadik féltől származó licencek listája (`THIRD-PARTY-NOTICES`) a kiadás része.

## 6. Biztonságos fejlesztés (kódolási minimum)

A részletes ellenőrzőlistát a T-0012 DoD tartalmazza. Ez a minimum NestJS + PostgreSQL + React környezetben:

| Terület | Szabály |
|---|---|
| Jogosultság | Minden végpont alapból tiltott. Csak explicit guarddal (szerepkör plusz erőforrás-tulajdon) nyílik meg. Az objektumszintű ellenőrzés (IDOR ellen) kötelező. Minden szerepkörhöz negatív teszt kell (PRD AC-19). |
| Hitelesítés | Argon2id hash, próbálkozás-korlátozás, biztonságos munkamenet (`HttpOnly`, `Secure`, `SameSite`), munkamenet-lejárat, TOTP (PRD P-2). Saját kriptográfia tilos. |
| Bemenet | Szerveroldali validáció minden bemenetre (DTO + `class-validator`, whitelist, ismeretlen mezők elutasítása). Fájlfeltöltésnél típus- és méretkorlát, és a fájl nem kerülhet webről elérhető útvonalra. |
| Adatbázis | Csak paraméterezett lekérdezés vagy ORM. Ha nyers SQL kell, azt az AppSec nézi át. Az alkalmazás DB-felhasználója nem superuser, a migrációs felhasználó külön. |
| Kimenet | React alapértelmezett escape-elés. A `dangerouslySetInnerHTML` tilos, kivéve sanitizálva, AppSec-jóváhagyással. A PDF- és sablongenerálásban nincs szerveroldali sablon-injekció. |
| Webes védelem | CSRF-védelem, CSP, HSTS, `X-Content-Type-Options` és társai (helmet). A CORS alapból zárt. |
| Kimenő kapcsolatok | Csak a NAV, a KSeF, a beállított SMTP és a kikapcsolható frissítés-ellenőrzés felé (PRD AC-26). Felhasználó által megadott URL-re csak allowlisttel lehet kapcsolódni (SSRF ellen). TLS-tanúsítvány-ellenőrzés kikapcsolása tilos. |
| Kriptográfia | TLS 1.2+, AES-256-GCM, Argon2id, Ed25519 vagy ECDSA P-256 aláírás. Elavult algoritmus (MD5, SHA-1 aláírásra, DES, ECB) tilos. A NAV által előírt hash-ek kivételt jelentenek, de csak ott. |
| Hibakezelés | A felhasználó nem lát stack trace-t, SQL-t vagy belső útvonalat. A részlet csak a szervernaplóba kerül, redaktálva. |
| Naplózás | Biztonsági esemény- és auditnapló, amely csak hozzáfűzhető (PRD P-3, P-11). A naplóban nincs titok, és a személyes adat csak a szükséges mértékben szerepel (7. pont). |
| Bizonylatintegritás | Kiállított számla és készletbizonylat nem módosítható, és nem törölhető sem a felületről, sem API-n, sem adminként (PRD SZ-2, AC-4). Ezt adatbázis-szintű kontroll is védi. |
| Fenyegetésmodell | Új modulhoz, új külső interfészhez (NAV, KSeF, webshop, banki kapcsolat), hitelesítési változáshoz vagy fájlfeldolgozáshoz STRIDE-alapú fenyegetésmodell kell a `docs/security/threat-models/` alá, még a megvalósítás előtt. |
| MI-asszisztált kód | Az agent által írt kódra ugyanazok a szabályok vonatkoznak. Ügyféladat, titok és éles napló nem kerülhet MI-szolgáltatóhoz. |

## 7. Adatkezelés (GDPR) a fejlesztésben

Helyi telepítésnél az ügyfél az adatkezelő. Mi a terméket szállítjuk, és főszabályként nem látunk adatot. A terméknek viszont lehetővé kell tennie, hogy az ügyfél megfeleljen a GDPR-nak és a helyi szabályoknak (HU, PL, CZ). Ha támogatás közben hozzáférünk adathoz, vagy üzemeltetünk, adatfeldolgozók vagyunk (GDPR 28. cikk).

### 7.1 Új vagy módosított személyes adat
Minden új személyesadat-mezőhöz, -táblához vagy -exporthoz a PR-ben meg kell adni:
- **cél** és **jogalap** (GDPR 6. cikk; az ERP-ben jellemzően szerződés, jogi kötelezettség vagy jogos érdek),
- **adatkategória**, és hogy **különleges adat**-e (GDPR 9–10. cikk),
- **megőrzési idő** országprofilonként (HU 8 év számlára, Sztv. 169. §; PL/CZ: T-0008/T-0009),
- **érintetti jogok** lefedése: megjelenik-e a keresésben, az exportban, a helyesbítésben és a korlátozásban (PRD P-8).

A bejegyzés a termék adatkezelési nyilvántartás-forrásába kerül (PRD P-10). Ha a privacy-officer nem hagyta jóvá, a PR nem olvasztható be.

### 7.2 Kötelező szabályok
- **Adattakarékosság:** nem kötelező személyes mezőt nem teszünk kötelezővé, és az alapértéke üres.
- **Különleges adat** (pl. HR-szelet: betegszabadság, szakszervezeti tagság): mezőszintű titkosítás, külön jogosultság, hozzáférési napló. Csak a privacy-officer és a CISO jóváhagyásával tervezhető.
- **Megőrzés és törlés:** a megőrzési időn belül törlés helyett korlátozás (zárolás), a lejárat után automatikus anonimizálás vagy törlés, adminisztrátori jóváhagyással (PRD P-9, AC-22; GDPR 17. cikk (3) b)).
- **Titkosítás:** TLS minden kapcsolaton, titkosított mentés, és a visszaállítást a kiadási teszt ellenőrzi (GDPR 32. cikk; PRD P-4, AC-23).
- **Napló és hibaüzenet:** személyes adat csak azonosítóként kerülhet a technikai naplóba (pl. partner-ID). Név, adószám, e-mail és cím nem. Az auditnapló kivétel, ott a „ki mit nézett meg" a cél.
- **Teszt- és demóadat:** csak kitalált vagy álnevesített adat lehet. **Éles ügyféladat fejlesztői, teszt- vagy CI-környezetbe nem kerülhet**, hibareprodukcióhoz sem. Ha az ügyfél adatot küld, az anonimizálás nálunk a support felelőssége (PRD P-12).
- **Telemetria nincs.** A frissítés-ellenőrzés kikapcsolható és személyes adatot nem küld (PRD P-6, P-7). Új „hazatelefonáló" funkció csak CISO-jóváhagyással készülhet.
- **Harmadik fél és MI:** külső szolgáltató (MI- és LLM-szolgáltató is) csak az ügyfél kifejezett beállításával, DPA-val és EU-s adatkezeléssel kaphat ügyféladatot (GDPR 44–49. cikk).
- **NAV-adatszolgáltatás:** magánszemély vevő neve és címe nem kerül az XML-be (PRD NAV-5, AC-2). ⚠
- **Támogatói hozzáférés:** alapból nincs. Csak az ügyfél adminisztrátora engedélyezheti, időkorláttal és naplózva (PRD P-14, T-0014).
- **DPIA:** munkavállalói megfigyelést támogató, nagy léptékben különleges adatot kezelő vagy MI-alapú HR-funkció előtt hatásvizsgálat kell, a NAIH/UODO/ÚOOÚ listái alapján (GDPR 35. cikk). Ilyen funkció MI-rendelet szerinti megfelelőségét jogász ellenőrzi. ⚠
- **Sütik:** a termék csak feltétlenül szükséges sütit használ.

## 8. Kódellenőrzés

### 8.1 Mindenre vonatkozik
- A fő ág védett. Közvetlen push nincs, csak PR-en keresztül lehet módosítani, force-push és történetátírás tilos.
- **Négy szem elve:** minden PR-hez kell legalább egy jóváhagyás olyan személytől vagy agenttől, aki nem a szerzője. A szerző a saját PR-jét nem hagyhatja jóvá.
- Beolvasztani csak akkor lehet, ha **minden CI-kapu zöld:** build, tesztek, lint, SAST (pl. Semgrep vagy CodeQL), SCA, titokszkennelés, licencellenőrzés, image-szkennelés (T-0013).
- Kód csak tesztekkel együtt kerülhet be. Biztonsági javításhoz regressziós teszt kell, amely a javítás előtt elbukott volna.
- A commitokat és a PR-eket a feladatazonosítóhoz kötjük (pl. `T-0042`).

### 8.2 Kötelező AppSec-átnézés
Az alábbi esetekben a második jóváhagyó az `appsec` (vagy a CISO):
- hitelesítés, munkamenet, jogosultság, szerepkörök,
- kriptográfia, titokkezelés, licencellenőrzés,
- NAV, KSeF vagy más külső integráció, bármilyen kimenő hálózati kapcsolat,
- fájlfeltöltés, import (CSV/XLSX), PDF- és sablongenerálás, nyers SQL,
- auditnapló, mentés és visszaállítás, frissítés és migráció, telepítő,
- személyes vagy különleges adat új kezelése, export, érintetti funkciók (a privacy-officer is jóváhagyja),
- Dockerfile, compose, CI-konfiguráció, új függőség (a supply-chain is jóváhagyja).

A CODEOWNERS fájl ezeket az útvonalakat az AppSec-hez rendeli (T-0013).

### 8.3 Átnéző-ellenőrzőlista (röviden)
- [ ] Minden új végponton van jogosultság-guard és negatív teszt?
- [ ] Szerveroldalon validált minden bemenet? Paraméterezett minden lekérdezés?
- [ ] Nem került titok vagy személyes adat a kódba, a naplóba vagy a hibaüzenetbe?
- [ ] Új személyes adatnál ki van töltve a 7.1 pont szerinti bejegyzés?
- [ ] Új függőségnél teljesül az 5.1 pont, és rendben van a licenc?
- [ ] Biztonságos marad az alapértelmezés (a funkció nem nyit új kimenő kapcsolatot vagy jogosultságot)?
- [ ] Van regressziós teszt?

## 9. Kiadás előtti biztonsági jóváhagyás (biztonsági kiadási kapu)

### 9.1 Mit jelent
A **biztonsági jóváhagyás** a CISO írásos döntése arról, hogy az adott kiadási jelölt (verzió + build + digest) a dokumentált ellenőrzések alapján elfogadható kockázattal kiadható. Jellemzői:
- **Kötelező minden kiadásnál**: fő verzió, kisverzió, javítókiadás és hotfix esetén is.
- **Szükséges, de nem elégséges:** a biztonsági jóváhagyás után a tulajdonos „release" jóváhagyása is kell. A tulajdonos jóváhagyását biztonsági jóváhagyás nélkül nem kérjük.
- **Vétó:** a CISO bármely kiadást megállíthat, a már folyamatban lévőt is. A vétót csak a feltétel teljesülése oldja fel, vagy a 10. pont szerinti kivétel. A vétót más szerep nem bírálhatja felül. Ha a tulajdonos ennek ellenére kiadást akar, az írásos, névre szóló kockázatelfogadás, és bekerül a kiadási jegyzőkönyvbe.
- **Egy konkrét buildre szól.** Ha a jóváhagyás után bármi változik (kód, függőség, image), a kaput újra le kell futtatni.

### 9.2 Feltételek (kiadási ellenőrzőlista)

| # | Feltétel | Igazolás | Felelős |
|---|---|---|---|
| K1 | Minden CI-biztonsági kapu zöld a kiadási commiton (SAST, SCA, titok, licenc, image) | CI-futás linkje | devops |
| K2 | **Nincs nyitott kritikus sérülékenység.** Magas csak érvényes CISO-kivétellel lehet nyitott. A közepeseknek van javítási dátuma | sérülékenységlista, VEX | appsec |
| K3 | Minden beolvasztott PR-en megvolt a négy szem elve, és a 8.2 szerinti AppSec-átnézés | PR-lista | code-reviewer |
| K4 | Az új vagy változott külső interfészekhez és modulokhoz frissült a fenyegetésmodell | `docs/security/threat-models/` | appsec |
| K5 | Adatvédelem: az új személyes adatok regisztrálva vannak (7.1), a privacy-officer jóváhagyta, szükség esetén kész a DPIA, és frissült a megőrzési profil | privacy-jóváhagyás | privacy-officer |
| K6 | Biztonsági tesztek zöldek: jogosultsági negatív tesztek (AC-19), napló-titokteszt (AC-8), kimenő hálózati teszt (AC-26), mentés–visszaállítás (AC-23), frissítés N-1 → N (AC-25), auditnapló (AC-20) | tesztriport | qa-lead |
| K7 | Fő verziónál, illetve új külső interfész vagy hitelesítési változás esetén DAST vagy behatolásteszt készült, a kritikus és magas találatok javítva vannak | pentest-riport | pentest-planner |
| K8 | Biztonságos alapértelmezés tiszta telepítéssel ellenőrizve: nincs alapértelmezett jelszó, telepítésenként egyedi kulcsok, TLS, telemetria ki, NAV teszt mód | telepítési jegyzőkönyv | acceptance-tester |
| K9 | A kiadási csomag tartalmazza az SBOM-ot (CycloneDX), az aláírt image-eket és csomagokat, az SHA-256 ellenőrzőösszegeket, a provenance-t és a `THIRD-PARTY-NOTICES`-t | kiadási artefaktumok | release-manager, supply-chain |
| K10 | A kiadási jegyzetben van biztonsági szakasz (javított sérülékenységek, szükséges ügyfélteendők, pl. kulcscsere) | kiadási jegyzet | release-manager, tech-writer |
| K11 | A javított, korábban kiadott verziókat érintő sérülékenységekhez megvan az értesítési terv (sérülékenységközlemény) | incidens- vagy közleményterv | incident-responder |
| K12 | A jogi ⚠ pontokat, amelyeket a kiadás érint (pl. NAV-adattartalom), a legal ellenőrizte | legal-feladat | legal |

### 9.3 Folyamat
1. A **release-manager** létrehozza a kiadási jelöltet, és kitölti a jegyzőkönyvet: `docs/security/releases/<verzió>.md` (sablon: A melléklet).
2. A felelősök csatolják az igazolásokat (9.2).
3. A **CISO** átnézi a jegyzőkönyvet, és a következő döntések egyikét hozza:
   - **JÓVÁHAGYVA:** minden feltétel teljesül.
   - **FELTÉTELESEN JÓVÁHAGYVA:** csak közepes vagy alacsony nyitott tétel maradt, felelőssel és határidővel. Kritikus vagy magas tételre ez nem adható.
   - **VÉTÓ:** a feltétel megnevezésével és a feloldás módjával.
4. Jóváhagyás után a release-manager tulajdonosi „release" jóváhagyást kér. A jegyzőkönyvben szerepel a build digestje.
5. A kiadás után 5 munkanapon belül a jegyzőkönyvet lezárjuk, és rögzítjük a publikált artefaktumok ellenőrzőösszegeit.

### 9.4 Sürgősségi javítókiadás (hotfix)
Ha egy kritikus sérülékenységet aktívan kihasználnak, a kapu rövidített: K1, K2 (a javított hiba lezárva), K3, K6-ból az érintett tesztek, valamint K9. A CISO jóváhagyhatja, a tulajdonost tájékoztatjuk. A teljes jegyzőkönyvet 5 munkanapon belül pótolni kell.

## 10. Kivételek és kockázatelfogadás
- Kivételt csak a CISO adhat, írásban, a `docs/security/kivetelek.md` nyilvántartásban. Kötelező tartalma: szabálypont, indok, kockázat, kompenzáló kontroll, felelős, **lejárat (legfeljebb 90 nap)**.
- **Kritikus** sérülékenységre és a 4.1 pont titok-tiltásaira kivétel nem adható.
- Magas súlyosságú kivételről a tulajdonost tájékoztatjuk.
- Lejárt kivétel automatikusan vétót jelent a következő kiadásra.

## 11. Sérülékenység- és incidenskezelés (röviden)
- **Bejelentés:** belső jelzés feladatként az `incident-responder` és a CISO részére, azonnal. Külső bejelentőknek nyilvános sérülékenységbejelentési csatorna és `SECURITY.md` kell (koordinált közzététel). Előkészítése folyamatban van.
- **Ügyfélértesítés:** a dobozos termék sérülékenységéről közleményt adunk ki, javítási útmutatóval. Ha adatfeldolgozóként (támogatás, SaaS) incidens ér minket, az ügyfelet késedelem nélkül értesítjük, mert neki 72 órája van a hatósági (NAIH/UODO/ÚOOÚ) bejelentésre (GDPR 33. cikk). A NIS2-alany ügyfeleknek 24 órás korai figyelmeztetési kötelezettségük van, ezért nekik is gyors információ kell.
- **EU kiberrezilienciáról szóló rendelet (CRA, (EU) 2024/2847)** ⚠: a gyártók bejelentési kötelezettsége (aktívan kihasznált sérülékenység és súlyos incidens: 24 órás korai figyelmeztetés az ENISA egységes platformján) a rendelet szerint 2026. szeptember 11-től alkalmazandó, a többi követelmény 2027. december 11-től. Termékünk digitális elemeket tartalmazó termék, ezért a kötelezettségeket jogász ellenőrzi (külön feladat). Addig is úgy dolgozunk, mintha vonatkozna ránk: SBOM, sérülékenységkezelés, biztonságos alapértelmezés, biztonsági frissítések.
- Kifelé menő minden közlemény vázlatként készül, és „outbound" jóváhagyás kell hozzá.
- A részletes incidenskezelési eljárás külön dokumentum (`docs/security/incidens.md`, incident-responder).

## 12. Hozzáférés a fejlesztési rendszerekhez
- Repóhoz, CI-hez és titoktárhoz csak névre szóló fiókkal, MFA-val, a legszűkebb jogosultsággal lehet hozzáférni. Közös fiók tilos.
- Az agentek csak a szerepükhöz szükséges könyvtárakba írhatnak (kódszerep: `product/` és `docs/`, a többiek: `docs/`).
- Az access-manager negyedévente felülvizsgálja a jogosultságokat. Szerepváltozáskor vagy kilépéskor a jogosultságot még aznap visszavonjuk.

## 13. Megfelelés és ellenőrzés
- A CI-kapuk automatikusan kikényszerítik a 4., 5. és 8. pontot (T-0013).
- A CISO negyedévente mintavételes auditot végez (PR-ek, kivételek, jegyzőkönyvek).
- A szabályzat megsértése biztonsági eseménynek számít. Ilyenkor a kiadás megáll, amíg a hiba nincs kijavítva.

---

## A melléklet – Kiadási biztonsági jegyzőkönyv sablon

Fájl: `docs/security/releases/<verzió>.md`

```markdown
# Kiadási biztonsági jegyzőkönyv – v<X.Y.Z>

| | |
|---|---|
| Kiadás típusa | fő / kis / javító / hotfix |
| Commit | <sha> |
| Image digest(ek) | <sha256:...> |
| Release-manager | |
| Dátum | |

## Ellenőrzések
| # | Feltétel | Eredmény (OK / N/A / NYITOTT) | Igazolás | Megjegyzés |
|---|---|---|---|---|
| K1 | CI-biztonsági kapuk | | | |
| K2 | Nyitott sérülékenységek | | | |
| K3 | Kódellenőrzés | | | |
| K4 | Fenyegetésmodell | | | |
| K5 | Adatvédelem | | | |
| K6 | Biztonsági tesztek | | | |
| K7 | DAST/pentest | | | |
| K8 | Biztonságos alapértelmezés | | | |
| K9 | SBOM, aláírás, ellenőrzőösszeg | | | |
| K10 | Kiadási jegyzet biztonsági szakasz | | | |
| K11 | Sérülékenységközlemény-terv | | | |
| K12 | Jogi ⚠ pontok | | | |

## Nyitott tételek és érvényes kivételek
| Tétel | Súlyosság | Felelős | Határidő | Kivétel-ID |
|---|---|---|---|---|

## CISO döntés
JÓVÁHAGYVA / FELTÉTELESEN JÓVÁHAGYVA / VÉTÓ – indoklás, dátum

## Lezárás (kiadás után)
Publikált artefaktumok és SHA-256 ellenőrzőösszegek:
```

## B melléklet – Kapcsolódó feladatok
| Téma | Feladat / felelős |
|---|---|
| DoD és részletes kódolási ellenőrzőlista | T-0012 (tech-lead) |
| CI-biztonsági kapuk, CODEOWNERS, aláírás, SBOM | T-0013 (devops) |
| Adatvédelmi követelmények, országprofilok | T-0006–T-0009 (privacy) |
| Naplózott támogatói hozzáférés | T-0014 (support-lead) |
| Incidens- és sérülékenységkezelési eljárás, `SECURITY.md` | incident-responder (új feladat) |
| A CRA alkalmazhatósága és kötelezettségei | legal (új feladat) |
