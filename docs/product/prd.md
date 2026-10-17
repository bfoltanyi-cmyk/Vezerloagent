# PRD – „Számla + Készlet Start" (első termékszelet)

| | |
|---|---|
| Feladat | T-0002 |
| Státusz | Vázlat, spec jóváhagyásra vár |
| Alap | `docs/product/market.md` (T-0001), adatvédelmi tudásbázis (`docs/security/adatvedelem/README.md`) |
| Érintett | architect (T-0004), integration-dev (T-0011), privacy-officer / privacy-hu (T-0006, T-0007), pricing-analyst (T-0016), support-lead (T-0014) |

> A ⚠ jelölésű jogi pontokat kiadás előtt jogásznak ellenőriznie kell. Az árak nincsenek rögzítve; a licencmodell javaslat, a számokat a T-0016 adja.

---

## 1. Összefoglaló

Dobozos, Dockerrel saját szerverre (vagy a könyvelő/rendszergazda gépére) telepíthető számlázó- és készletkezelő modul magyar KKV-knak. Egy rendszerben kezeli a számlát, a NAV Online Számla adatszolgáltatást és a raktárt; a számla kiállítása automatikusan mozgatja a készletet.

**Ígéret:** „Egy rendszer a számlához és a raktárhoz, a te szervereden, NAV-kész, fél nap alatt telepítve."

**Miért most / miért mi** (market.md 4. pont): az olcsó SaaS számlázók készlete gyenge, a telepíthető hazai csomagok elavultak, és van egy adatszuverenitásra érzékeny réteg, amely nem akar felhőt.

## 2. Célfelhasználó

### 2.1 Célszegmens
- **Elsődleges:** magyar kisvállalkozás, 3–25 fő, áru- vagy anyagforgalommal: kereskedő, kisebb webshop (egyelőre kézi rendeléskezeléssel), szolgáltató saját raktárral (pl. szerviz, telepítő).
- **Másodlagos:** adatszuverenitásra érzékeny KKV (könyvelőiroda ügyfelei, gyártó kisüzem, egészségügyi/jogi kisiroda), amely számlázni akar, de felhőt nem.
- **Nem cél most:** 1–2 fős mikrovállalkozás készlet nélkül (ott a SaaS számlázó olcsóbb), 50+ fős vállalat (teljes ERP-t keres).

### 2.2 Personák
| Persona | Szerep | Fő feladat | Siker számára |
|---|---|---|---|
| **Kata, irodavezető / számlázó** | napi felhasználó | számlát állít ki, díjbekérőt küld, sztornóz | 1 percen belül kész számla, NAV hiba esetén érthető teendő |
| **Gábor, raktáros** | napi felhasználó | bevételez, kiad, raktárak közt mozgat, leltároz | mindig valós készletszám, riasztás fogyáskor |
| **Éva, tulajdonos/ügyvezető** | döntéshozó, vásárló | forgalom és készletérték áttekintése | egy képernyőn látja a helyzetet, nincs dupla adatrögzítés |
| **Péter, külső rendszergazda / könyvelő** | telepítő, adminisztrátor | telepít, ment, frissít, exportál a könyvelésbe | fél nap alatt fut, frissítés egy parancs, export a könyvelőprogramba |

### 2.3 Fő felhasználói történetek
1. Számlázóként kiállítok egy belföldi számlát, a rendszer beküldi a NAV-nak, és látom a befogadás státuszát.
2. Számlázóként hibás számlát sztornózok vagy módosítok; a sorszám folytonos marad, a készlet visszaáll.
3. Raktárosként szállítói szállítmányt bevételezek, és a készlet és a beszerzési átlagár azonnal frissül.
4. Raktárosként értesítést kapok, ha egy cikk a minimum készlet alá esik.
5. Tulajdonosként megnézem a raktárankénti készletértéket és a havi forgalmat.
6. Könyvelőként havonta exportálom a kimenő számlákat a könyvelőprogramba.
7. Adminisztrátorként telepítem a rendszert Dockerrel, beállítom a NAV technikai felhasználót, felhasználókat és szerepköröket hozok létre, és mentést ütemezek.

## 3. Hatókör és modulok

Prioritás: **M** = kötelező az MVP-hez, **S** = erősen ajánlott (kiadás előtt, ha belefér), **C** = lehetőség.

### 3.1 Törzsadatok (`masterdata`)
| ID | Követelmény | Prio |
|---|---|---|
| TD-1 | Saját cég adatai: név, adószám, közösségi adószám, cím, bankszámlák, logó, áfa-státusz (normál, alanyi adómentes, pénzforgalmi elszámolás). | M |
| TD-2 | Partnertörzs: vevő/szállító, típus (belföldi adóalany, EU-s adóalany, harmadik országbeli, **magánszemély**), adószám (formátum- és opcionálisan NAV-ellenőrzéssel), címek, kapcsolattartó, fizetési határidő. | M |
| TD-3 | Cikktörzs: cikkszám, név, mennyiségi egység, termék/szolgáltatás jelző, áfa-kulcs, nettó eladási ár, VTSZ/SZJ kód, vonalkód (EAN), készletkezelt-e, minimum készlet raktáranként. | M |
| TD-4 | Áfa-kulcsok és áfa-mentességi jogcímek (27/18/5/0 %, AAM, TAM, EU-s, fordított adózás stb.) karbantartható táblában, a NAV-kódokhoz rendelve. | M |
| TD-5 | Deviza kezelése: HUF + EUR/USD számla, árfolyam kézzel vagy MNB-árfolyam letöltéssel. | S (kézi: M) |
| TD-6 | Árlisták (vevőcsoportonként), mennyiségi kedvezmény. | C |
| TD-7 | Törzsadat import CSV/XLSX-ből (partner, cikk, nyitókészlet) – átállás más rendszerről. | M |

### 3.2 Számlázás (`invoicing`)
| ID | Követelmény | Prio |
|---|---|---|
| SZ-1 | Számla kiállítása az Áfa tv. szerinti kötelező adattartalommal ⚠, PDF-ben, magyar (és opcionálisan angol/kétnyelvű) sablonnal. | M |
| SZ-2 | Sorszámkörök (pl. évenként, telephelyenként), **hézagmentes és egyedi** sorszám, tranzakcióban kiosztva; kiállított számla nem törölhető, nem szerkeszthető. | M |
| SZ-3 | Sztornó- és módosító számla az eredeti számlára hivatkozva; a készlethatás automatikus. | M |
| SZ-4 | Díjbekérő (nem számla, nincs NAV-jelentés), számlává alakítás egy kattintással. | M |
| SZ-5 | Előlegszámla és végszámla az előleg beszámításával. | S |
| SZ-6 | Fizetési módok (átutalás, készpénz, bankkártya, utánvét); készpénznél 5 Ft-os kerekítés a jogszabály szerint ⚠. | M |
| SZ-7 | Számla e-mailben küldése PDF-fel, a küldés naplózva (címzett, időpont, eredmény). SMTP-t az ügyfél adja meg. | M |
| SZ-8 | Fizetési státusz kézi rögzítése (fizetve / részben / lejárt), lejárt számlák listája. | M |
| SZ-9 | Bankszámlakivonat-import és automatikus párosítás. | C |
| SZ-10 | Ismétlődő (havi) számla. | C |
| SZ-11 | Elektronikus számla (hitelesített PDF/XML). | C |

### 3.3 NAV Online Számla integráció (`nav-connector`)
Technikai részletek: T-0011.
| ID | Követelmény | Prio |
|---|---|---|
| NAV-1 | Adatszolgáltatás az Online Számla 3.0 interfészen minden belföldi számláról, sztornóról és módosításról (manageInvoice / manageAnnulment). | M |
| NAV-2 | Tranzakció-státusz lekérdezése, a számlán látható állapot: *küldésre vár / beküldve / befogadva / befogadva figyelmeztetéssel / elutasítva*. | M |
| NAV-3 | Tartós sor (outbox): NAV elérhetetlenség vagy hálózati hiba esetén automatikus újrapróbálás exponenciális várakozással; a számla kiállítása nem blokkolódik. | M |
| NAV-4 | Elutasított számla: érthető magyar hibaüzenet és javasolt teendő (pl. technikai érvénytelenítés, módosító számla). | M |
| NAV-5 | **Magánszemély vevőnél a név és a cím nem kerül az XML-be.** | M |
| NAV-6 | Adatszolgáltatási napló: mi ment ki (XML), mikor, milyen válasszal; a naplóban titok (kulcs, jelszó) nem szerepel. | M |
| NAV-7 | Technikai felhasználó, aláíró- és cserekulcs megadása az adminfelületen; tárolás titkosítva, képernyőn maszkolva, soha nem naplózva, nem exportálva. | M |
| NAV-8 | Teszt- és éles NAV-környezet közötti váltás; új telepítés alapból teszt módban indul. | M |
| NAV-9 | Adószám-ellenőrzés (queryTaxpayer) partnerfelvételkor. | S |
| NAV-10 | Bejövő számlák lekérdezése a NAV-ból (queryInvoiceDigest) és bevételezésre ajánlása. | C |

### 3.4 Készletkezelés (`inventory`)
| ID | Követelmény | Prio |
|---|---|---|
| K-1 | Több raktár (legalább korlátlan számú logikai raktár). | M |
| K-2 | Készletmozgás bizonylatokkal: bevételezés, kiadás, raktárközi átvezetés, selejt, leltárkorrekció; minden mozgás saját sorszámú bizonylat, utólag csak ellenbizonylattal javítható. | M |
| K-3 | Számla kiállítása automatikusan kiadási mozgást generál a számlán megadott raktárból; sztornó/jóváíró módosítás visszavételez. | M |
| K-4 | Készletértékelés **gördülő (mozgó) átlagáron**; bevételezéskor beszerzési ár rögzítése. | M |
| K-5 | Negatív készlet kezelése: alapból tiltott, raktáranként engedélyezhető (szolgáltató ügyfeleknek). | M |
| K-6 | Minimum készlet riasztás: lista + értesítés a felületen (és opcionálisan e-mail) a küszöb alá esésekor. | M |
| K-7 | Leltár: leltárív (PDF/CSV), számolt mennyiség rögzítése, eltérés-kimutatás, jóváhagyás után korrekciós bizonylat. | M |
| K-8 | Készletfoglalás díjbekérőre / rendelésre. | S |
| K-9 | Szállítói rendelés (beszerzés) és bevételezés a rendelés alapján. | C |
| K-10 | Sarzs/lejárat és szériaszám követés. | C (1.1-es kiadás jelölt; az adatmodell legyen rá felkészítve) |
| K-11 | Vonalkódolvasó támogatás (billentyűzet-emuláció) a bevételezés/kiadás képernyőn. | S |

### 3.5 Riportok és export (`reports`)
| ID | Követelmény | Prio |
|---|---|---|
| R-1 | Készletérték raktáranként és összesen, adott napra. | M |
| R-2 | Forgalom időszakra: vevőnként, cikkenként, havonta. | M |
| R-3 | Áfa-összesítő (kimenő számlák kulcsonként, teljesítési dátum szerint). | M |
| R-4 | Kintlévőség / lejárt számlák. | M |
| R-5 | Könyvelői export: kimenő számlák CSV és XML formában; legalább egy elterjedt hazai könyvelőprogram importformátuma ⚠ (melyik: T-0016/sales visszajelzés alapján). | M (CSV/XML), S (célprogram) |
| R-6 | Készletmozgás-napló cikkenként (kartoték). | M |
| R-7 | Minden lista CSV/XLSX exportja. | S |

### 3.6 Rendszer, biztonság, adatvédelem (`platform`)
| ID | Követelmény | Prio |
|---|---|---|
| P-1 | Felhasználók és szerepkörök: *Adminisztrátor, Számlázó, Raktáros, Vezető (csak olvasás), Könyvelő (csak olvasás + export)*; egyedi szerepkör jogosultságlistából. Alapértelmezés: legszűkebb jogosultság. | M |
| P-2 | Bejelentkezés: erős jelszószabály, jelszó hash (Argon2/bcrypt), próbálkozás-korlátozás, munkamenet-lejárat; TOTP kétlépcsős azonosítás. | M (TOTP: S) |
| P-3 | Auditnapló: bejelentkezés, jogosultságváltozás, személyes adat megtekintése/módosítása/exportja, bizonylat-kiállítás, beállításváltozás; a napló csak hozzáfűzhető, adminisztrátor is csak olvassa. | M |
| P-4 | Mentés: ütemezett, titkosított adatbázismentés + visszaállítás egy paranccsal; a telepítő figyelmeztet, ha nincs beállított mentés. A visszaállítást a kiadási teszt lefuttatja. | M |
| P-5 | Telepítés: `docker compose` alapú telepítő, első indításkor varázsló (cég, admin, NAV teszt mód); TLS (saját tanúsítvány vagy Let's Encrypt); titkok környezeti változóból/secretből, nem a repóban. | M |
| P-6 | Frissítés: verziózott image, adatbázis-migráció automatikusan, előtte kötelező mentés; frissítési értesítés a felületen (a frissítés-ellenőrzés kikapcsolható, személyes adatot nem küld). | M |
| P-7 | Telemetria: alapból **nincs**; ha később lesz, csak kifejezett bekapcsolással és személyes adat nélkül. | M |
| P-8 | Érintetti kérelem: egy személy (magánszemély partner, kapcsolattartó, felhasználó) adatainak keresése a modulokban, gépileg olvasható export (JSON/CSV), helyesbítés, korlátozás; kérelem-nyilvántartás 1 hónapos határidő-figyeléssel. | M (keresés, export, helyesbítés, korlátozás), S (határidő-figyelés) |
| P-9 | Megőrzési profil: magyar alapérték számlára és számviteli bizonylatra **8 év** (Sztv. 169. §); megőrzési időn belül törlési kérésre **korlátozás** (zárolás), lejárat után automatikus anonimizálás/törlés adminisztrátori jóváhagyással. Az időtartam adatkategóriánként, profilból jön (később PL/CZ profil). | M |
| P-10 | Adatkezelési nyilvántartás-vázlat generálása a használt modulokból (cél, jogalap, adatkör, megőrzés). | S |
| P-11 | Biztonsági eseménynapló és riasztás az adminisztrátornak (pl. sok sikertelen belépés, tömeges export, jogosultság-emelés). | S |
| P-12 | Demó/teszt adatkészlet csak kitalált/álnevesített adatokkal. | M |
| P-13 | Teljes adatexport (minden törzs és bizonylat, nyílt formátum: JSON/CSV + PDF-ek) – rendszerváltáshoz, SaaS változathoz kötelező lesz. | M |
| P-14 | Támogatói hozzáférés: alapból nincs; csak az ügyfél adminisztrátora engedélyezheti, időkorláttal, naplózva (részletek: T-0014). | M |
| P-15 | Felület nyelve: magyar; a szövegek i18n-kulcsokkal, hogy a PL/CZ fordítás kódváltoztatás nélkül hozzáadható legyen. | M |

### 3.7 Személyes adatok a szeletben (összefoglaló a privacy-officer és az architect számára)
| Adatkör | Érintett | Cél | Jogalap | Megőrzés (HU) |
|---|---|---|---|---|
| Magánszemély vevő neve, címe, e-mail | vevő | számlázás | jogi kötelezettség (Áfa tv., Sztv.) | számlán: 8 év; a törzsben a számla nélküli adat: üzleti kapcsolat végéig + ügyfél által beállított idő |
| Céges kapcsolattartó neve, e-mail, telefon | kapcsolattartó | kapcsolattartás | jogos érdek | kapcsolat végéig, ügyfél által beállítható |
| Felhasználó neve, e-mail, bejelentkezési adatok | munkavállaló | hozzáférés-kezelés, biztonság | jogos érdek / szerződés | fiók megszűnése + auditnapló-megőrzés (javaslat: 1 év, privacy-hu döntse el) |
| Auditnapló | felhasználók | biztonság, elszámoltathatóság | jogos érdek | javaslat 1 év ⚠ |
| NAV-napló (XML) | vevő (magánszemélynél név/cím nélkül) | jogi kötelezettség igazolása | jogi kötelezettség | számlával azonos (8 év) |

Az ügyfél az adatkezelő; helyi telepítésnél mi nem látunk adatot. Különleges adat ebben a szeletben nincs. A végleges megőrzési értékeket a privacy-hu (T-0007) hagyja jóvá.

## 4. Nem-funkcionális követelmények
| ID | Követelmény |
|---|---|
| NF-1 | **Teljesítmény:** referencia-gépen (4 vCPU, 8 GB RAM) 100 000 számla és 20 000 cikk mellett listák < 1 s (p95), számla mentése NAV-küldés nélkül < 500 ms (p95), 10 egyidejű felhasználó. |
| NF-2 | **Telepítés:** tiszta Linux gépen Docker megléte esetén a telepítéstől az első tesztszámláig ≤ 30 perc gyakorlott rendszergazdának; ≤ fél nap dokumentáció alapján első alkalommal. |
| NF-3 | **Adatintegritás:** minden bizonylat-kiállítás és készletmozgás egy adatbázis-tranzakcióban; összeg- és áfa-kerekítés egységesen, tesztelt szabály szerint. |
| NF-4 | **Biztonság:** a T-0003 szabályzat és a T-0012 DoD szerint; OWASP ASVS L2 cél; függőség- és titokszkennelés CI-ban (T-0013); SBOM minden kiadáshoz. |
| NF-5 | **Böngésző:** Chrome, Edge, Firefox legutóbbi 2 fő verziója; asztali felbontás (≥ 1366 px). Mobil nézet nem cél. |
| NF-6 | **Akadálymentesség:** billentyűzettel kezelhető számla- és bevételezés-képernyő (gyors adatrögzítés). |
| NF-7 | **Bővíthetőség:** országfüggő logika (adószám, áfa, e-számla csatoló, megőrzési profil) külön modulban/interfész mögött, hogy a PL (KSeF) és a CZ lokalizáció a magot nem érintve készülhessen. |
| NF-8 | **Rendelkezésre állás:** a NAV elérhetetlensége nem akadályozza a számlázást (NAV-3). |

## 5. Elfogadási feltételek (MVP)

Az MVP akkor kész, ha az összes alábbi feltétel automatizált vagy dokumentált kézi teszttel igazolt (QA: T-0012 DoD szerint).

### 5.1 Számlázás és NAV
- **AC-1** Belföldi adóalany vevőnek kiállított számla PDF-je tartalmazza az Áfa tv. szerinti összes kötelező elemet (ellenőrzőlista a tesztben ⚠), és a NAV teszt környezet *befogadva* státusszal visszaigazolja.
- **AC-2** Magánszemély vevőnél a NAV-nak küldött XML-ben nincs vevőnév és cím (automatikus teszt az XML-re), a PDF-en viszont szerepel.
- **AC-3** 1000 párhuzamosan (10 szálon) kiállított számla után a sorszámkör hézagmentes és ismétlésmentes.
- **AC-4** Kiállított számla nem szerkeszthető és nem törölhető sem a felületen, sem az API-n (403/409 válasz, auditnapló-bejegyzés a kísérletről).
- **AC-5** Sztornó és módosító számla hivatkozik az eredetire, NAV-ba beküldésre kerül, és a készlet a sztornózott mennyiséggel visszaáll.
- **AC-6** NAV elérhetetlenség szimulálásakor a számla kiállítható, státusza *küldésre vár*; a kapcsolat helyreállása után emberi beavatkozás nélkül beküldésre kerül, és státusza frissül.
- **AC-7** NAV-elutasításkor a felhasználó magyar hibaüzenetet és javasolt teendőt lát; az eset a NAV-naplóban visszakereshető.
- **AC-8** A NAV-kulcsok sem a naplókban, sem a mentés nem titkosított részében, sem a felületen (maszkolás) nem jelennek meg; automatikus teszt keresi a mintázatukat a naplókimenetben.
- **AC-9** Díjbekérő nem kerül NAV-ba; számlává alakításkor a tételek és a partner átkerülnek, és új számlasorszámot kap.

### 5.2 Készlet
- **AC-10** Számla kiállítása a megadott raktárból a számlázott mennyiséggel csökkenti a készletet; szolgáltatás típusú tétel nem mozgat készletet.
- **AC-11** Ha a raktárban a negatív készlet tiltott, a készletet meghaladó számla nem állítható ki, és a felhasználó látja az elérhető mennyiséget.
- **AC-12** Bevételezés után a gördülő átlagár a referencia-számítással egyezik (táblázatos tesztesetek, kerekítéssel).
- **AC-13** Raktárközi átvezetés után a két raktár összkészlete és összértéke változatlan.
- **AC-14** Minimum készlet alá eső cikk a mozgás után legfeljebb 1 percen belül megjelenik a riasztási listában.
- **AC-15** Leltáreltérés jóváhagyásakor korrekciós bizonylat keletkezik; jóváhagyás előtt a készlet nem változik.

### 5.3 Riport és export
- **AC-16** Az áfa-összesítő egy referencia-adatkészleten kulcsonként egyezik a kézzel számolt értékkel.
- **AC-17** Adott napra visszamenőleges készletérték-riport egyezik a mozgásokból számolt értékkel.
- **AC-18** A könyvelői CSV/XML export egy hónap számláit tartalmazza, a dokumentált sémának megfelel (sémavalidációs teszt).

### 5.4 Platform, biztonság, adatvédelem
- **AC-19** Raktáros szerepkörrel a számlázás és a beállítások nem érhetők el (felület és API szinten is tesztelve); Vezető szerepkör semmit nem módosíthat.
- **AC-20** Az auditnapló rögzíti a P-3-ban felsorolt eseményeket (ki, mikor, mit, honnan), és a napló a felületről/API-ról nem módosítható.
- **AC-21** Érintetti kérelem: egy magánszemély nevére/e-mailjére keresve az összes partner-, számla- és naplórekord megjelenik, JSON/CSV exportja letölthető, az export ténye naplózva.
- **AC-22** Törlési kérés 8 évnél fiatalabb számlával rendelkező magánszemélynél: a rendszer törlés helyett korlátozza az adatot (csak megőrzési szerepkör látja), és rögzíti a korlátozás okát és lejáratát.
- **AC-23** Mentésből egy üres gépen visszaállított rendszer adatai (számlaszám, készlet, napló) megegyeznek az eredetivel; a mentés fájl titkosított.
- **AC-24** Tiszta telepítés a dokumentáció szerint egy, a fejlesztésben részt nem vevő tesztelővel (acceptance-tester) ≤ 30 perc alatt eljut az első NAV-teszt számláig.
- **AC-25** Frissítés N-1 → N verzióra adatvesztés nélkül fut le, előtte automatikus mentés készül.
- **AC-26** Alapállapotban a rendszer kifelé csak a NAV-hoz, a beállított SMTP-hez és (kikapcsolhatóan) a frissítés-ellenőrzéshez kapcsolódik; hálózati teszt igazolja.
- **AC-27** A CI biztonsági kapui (SAST, függőség, titok, SBOM) zöldek; kritikus/magas sérülékenység nem nyitott.

## 6. Nem-célok (első szelet)
- Főkönyv, kettős könyvvitel, áfabevallás (ÁNYK) készítése – a könyvelőprogramba exportálunk.
- Bérszámfejtés és HR – ez különleges adatot hozna (egészségügyi adat, szakszervezeti tagság), külön szelet.
- Gyártás, darabjegyzék, termelésirányítás.
- Lengyel (KSeF) és cseh lokalizáció – a 2. hullámban; az architektúra felkészül rá (NF-7). A KSeF kötelező határidejei (2026–2027) miatt a PL szelet a következő roadmap-elem jelöltje.
- Webshop-csatolók (Shoprenter, WooCommerce, Shopify) – 2. hullám, a piaci rés 5. pontja alapján kiemelt.
- Pénztárgép / online pénztár (NAV online pénztárgép) és POS.
- Bankkapcsolat (PSD2), automatikus banki párosítás (SZ-9 csak C).
- CRM, marketing-hozzájárulás kezelés, hírlevél.
- Mobilalkalmazás és mobilra optimalizált felület.
- Saját üzemeltetésű SaaS változat – később; ha lesz, adatfeldolgozói szerződés (DPA), EU-s tárhely és Data Act szerinti export kell.
- MI-funkciók.

## 7. Licencmodell javaslat

> Javaslat; a számokat és a végleges csomagolást a pricing-analyst (T-0016) és a controller (T-0015) adja, a tulajdonos hagyja jóvá (pricing kapu).

**Modell: örökös (perpetual) licenc + éves frissítési és támogatási díj.**

| Elem | Javaslat |
|---|---|
| Licenc | Egyszeri díj cégenként (1 adószám), örökös használati jog a megvásárolt fő verzióra. |
| Csomagok | **Start**: 1 raktár, 3 egyidejű felhasználó. **Pro**: korlátlan raktár, 10 felhasználó, könyvelőprogram-export, TOTP. Plusz felhasználó csomagban (pl. 5-ösével). |
| Éves frissítés + támogatás | A licencdíj kb. 18–22%-a évente; az első év benne a licencben. Tartalmazza a NAV-séma- és jogszabálykövető frissítéseket, hibajavításokat, e-mailes támogatást. |
| Megújítás nélkül | A szoftver tovább fut, de frissítést nem kap. **Kötelező tájékoztatás a vásárlónak:** NAV-sémaváltozás után frissítés nélkül az adatszolgáltatás leállhat. Lejárt előfizetés utólagos visszaállítása visszamenőleges díjjal. |
| Licencellenőrzés | Aláírt, offline ellenőrizhető licencfájl; **nincs kötelező „hazatelefonálás"** (adatszuverenitás ígéret). |
| Árszint iránya | A belépő (Start) licenc + 1 év ≈ egy közepes SaaS-számlázó 2–3 éves díja (market.md); ellenőrizendő élő árakkal. |
| Kiegészítők (később) | Webshop-csatoló, PL/CZ lokalizáció, telepítési szolgáltatás (partner vagy saját), prémium SLA. |
| Partnercsatorna | Rendszergazdák és könyvelőirodák viszonteladói kedvezménnyel (sales döntés). |

**Miért ez:** illeszkedik a telepíthető versenytársak (Kulcs-Soft, RLB-Soft) megszokott modelljéhez, a saját szerveres ígérethez, és a kötelező NAV-frissítések miatt az éves díj valós értéket ad, ami ismétlődő bevételt biztosít.

**Alternatíva (döntésre):** éves előfizetéses licenc (bérlet) alacsonyabb belépővel – egyszerűbb bevétel-tervezés, de gyengébb megkülönböztetés a SaaS-okkal szemben.

## 8. Sikermutatók (első 6 hónap kiadás után)
- Telepítéstől első éles számláig medián ≤ 1 nap.
- NAV-befogadási arány első beküldésre ≥ 99%.
- Támogatási jegy / ügyfél / hó ≤ 1 (a 3. hónaptól).
- Éves megújítási arány cél: ≥ 80%.
- Konkrét eladási célszámok: a controller (T-0015) fedezetipont-modellje alapján.

## 9. Függőségek és kockázatok
| Kockázat / függőség | Hatás | Kezelés |
|---|---|---|
| NAV-séma vagy jogszabály változik | adatszolgáltatás leáll | `nav-connector` külön modul, gyors javítókiadási csatorna, T-0011 figyeli |
| Jogi pontok (számla kötelező adattartalma, kerekítés, magánszemély adatai) ⚠ | hibás számla, bírság | jogászi átnézés kiadás előtt (legal feladat) |
| Megőrzés vs. törlés | GDPR-sértés vagy Sztv.-sértés | P-9 korlátozás modell, privacy-hu jóváhagyás (T-0007) |
| Dobozos telepítés támogatási terhe | magas support költség | telepítő varázsló, mentés-ellenőrzés, T-0014 támogatási modell |
| Erős olcsó SaaS-ok | lassú eladás | fókusz a készlet + saját szerver üzeneten (T-0005) |
| PL KSeF határidők | lekésett PL-belépés | NF-7 bővíthetőség, PL szelet a roadmap következő eleme |

## 10. Nyitott kérdések (a tulajdonosnak / jóváhagyáskor)
1. Örökös licenc + éves díj (javaslat) vagy éves bérlet?
2. Az SZ-5 előlegszámla és a K-8 készletfoglalás bekerüljön-e az MVP-be (most S)?
3. Melyik könyvelőprogram importformátumát támogassuk elsőként (R-5)?
4. Auditnapló megőrzési ideje (javaslat 1 év) – privacy-hu döntés.

## 11. Roadmap vázlat (tájékoztató, nem része a jóváhagyandó hatókörnek)
| Hullám | Tartalom |
|---|---|
| 1. – MVP | Ez a PRD (HU számlázás + készlet + NAV). |
| 1.1 | Sarzs/szériaszám, szállítói rendelés, bejövő NAV-számlák, banki import. |
| 2. | PL lokalizáció + KSeF; webshop-csatolók (WooCommerce, Shoprenter). |
| 3. | CZ lokalizáció; opcionális SaaS üzemeltetés (DPA, EU-tárhely, Data Act export). |
