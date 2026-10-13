# Adatvédelmi tudásbázis

Utolsó átnézés: 2026-10-13. Ez a fájl a `company/privacy/knowledge.ts` alapján készül (`npm run build:privacy`), kézzel ne szerkeszd.

> Munkasegédlet, nem jogi tanácsadás. A ⚠ jelölésű pontokat kiadás előtt helyi jogásznak ellenőriznie kell.

## Hatóságok

| Joghatóság | Hatóság | Honlap |
|---|---|---|
| Európai Unió | Európai Adatvédelmi Testület (EDPB) | https://www.edpb.europa.eu |
| Magyarország | Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH) | https://naih.hu |
| Lengyelország | Prezes Urzędu Ochrony Danych Osobowych (UODO) | https://uodo.gov.pl |
| Csehország | Úřad pro ochranu osobních údajů (ÚOOÚ) | https://uoou.gov.cz |

## Európai Unió

### Alapelvek

**Az adatkezelés alapelvei**

Jogszerűség, tisztességes eljárás és átláthatóság; célhoz kötöttség; adattakarékosság; pontosság; korlátozott tárolhatóság; integritás és bizalmas jelleg; elszámoltathatóság (az adatkezelőnek bizonyítania kell a megfelelést).

- Forrás: GDPR (EU) 2016/679, 5. cikk
- Teendő nálunk: Minden személyes adatmezőhöz legyen dokumentált cél és jogalap. Csak azt gyűjtsük, ami a funkcióhoz kell. Minden adatkategóriához legyen megőrzési idő.

### Jogalap

**A hat jogalap**

Hozzájárulás; szerződés teljesítése; jogi kötelezettség; létfontosságú érdek; közérdek vagy közhatalom; jogos érdek (érdekmérlegelési teszttel). Hozzájárulásnak önkéntesnek, konkrétnak, tájékozottnak és egyértelműnek kell lennie, és bármikor visszavonható.

- Forrás: GDPR 6. cikk, 7. cikk
- Teendő nálunk: ERP-ben jellemző jogalapok: szerződés (vevő-, szállítóadatok), jogi kötelezettség (számlázás, könyvelés, bérszámfejtés), jogos érdek (kapcsolattartók). Hozzájárulás főleg marketinghez kell. A termék adatkezelési nyilvántartása folyamatonként tárolja a jogalapot.

### Különleges adatok

**Különleges adatok**

Faji vagy etnikai származás, politikai vélemény, vallás, szakszervezeti tagság, genetikai, biometrikus azonosító, egészségügyi adat, szexuális élet kezelése főszabályként tilos, csak a 9. cikk (2) szerinti kivétellel. Büntetőjogi adatokra a 10. cikk vonatkozik.

- Forrás: GDPR 9–10. cikk
- Teendő nálunk: A HR modulban a betegszabadság (egészségügyi adat) és a szakszervezeti tagdíjlevonás (szakszervezeti tagság) különleges adat. Ezek külön jogosultságot, mezőszintű titkosítást és hozzáférési naplót kapnak.

### Érintetti jogok

**Érintetti jogok és határidő**

Tájékoztatás (13–14.), hozzáférés (15.), helyesbítés (16.), törlés (17.), korlátozás (18.), hordozhatóság (19–20.), tiltakozás (21.), automatizált döntés elleni védelem (22.). A kérelmet indokolatlan késedelem nélkül, legfeljebb egy hónapon belül kell teljesíteni; ez szükség esetén két hónappal meghosszabbítható. Főszabály szerint díjmentes.

- Forrás: GDPR 12–22. cikk, 12. cikk (3)
- Teendő nálunk: Kell egy érintetti kérelem funkció: egy személy összes adatának megkeresése a modulokban, gépileg olvasható export (JSON/CSV), helyesbítés, korlátozás, és határidő-figyelés a kérelmekre.

### Megőrzési idők

**Törlési kérelem és kötelező megőrzés ütközése**

A törléshez való jog nem érvényesül, ha az adatkezelés jogi kötelezettség teljesítéséhez szükséges.

- Forrás: GDPR 17. cikk (3) b)
- Teendő nálunk: Számlát és könyvelési bizonylatot nem törölhetünk kérésre a megőrzési idő alatt. Ilyenkor az adatot korlátozzuk (zárolás, csak megőrzési célra elérhető), a határidő lejárta után pedig automatikusan töröljük vagy anonimizáljuk.

### Adatbiztonság

**Beépített és alapértelmezett adatvédelem**

Az adatkezelőnek már a tervezéskor és alapértelmezésként is megfelelő technikai és szervezési intézkedéseket kell alkalmaznia, például álnevesítést és adattakarékosságot.

- Forrás: GDPR 25. cikk
- Teendő nálunk: Alapértelmezésben a legszűkebb jogosultság, a nem kötelező személyes mezők üresek, a riportokban álnevesített nézet, tesztkörnyezetbe csak álnevesített adat kerülhet.

**Az adatkezelés biztonsága**

A kockázattal arányos intézkedések: álnevesítés és titkosítás, bizalmasság, integritás, rendelkezésre állás és ellenálló képesség, helyreállíthatóság incidens után, rendszeres tesztelés és értékelés.

- Forrás: GDPR 32. cikk
- Teendő nálunk: TLS mindenhol, titkosítás tároláskor, szerepköralapú jogosultság, hozzáférési napló, titkosított mentés helyreállítási próbával, rendszeres sérülékenységvizsgálat.

### Adatvédelmi incidens

**Adatvédelmi incidens bejelentése**

Az adatkezelő az incidenst indokolatlan késedelem nélkül, lehetőleg 72 órán belül bejelenti a hatóságnak, kivéve ha valószínűleg nem jár kockázattal. Az adatfeldolgozó késedelem nélkül értesíti az adatkezelőt. Magas kockázatnál az érintetteket is tájékoztatni kell. Minden incidenst nyilvántartásba kell venni.

- Forrás: GDPR 33–34. cikk
- Teendő nálunk: A terméknek tudnia kell biztonsági eseményt jelezni az ügyfél adminisztrátorának, és kell incidensnyilvántartás. Ha mi üzemeltetünk (SaaS), adatfeldolgozóként azonnal értesítjük az ügyfelet.

### Adatkezelő és adatfeldolgozó

**Adatkezelő és adatfeldolgozó**

Az adatfeldolgozóval írásbeli szerződést kell kötni a 28. cikk (3) szerinti kötelező tartalommal (utasítás szerinti kezelés, titoktartás, biztonság, al-adatfeldolgozók, segítségnyújtás, törlés vagy visszaadás, auditálhatóság).

- Forrás: GDPR 28. cikk
- Teendő nálunk: Dobozos, helyben telepített terméknél az ügyfél az adatkezelő, és mi főszabályként nem látunk adatot. Ha üzemeltetünk, vagy a támogatás során hozzáférünk, adatfeldolgozók vagyunk: kell adatfeldolgozási szerződés (DPA) és al-adatfeldolgozói lista, a támogatási hozzáférés pedig csak az ügyfél engedélyével, naplózva történhet.

### Nyilvántartás

**Adatkezelési tevékenységek nyilvántartása**

Az adatkezelő és az adatfeldolgozó nyilvántartást vezet a kezelési tevékenységekről. A 250 főnél kevesebb munkavállalót foglalkoztatókra a mentesség nem vonatkozik, ha az adatkezelés kockázatos, nem alkalmi, vagy különleges adatot érint, ezért a gyakorlatban a legtöbb KKV-nak is kell.

- Forrás: GDPR 30. cikk
- Teendő nálunk: Eladási érv: az ERP a beállított modulokból előre kitöltött adatkezelési nyilvántartást generál az ügyfélnek.

### Hatásvizsgálat és DPO

**Adatvédelmi hatásvizsgálat (DPIA)**

Valószínűsíthetően magas kockázatú adatkezelés előtt hatásvizsgálat kell, például rendszeres és kiterjedt megfigyelésnél vagy nagy léptékű különleges adatkezelésnél. A nemzeti hatóságok listát tesznek közzé a DPIA-köteles adatkezelésekről.

- Forrás: GDPR 35. cikk
- Teendő nálunk: A munkavállalói megfigyelést (például belépés- vagy munkaidő-követést) támogató funkcióhoz DPIA-sablont adunk az ügyfélnek, és a NAIH, UODO, ÚOOÚ listáit is figyelembe vesszük.

**Adatvédelmi tisztviselő (DPO)**

DPO kijelölése kötelező közhatalmi szervnél, illetve ha a fő tevékenység az érintettek nagy léptékű, rendszeres és szisztematikus megfigyelése, vagy különleges adatok nagy léptékű kezelése.

- Forrás: GDPR 37–39. cikk
- Teendő nálunk: A cégben az adatvédelmi tisztviselő agent látja el a DPO-szerepet a fejlesztésben. Az ügyfeleknek a termék kijelölhető DPO-kapcsolattartót biztosít.

### Harmadik országba továbbítás

**Továbbítás az EGT-n kívülre**

Harmadik országba csak megfelelőségi határozat (ilyen például az EU–USA adatvédelmi keret 2023 júliusa óta), általános szerződési feltételek (2021/914 bizottsági határozat), kötelező erejű vállalati szabályok vagy a 49. cikk szerinti kivétel alapján lehet adatot továbbítani.

- Forrás: GDPR 44–49. cikk
- Teendő nálunk: Üzemeltetésnél EU-n belüli tárhely. Az al-adatfeldolgozói listán szerepeljen minden külső szolgáltató, az MI- és LLM-szolgáltatók is. Ügyféladat MI-szolgáltatónak csak kifejezett beállítással és DPA-val mehet.

### Gyermekek

**Gyermek hozzájárulása**

Információs társadalommal összefüggő szolgáltatásnál a 16 év alatti gyermek hozzájárulásához a szülő engedélye kell. A tagállam ezt 13 évig csökkentheti.

- Forrás: GDPR 8. cikk
- Teendő nálunk: B2B ERP-nél ritkán releváns, de a webes regisztrációnál és a marketingnél figyelembe kell venni.

### Hatóság és bírság

**Közigazgatási bírság**

Legfeljebb 10 millió EUR vagy az előző év globális forgalmának 2%-a (például 8., 11., 25–39. cikk megsértése), illetve legfeljebb 20 millió EUR vagy 4% (alapelvek, jogalap, érintetti jogok, továbbítás). Mindkét esetben a magasabb összeg az irányadó.

- Forrás: GDPR 83. cikk
- Teendő nálunk: A kockázatértékelésben és a kiadási kapunál ezzel a súllyal számolunk.

### Marketing és sütik

**Sütik és elektronikus direkt marketing**

A végberendezésen történő tároláshoz és hozzáféréshez (sütik) előzetes hozzájárulás kell, kivéve a szolgáltatáshoz feltétlenül szükséges eseteket. Elektronikus levélben küldött direkt marketinghez előzetes hozzájárulás kell, kivéve a saját meglévő ügyfélnek küldött, hasonló termékre vonatkozó ajánlatot, amelyről leiratkozhat.

- Forrás: 2002/58/EK irányelv 5. cikk (3), 13. cikk
- Teendő nálunk: A termék webes felülete csak feltétlenül szükséges sütit használ. A marketing részleg csak igazolt hozzájárulású listára tervez kampányt.

### Kiberbiztonság (NIS2)

**NIS2 irányelv**

Az alanyok kockázatkezelési intézkedései között szerepel az ellátási lánc biztonsága és a biztonságos fejlesztés. Jelentős incidensnél 24 órán belül korai figyelmeztetés, 72 órán belül bejelentés, egy hónapon belül zárójelentés kell.

- Forrás: (EU) 2022/2555 irányelv, 21. és 23. cikk
- Teendő nálunk: Ügyfeleink NIS2 alanyok lehetnek, ezért tőlünk mint szállítótól elvárják: biztonságos fejlesztési folyamat, sérülékenységkezelés és -közzététel, gyors incidensértesítés, SBOM (szoftverösszetevő-lista).

### Mesterséges intelligencia

**MI-rendelet (AI Act)** ⚠

A foglalkoztatási célú MI-rendszerek (például toborzás, előléptetés, teljesítményértékelés) magas kockázatúnak minősülhetnek, szigorú kockázatkezelési, dokumentációs és emberi felügyeleti követelményekkel. A rendelet kötelezettségei szakaszosan válnak alkalmazandóvá.

- Forrás: (EU) 2024/1689 rendelet, III. melléklet 4. pont
- Teendő nálunk: MI-alapú HR-funkciót csak a CISO és az adatvédelmi tisztviselő jóváhagyásával tervezünk. Az alkalmazási határidőket kiadás előtt ellenőrizni kell.

### Termékkövetelmény (ERP)

**Adatrendelet (Data Act): szolgáltatóváltás**

Az adatfeldolgozási (felhő) szolgáltatások ügyfeleinek joguk van szolgáltatót váltani és adataikat géppel olvasható formában átvinni. A rendelet 2025. szeptember 12-től alkalmazandó.

- Forrás: (EU) 2023/2854 rendelet
- Teendő nálunk: Felhős (SaaS) változatnál teljes adatexport nyílt formátumban, és szerződésben vállalt átállási segítség kell.

**Adatvédelmi alapkövetelmények az ERP-hez**

A GDPR-ból következő technikai minimum egy személyes adatot kezelő üzleti szoftverben.

- Forrás: GDPR 5., 15–21., 25., 30., 32–33. cikk
- Teendő nálunk: 1) Szerepköralapú jogosultság és teljes hozzáférési napló. 2) Érintetti kérelem: keresés, export, helyesbítés, korlátozás. 3) Megőrzési szabályok adatkategóriánként és országonként, automatikus törléssel vagy anonimizálással. 4) Mezőszintű titkosítás a különleges adatokra. 5) Adatkezelési nyilvántartás generálása. 6) Incidensnapló és riasztás. 7) Álnevesített teszt- és demóadat. 8) Teljes adatexport szolgáltatóváltáshoz.

## Magyarország

### Hatóság és bírság

**Infotv. és a NAIH**

A GDPR-t kiegészítő magyar törvény az információs önrendelkezési jogról és az információszabadságról. A felügyeleti hatóság a NAIH, amely panasz és hivatalból indított eljárásban is bírságolhat; incidensbejelentést online fogad.

- Forrás: 2011. évi CXII. törvény (Infotv.)
- Teendő nálunk: Magyar ügyfélnek magyar nyelvű adatkezelési tájékoztató- és DPA-sablon kell. Az incidenskezelési folyamatban a NAIH bejelentőfelülete szerepel.

### Gyermekek

**Korhatár hozzájáruláshoz**

Magyarországon a GDPR 8. cikk szerinti korhatár 16 év.

- Forrás: GDPR 8. cikk, magyar szabályozás
- Teendő nálunk: A regisztrációnál 16 év alatt szülői hozzájárulás kell.

### Munkahelyi adatkezelés

**Munkavállalók adatai és ellenőrzése**

A munkáltató csak a munkaviszony létesítéséhez, teljesítéséhez vagy megszűnéséhez szükséges adatot kérhet. A munkavállalót csak a munkaviszonnyal összefüggő magatartása körében lehet ellenőrizni; a magánélet nem ellenőrizhető. Az ellenőrzésre használt technikai eszközről előzetesen tájékoztatni kell.

- Forrás: 2012. évi I. törvény (Mt.) 9–11. §
- Teendő nálunk: A HR modul csak a munkaviszonyhoz szükséges adatmezőket kéri. A jelenlét- és belépésadat célhoz kötött; monitorozó funkció csak dokumentált előzetes tájékoztatás után kapcsolható be.

### Megőrzési idők

**Számviteli bizonylatok megőrzése**

A könyvviteli számlakivonatot, a főkönyvi kivonatot, a beszámolót és a számviteli elszámolást közvetlenül és közvetetten alátámasztó bizonylatokat (így a számlát is) legalább 8 évig olvasható formában kell megőrizni.

- Forrás: 2000. évi C. törvény (Sztv.) 169. §
- Teendő nálunk: A magyar megőrzési profil alapértéke a számlákra és a könyvelési bizonylatokra 8 év. Ezalatt törlési kérelemre csak korlátozás lehetséges.

**Adózási iratok** ⚠

Az adó megállapításához való jog főszabályként annak a naptári évnek az utolsó napjától számított 5 év alatt évül el, amelyben a bevallást be kellett nyújtani; az iratokat addig meg kell őrizni.

- Forrás: 2017. évi CL. törvény (Art.) 202. §
- Teendő nálunk: A bérszámfejtés és az adóbevallások alapadatainak megőrzése legalább az elévülésig tart; ahol a számviteli 8 év hosszabb, az az irányadó.

### Számlázás és adóhatóság

**NAV Online Számla adatszolgáltatás** ⚠

2021-től minden belföldi számla adatát valós időben jelenteni kell a NAV-nak, a magánszemély vevőnek kiállított számlákét is. Magánszemély vevő esetén a vevő neve és címe nem kerül az adatszolgáltatásba.

- Forrás: 2007. évi CXXVII. törvény (Áfa tv.) és a 23/2014. NGM rendelet
- Teendő nálunk: A NAV-integráció magánszemély vevőnél nem küld nevet és címet. Az adatszolgáltatási napló tartalmazza, mi ment ki és mikor.

### Marketing és sütik

**Reklám és sütik Magyarországon** ⚠

Közvetlen megkereséssel (például e-mailben) gazdasági reklám csak az érintett előzetes, egyértelmű és kifejezett hozzájárulásával küldhető, és a hozzájárulókról nyilvántartást kell vezetni. A sütik elhelyezéséhez előzetes tájékoztatás és hozzájárulás kell, kivéve a feltétlenül szükségeseket.

- Forrás: 2008. évi XLVIII. törvény (Grt.) 6. §; 2003. évi C. törvény (Eht.) 155. § (4)
- Teendő nálunk: A marketing részleg csak igazolt hozzájárulású listával tervez. A CRM-ben a hozzájárulás ideje, forrása és visszavonása is tárolódik.

### Kiberbiztonság (NIS2)

**Magyar kiberbiztonsági törvény (NIS2)**

A NIS2-t átültető törvény 2025. január 1-jén lépett hatályba. Hatálya alá tartoznak a magas kockázatú és kockázatos ágazatok legalább középvállalkozásai, az állami szervek és egyes szolgáltatók méretüktől függetlenül. Felügyeleti hatóság ágazattól függően az NBSZ NKI, az SZTFH vagy az MNB. Kiberbiztonsági audit is kötelező.

- Forrás: 2024. évi LXIX. törvény (Kiberbiztonsági tv.)
- Teendő nálunk: Középvállalati ügyfeleink egy része a törvény hatálya alá tartozik, ezért szállítóként igazolnunk kell a biztonságos fejlesztést, a sérülékenységkezelést és az incidensértesítést. Ehhez biztonsági adatlapot adunk.

## Lengyelország

### Hatóság és bírság

**Lengyel adatvédelmi törvény és az UODO**

A GDPR-t kiegészítő lengyel törvény hozza létre az UODO elnökének hatóságát. Közszféra-szervekre a kiszabható bírság legfeljebb 100 000 PLN.

- Forrás: Ustawa z dnia 10 maja 2018 r. o ochronie danych osobowych, art. 102
- Teendő nálunk: Lengyel ügyfélnek lengyel nyelvű tájékoztató- és DPA-sablon kell. Az incidensbejelentés az UODO felé történik.

### Gyermekek

**Korhatár hozzájáruláshoz**

Lengyelországban a GDPR 8. cikk szerinti korhatár 16 év.

- Forrás: GDPR 8. cikk
- Teendő nálunk: A regisztrációnál 16 év alatt szülői hozzájárulás kell.

### Munkahelyi adatkezelés

**Munkavállalói adatok és megfigyelés** ⚠

A Munka Törvénykönyve felsorolja, milyen adat kérhető a jelölttől és a munkavállalótól. A kamerás és az e-mail-megfigyelés csak meghatározott célra, a munkaszabályzatban rögzítve megengedett, és a munkavállalókat a bevezetés előtt (jellemzően 2 héttel) tájékoztatni kell. A 2019 után kötött munkaviszonyok személyi aktáját főszabályként 10 évig kell megőrizni.

- Forrás: Kodeks pracy art. 22¹, 22², 22³, 94 pkt 9b
- Teendő nálunk: A lengyel HR-profil csak a törvényi adatkört kéri. A monitorozó funkció bekapcsolásához rögzített tájékoztatási dátum kell; a személyi akta megőrzési ideje 10 év.

### Megőrzési idők

**Számviteli és adózási megőrzés** ⚠

A számviteli könyveket legalább 5 évig kell megőrizni a beszámoló jóváhagyását követő év elejétől. Az adózási iratokat az adókötelezettség elévüléséig, főszabályként az adóév végétől számított 5 évig kell megőrizni.

- Forrás: Ustawa o rachunkowości art. 74; Ordynacja podatkowa art. 70 és 86
- Teendő nálunk: A lengyel megőrzési profil alapértéke 5 év a fenti kezdőidőpontokkal. Az elévülés megszakadhat, ezért a törlés előtt kézi jóváhagyás kell.

### Számlázás és adóhatóság

**KSeF kötelező e-számlázás**

A strukturált e-számla a KSeF rendszeren keresztül kötelező: 2026. február 1-től a 200 millió PLN feletti forgalmú adózóknak, 2026. április 1-től a többi áfaalanynak, 2027. január 1-től a mikrovállalkozásoknak.

- Forrás: Ustawa o VAT (KSeF módosítás, 2025)
- Teendő nálunk: A lengyel piachoz KSeF-integráció kell a számlázó modulba, a KSeF-azonosító tárolásával. Ez belépési feltétel a lengyel piacra.

### Marketing és sütik

**Marketing és sütik Lengyelországban** ⚠

2024. november 10-től az elektronikus kommunikációról szóló törvény (PKE) váltotta a távközlési törvényt. Direkt marketinghez távközlési végberendezéssel és automatizált hívórendszerrel előzetes hozzájárulás kell, és a sütikre is a PKE vonatkozik. A kéretlen kereskedelmi információt elektronikus úton a 2002-es e-szolgáltatási törvény is tiltja.

- Forrás: Prawo komunikacji elektronicznej art. 398–400; Ustawa o świadczeniu usług drogą elektroniczną art. 10
- Teendő nálunk: A lengyel kampányokhoz külön, csatornánkénti hozzájárulás kell (e-mail, telefon). A süti-banner a PKE szerint működik.

### Kiberbiztonság (NIS2)

**Lengyel NIS2-átültetés (KSC-módosítás)** ⚠

A nemzeti kiberbiztonsági rendszerről szóló törvény módosítását 2026. február 19-én írták alá, és 2026. április 2-án lépett hatályba. Egyes rendelkezéseit (magas kockázatú szállítók, bírságok) az elnök az Alkotmánybíróság elé utalta.

- Forrás: Ustawa o krajowym systemie cyberbezpieczeństwa (2026-os módosítás)
- Teendő nálunk: A lengyel ügyfelek szállítói kérdőíveire fel kell készülni. Az alkotmánybírósági döntést figyelni kell.

## Csehország

### Hatóság és bírság

**Cseh adatvédelmi törvény és az ÚOOÚ** ⚠

A GDPR-t kiegészítő cseh törvény. A felügyeleti hatóság az ÚOOÚ. Közhatalmi szervekre és közintézményekre a hatóság nem szab ki bírságot.

- Forrás: zákon č. 110/2019 Sb., o zpracování osobních údajů, § 62
- Teendő nálunk: Cseh ügyfélnek cseh nyelvű tájékoztató- és DPA-sablon kell. Az incidensbejelentés az ÚOOÚ felé történik.

### Gyermekek

**Korhatár hozzájáruláshoz**

Csehországban a GDPR 8. cikk szerinti korhatár 15 év.

- Forrás: zákon č. 110/2019 Sb., § 7
- Teendő nálunk: A cseh regisztrációs folyamatban 15 év a határ, nem 16.

### Munkahelyi adatkezelés

**Munkavállalók megfigyelése**

A munkáltató a munkáltató tevékenységének természetéből fakadó komoly ok nélkül nem sértheti a munkavállalók magánszféráját nyílt vagy rejtett megfigyeléssel, hívások, e-mailek vagy küldemények ellenőrzésével. Ha ilyen ok fennáll, a munkavállalókat közvetlenül tájékoztatni kell az ellenőrzés terjedelméről és módjáról.

- Forrás: zákon č. 262/2006 Sb. (zákoník práce), § 316
- Teendő nálunk: A cseh HR-profilban a monitorozó funkció csak dokumentált komoly ok és közvetlen tájékoztatás után kapcsolható be.

### Megőrzési idők

**Számviteli és áfa-megőrzés** ⚠

A beszámolót és az éves jelentést 10 évig, a számviteli bizonylatokat és könyveket 5 évig kell megőrizni. Az áfa szerinti adóbizonylatokat 10 évig kell megőrizni.

- Forrás: zákon č. 563/1991 Sb. (o účetnictví) § 31; zákon č. 235/2004 Sb. (o DPH) § 35
- Teendő nálunk: A cseh megőrzési profilban a számlák 10 évig maradnak meg (áfa), a többi bizonylat 5 évig.

### Marketing és sütik

**Marketing és sütik Csehországban**

Elektronikus úton kereskedelmi közlemény csak előzetes hozzájárulással küldhető, kivéve a meglévő ügyfélnek saját, hasonló termékről küldött ajánlatot. 2022. január 1-től a sütikhez is előzetes hozzájárulás kell (opt-in).

- Forrás: zákon č. 480/2004 Sb. § 7; zákon č. 127/2005 Sb. § 89 odst. 3
- Teendő nálunk: A cseh kampányokban a meglévő ügyfélre vonatkozó kivétel használható, de mindig legyen leiratkozási lehetőség. Süti-banner opt-in módban.

### Kiberbiztonság (NIS2)

**Cseh kiberbiztonsági törvény (NIS2)**

Az új kiberbiztonsági törvény 2025. november 1-jén lépett hatályba, és a korábbi 181/2014 Sb. törvényt váltotta. Fő felügyeleti hatósága a NÚKIB, amely regisztrációs portált is üzemeltet.

- Forrás: zákon č. 264/2025 Sb., o kybernetické bezpečnosti
- Teendő nálunk: Cseh ügyfeleink egy része regisztrációköteles szolgáltató lehet. Szállítóként a NÚKIB követelményeire szabott biztonsági adatlapot adunk.

### Számlázás és adóhatóság

**Cseh számlázás** ⚠

Csehországban jelenleg nincs általános kötelező B2B e-számlázás, és az elektronikus pénztárgép-nyilvántartást (EET) 2023-ban megszüntették. A számlákra az áfatörvény formai szabályai vonatkoznak.

- Forrás: zákon č. 235/2004 Sb. (o DPH) § 28–29
- Teendő nálunk: A cseh számlázó modulhoz nem kell állami valós idejű integráció, de a jövőbeni bevezetést figyelni kell.
