// Adatvédelmi tudásbázis: EU (GDPR és kapcsolódó jogszabályok), Magyarország, Lengyelország, Csehország.
// Az agentek a privacy_lookup eszközzel keresnek benne; a docs/security/adatvedelem/ összefoglaló ebből készül.
//
// FONTOS: ez munkasegédlet, nem jogi tanácsadás. A "verify" jelölésű tételeket kiadás előtt
// helyi jogásszal ellenőriztetni kell, és a teljes tudásbázist legalább félévente át kell nézni.

export const LAST_REVIEWED = "2026-10-13";

export type Jurisdiction = "EU" | "HU" | "PL" | "CZ";

export type Topic =
  | "alapelvek"
  | "jogalap"
  | "kulonleges-adat"
  | "erintetti-jogok"
  | "megorzes"
  | "biztonsag"
  | "incidens"
  | "szerepek"
  | "nyilvantartas"
  | "hatasvizsgalat"
  | "adattovabbitas"
  | "gyermek"
  | "munkahely"
  | "szamlazas"
  | "marketing"
  | "kiberbiztonsag"
  | "mi"
  | "hatosag"
  | "termek";

export const TOPIC_NAMES: Record<Topic, string> = {
  alapelvek: "Alapelvek",
  jogalap: "Jogalap",
  "kulonleges-adat": "Különleges adatok",
  "erintetti-jogok": "Érintetti jogok",
  megorzes: "Megőrzési idők",
  biztonsag: "Adatbiztonság",
  incidens: "Adatvédelmi incidens",
  szerepek: "Adatkezelő és adatfeldolgozó",
  nyilvantartas: "Nyilvántartás",
  hatasvizsgalat: "Hatásvizsgálat és DPO",
  adattovabbitas: "Harmadik országba továbbítás",
  gyermek: "Gyermekek",
  munkahely: "Munkahelyi adatkezelés",
  szamlazas: "Számlázás és adóhatóság",
  marketing: "Marketing és sütik",
  kiberbiztonsag: "Kiberbiztonság (NIS2)",
  mi: "Mesterséges intelligencia",
  hatosag: "Hatóság és bírság",
  termek: "Termékkövetelmény (ERP)",
};

export interface Authority {
  name: string;
  short: string;
  url: string;
}

export const AUTHORITIES: Record<Jurisdiction, Authority> = {
  EU: { name: "Európai Adatvédelmi Testület", short: "EDPB", url: "https://www.edpb.europa.eu" },
  HU: { name: "Nemzeti Adatvédelmi és Információszabadság Hatóság", short: "NAIH", url: "https://naih.hu" },
  PL: { name: "Prezes Urzędu Ochrony Danych Osobowych", short: "UODO", url: "https://uodo.gov.pl" },
  CZ: { name: "Úřad pro ochranu osobních údajů", short: "ÚOOÚ", url: "https://uoou.gov.cz" },
};

export const JURISDICTION_NAMES: Record<Jurisdiction, string> = {
  EU: "Európai Unió",
  HU: "Magyarország",
  PL: "Lengyelország",
  CZ: "Csehország",
};

export interface PrivacyRule {
  id: string;
  jurisdiction: Jurisdiction;
  topic: Topic;
  title: string;
  /** Mit mond a szabály, röviden. */
  rule: string;
  /** Jogszabályhely. */
  source: string;
  /** Mit jelent ez a mi ERP termékünkre vagy a cég működésére. */
  impact: string;
  /** Igaz, ha a részletet kiadás előtt helyi jogásznak ellenőriznie kell. */
  verify?: boolean;
}

const R = (
  id: string,
  jurisdiction: Jurisdiction,
  topic: Topic,
  title: string,
  rule: string,
  source: string,
  impact: string,
  verify = false,
): PrivacyRule => ({ id, jurisdiction, topic, title, rule, source, impact, ...(verify ? { verify } : {}) });

export const RULES: PrivacyRule[] = [
  // ───────────── EU ─────────────
  R("eu-alapelvek", "EU", "alapelvek", "Az adatkezelés alapelvei",
    "Jogszerűség, tisztességes eljárás és átláthatóság; célhoz kötöttség; adattakarékosság; pontosság; korlátozott tárolhatóság; integritás és bizalmas jelleg; elszámoltathatóság (az adatkezelőnek bizonyítania kell a megfelelést).",
    "GDPR (EU) 2016/679, 5. cikk",
    "Minden személyes adatmezőhöz legyen dokumentált cél és jogalap. Csak azt gyűjtsük, ami a funkcióhoz kell. Minden adatkategóriához legyen megőrzési idő."),
  R("eu-jogalap", "EU", "jogalap", "A hat jogalap",
    "Hozzájárulás; szerződés teljesítése; jogi kötelezettség; létfontosságú érdek; közérdek vagy közhatalom; jogos érdek (érdekmérlegelési teszttel). Hozzájárulásnak önkéntesnek, konkrétnak, tájékozottnak és egyértelműnek kell lennie, és bármikor visszavonható.",
    "GDPR 6. cikk, 7. cikk",
    "ERP-ben jellemző jogalapok: szerződés (vevő-, szállítóadatok), jogi kötelezettség (számlázás, könyvelés, bérszámfejtés), jogos érdek (kapcsolattartók). Hozzájárulás főleg marketinghez kell. A termék adatkezelési nyilvántartása folyamatonként tárolja a jogalapot."),
  R("eu-kulonleges", "EU", "kulonleges-adat", "Különleges adatok",
    "Faji vagy etnikai származás, politikai vélemény, vallás, szakszervezeti tagság, genetikai, biometrikus azonosító, egészségügyi adat, szexuális élet kezelése főszabályként tilos, csak a 9. cikk (2) szerinti kivétellel. Büntetőjogi adatokra a 10. cikk vonatkozik.",
    "GDPR 9–10. cikk",
    "A HR modulban a betegszabadság (egészségügyi adat) és a szakszervezeti tagdíjlevonás (szakszervezeti tagság) különleges adat. Ezek külön jogosultságot, mezőszintű titkosítást és hozzáférési naplót kapnak."),
  R("eu-jogok", "EU", "erintetti-jogok", "Érintetti jogok és határidő",
    "Tájékoztatás (13–14.), hozzáférés (15.), helyesbítés (16.), törlés (17.), korlátozás (18.), hordozhatóság (19–20.), tiltakozás (21.), automatizált döntés elleni védelem (22.). A kérelmet indokolatlan késedelem nélkül, legfeljebb egy hónapon belül kell teljesíteni; ez szükség esetén két hónappal meghosszabbítható. Főszabály szerint díjmentes.",
    "GDPR 12–22. cikk, 12. cikk (3)",
    "Kell egy érintetti kérelem funkció: egy személy összes adatának megkeresése a modulokban, gépileg olvasható export (JSON/CSV), helyesbítés, korlátozás, és határidő-figyelés a kérelmekre."),
  R("eu-torles-vs-megorzes", "EU", "megorzes", "Törlési kérelem és kötelező megőrzés ütközése",
    "A törléshez való jog nem érvényesül, ha az adatkezelés jogi kötelezettség teljesítéséhez szükséges.",
    "GDPR 17. cikk (3) b)",
    "Számlát és könyvelési bizonylatot nem törölhetünk kérésre a megőrzési idő alatt. Ilyenkor az adatot korlátozzuk (zárolás, csak megőrzési célra elérhető), a határidő lejárta után pedig automatikusan töröljük vagy anonimizáljuk."),
  R("eu-beepitett", "EU", "biztonsag", "Beépített és alapértelmezett adatvédelem",
    "Az adatkezelőnek már a tervezéskor és alapértelmezésként is megfelelő technikai és szervezési intézkedéseket kell alkalmaznia, például álnevesítést és adattakarékosságot.",
    "GDPR 25. cikk",
    "Alapértelmezésben a legszűkebb jogosultság, a nem kötelező személyes mezők üresek, a riportokban álnevesített nézet, tesztkörnyezetbe csak álnevesített adat kerülhet."),
  R("eu-biztonsag", "EU", "biztonsag", "Az adatkezelés biztonsága",
    "A kockázattal arányos intézkedések: álnevesítés és titkosítás, bizalmasság, integritás, rendelkezésre állás és ellenálló képesség, helyreállíthatóság incidens után, rendszeres tesztelés és értékelés.",
    "GDPR 32. cikk",
    "TLS mindenhol, titkosítás tároláskor, szerepköralapú jogosultság, hozzáférési napló, titkosított mentés helyreállítási próbával, rendszeres sérülékenységvizsgálat."),
  R("eu-incidens", "EU", "incidens", "Adatvédelmi incidens bejelentése",
    "Az adatkezelő az incidenst indokolatlan késedelem nélkül, lehetőleg 72 órán belül bejelenti a hatóságnak, kivéve ha valószínűleg nem jár kockázattal. Az adatfeldolgozó késedelem nélkül értesíti az adatkezelőt. Magas kockázatnál az érintetteket is tájékoztatni kell. Minden incidenst nyilvántartásba kell venni.",
    "GDPR 33–34. cikk",
    "A terméknek tudnia kell biztonsági eseményt jelezni az ügyfél adminisztrátorának, és kell incidensnyilvántartás. Ha mi üzemeltetünk (SaaS), adatfeldolgozóként azonnal értesítjük az ügyfelet."),
  R("eu-szerepek", "EU", "szerepek", "Adatkezelő és adatfeldolgozó",
    "Az adatfeldolgozóval írásbeli szerződést kell kötni a 28. cikk (3) szerinti kötelező tartalommal (utasítás szerinti kezelés, titoktartás, biztonság, al-adatfeldolgozók, segítségnyújtás, törlés vagy visszaadás, auditálhatóság).",
    "GDPR 28. cikk",
    "Dobozos, helyben telepített terméknél az ügyfél az adatkezelő, és mi főszabályként nem látunk adatot. Ha üzemeltetünk, vagy a támogatás során hozzáférünk, adatfeldolgozók vagyunk: kell adatfeldolgozási szerződés (DPA) és al-adatfeldolgozói lista, a támogatási hozzáférés pedig csak az ügyfél engedélyével, naplózva történhet."),
  R("eu-nyilvantartas", "EU", "nyilvantartas", "Adatkezelési tevékenységek nyilvántartása",
    "Az adatkezelő és az adatfeldolgozó nyilvántartást vezet a kezelési tevékenységekről. A 250 főnél kevesebb munkavállalót foglalkoztatókra a mentesség nem vonatkozik, ha az adatkezelés kockázatos, nem alkalmi, vagy különleges adatot érint, ezért a gyakorlatban a legtöbb KKV-nak is kell.",
    "GDPR 30. cikk",
    "Eladási érv: az ERP a beállított modulokból előre kitöltött adatkezelési nyilvántartást generál az ügyfélnek."),
  R("eu-dpia", "EU", "hatasvizsgalat", "Adatvédelmi hatásvizsgálat (DPIA)",
    "Valószínűsíthetően magas kockázatú adatkezelés előtt hatásvizsgálat kell, például rendszeres és kiterjedt megfigyelésnél vagy nagy léptékű különleges adatkezelésnél. A nemzeti hatóságok listát tesznek közzé a DPIA-köteles adatkezelésekről.",
    "GDPR 35. cikk",
    "A munkavállalói megfigyelést (például belépés- vagy munkaidő-követést) támogató funkcióhoz DPIA-sablont adunk az ügyfélnek, és a NAIH, UODO, ÚOOÚ listáit is figyelembe vesszük."),
  R("eu-dpo", "EU", "hatasvizsgalat", "Adatvédelmi tisztviselő (DPO)",
    "DPO kijelölése kötelező közhatalmi szervnél, illetve ha a fő tevékenység az érintettek nagy léptékű, rendszeres és szisztematikus megfigyelése, vagy különleges adatok nagy léptékű kezelése.",
    "GDPR 37–39. cikk",
    "A cégben az adatvédelmi tisztviselő agent látja el a DPO-szerepet a fejlesztésben. Az ügyfeleknek a termék kijelölhető DPO-kapcsolattartót biztosít."),
  R("eu-tovabbitas", "EU", "adattovabbitas", "Továbbítás az EGT-n kívülre",
    "Harmadik országba csak megfelelőségi határozat (ilyen például az EU–USA adatvédelmi keret 2023 júliusa óta), általános szerződési feltételek (2021/914 bizottsági határozat), kötelező erejű vállalati szabályok vagy a 49. cikk szerinti kivétel alapján lehet adatot továbbítani.",
    "GDPR 44–49. cikk",
    "Üzemeltetésnél EU-n belüli tárhely. Az al-adatfeldolgozói listán szerepeljen minden külső szolgáltató, az MI- és LLM-szolgáltatók is. Ügyféladat MI-szolgáltatónak csak kifejezett beállítással és DPA-val mehet."),
  R("eu-gyermek", "EU", "gyermek", "Gyermek hozzájárulása",
    "Információs társadalommal összefüggő szolgáltatásnál a 16 év alatti gyermek hozzájárulásához a szülő engedélye kell. A tagállam ezt 13 évig csökkentheti.",
    "GDPR 8. cikk",
    "B2B ERP-nél ritkán releváns, de a webes regisztrációnál és a marketingnél figyelembe kell venni."),
  R("eu-birsag", "EU", "hatosag", "Közigazgatási bírság",
    "Legfeljebb 10 millió EUR vagy az előző év globális forgalmának 2%-a (például 8., 11., 25–39. cikk megsértése), illetve legfeljebb 20 millió EUR vagy 4% (alapelvek, jogalap, érintetti jogok, továbbítás). Mindkét esetben a magasabb összeg az irányadó.",
    "GDPR 83. cikk",
    "A kockázatértékelésben és a kiadási kapunál ezzel a súllyal számolunk."),
  R("eu-eprivacy", "EU", "marketing", "Sütik és elektronikus direkt marketing",
    "A végberendezésen történő tároláshoz és hozzáféréshez (sütik) előzetes hozzájárulás kell, kivéve a szolgáltatáshoz feltétlenül szükséges eseteket. Elektronikus levélben küldött direkt marketinghez előzetes hozzájárulás kell, kivéve a saját meglévő ügyfélnek küldött, hasonló termékre vonatkozó ajánlatot, amelyről leiratkozhat.",
    "2002/58/EK irányelv 5. cikk (3), 13. cikk",
    "A termék webes felülete csak feltétlenül szükséges sütit használ. A marketing részleg csak igazolt hozzájárulású listára tervez kampányt."),
  R("eu-nis2", "EU", "kiberbiztonsag", "NIS2 irányelv",
    "Az alanyok kockázatkezelési intézkedései között szerepel az ellátási lánc biztonsága és a biztonságos fejlesztés. Jelentős incidensnél 24 órán belül korai figyelmeztetés, 72 órán belül bejelentés, egy hónapon belül zárójelentés kell.",
    "(EU) 2022/2555 irányelv, 21. és 23. cikk",
    "Ügyfeleink NIS2 alanyok lehetnek, ezért tőlünk mint szállítótól elvárják: biztonságos fejlesztési folyamat, sérülékenységkezelés és -közzététel, gyors incidensértesítés, SBOM (szoftverösszetevő-lista)."),
  R("eu-ai-act", "EU", "mi", "MI-rendelet (AI Act)",
    "A foglalkoztatási célú MI-rendszerek (például toborzás, előléptetés, teljesítményértékelés) magas kockázatúnak minősülhetnek, szigorú kockázatkezelési, dokumentációs és emberi felügyeleti követelményekkel. A rendelet kötelezettségei szakaszosan válnak alkalmazandóvá.",
    "(EU) 2024/1689 rendelet, III. melléklet 4. pont",
    "MI-alapú HR-funkciót csak a CISO és az adatvédelmi tisztviselő jóváhagyásával tervezünk. Az alkalmazási határidőket kiadás előtt ellenőrizni kell.",
    true),
  R("eu-data-act", "EU", "termek", "Adatrendelet (Data Act): szolgáltatóváltás",
    "Az adatfeldolgozási (felhő) szolgáltatások ügyfeleinek joguk van szolgáltatót váltani és adataikat géppel olvasható formában átvinni. A rendelet 2025. szeptember 12-től alkalmazandó.",
    "(EU) 2023/2854 rendelet",
    "Felhős (SaaS) változatnál teljes adatexport nyílt formátumban, és szerződésben vállalt átállási segítség kell."),
  R("eu-termek-kovetelmenyek", "EU", "termek", "Adatvédelmi alapkövetelmények az ERP-hez",
    "A GDPR-ból következő technikai minimum egy személyes adatot kezelő üzleti szoftverben.",
    "GDPR 5., 15–21., 25., 30., 32–33. cikk",
    "1) Szerepköralapú jogosultság és teljes hozzáférési napló. 2) Érintetti kérelem: keresés, export, helyesbítés, korlátozás. 3) Megőrzési szabályok adatkategóriánként és országonként, automatikus törléssel vagy anonimizálással. 4) Mezőszintű titkosítás a különleges adatokra. 5) Adatkezelési nyilvántartás generálása. 6) Incidensnapló és riasztás. 7) Álnevesített teszt- és demóadat. 8) Teljes adatexport szolgáltatóváltáshoz."),

  // ───────────── Magyarország ─────────────
  R("hu-infotv", "HU", "hatosag", "Infotv. és a NAIH",
    "A GDPR-t kiegészítő magyar törvény az információs önrendelkezési jogról és az információszabadságról. A felügyeleti hatóság a NAIH, amely panasz és hivatalból indított eljárásban is bírságolhat; incidensbejelentést online fogad.",
    "2011. évi CXII. törvény (Infotv.)",
    "Magyar ügyfélnek magyar nyelvű adatkezelési tájékoztató- és DPA-sablon kell. Az incidenskezelési folyamatban a NAIH bejelentőfelülete szerepel."),
  R("hu-gyermek", "HU", "gyermek", "Korhatár hozzájáruláshoz",
    "Magyarországon a GDPR 8. cikk szerinti korhatár 16 év.",
    "GDPR 8. cikk, magyar szabályozás",
    "A regisztrációnál 16 év alatt szülői hozzájárulás kell."),
  R("hu-munkahely", "HU", "munkahely", "Munkavállalók adatai és ellenőrzése",
    "A munkáltató csak a munkaviszony létesítéséhez, teljesítéséhez vagy megszűnéséhez szükséges adatot kérhet. A munkavállalót csak a munkaviszonnyal összefüggő magatartása körében lehet ellenőrizni; a magánélet nem ellenőrizhető. Az ellenőrzésre használt technikai eszközről előzetesen tájékoztatni kell.",
    "2012. évi I. törvény (Mt.) 9–11. §",
    "A HR modul csak a munkaviszonyhoz szükséges adatmezőket kéri. A jelenlét- és belépésadat célhoz kötött; monitorozó funkció csak dokumentált előzetes tájékoztatás után kapcsolható be."),
  R("hu-megorzes-szamvitel", "HU", "megorzes", "Számviteli bizonylatok megőrzése",
    "A könyvviteli számlakivonatot, a főkönyvi kivonatot, a beszámolót és a számviteli elszámolást közvetlenül és közvetetten alátámasztó bizonylatokat (így a számlát is) legalább 8 évig olvasható formában kell megőrizni.",
    "2000. évi C. törvény (Sztv.) 169. §",
    "A magyar megőrzési profil alapértéke a számlákra és a könyvelési bizonylatokra 8 év. Ezalatt törlési kérelemre csak korlátozás lehetséges."),
  R("hu-megorzes-ado", "HU", "megorzes", "Adózási iratok",
    "Az adó megállapításához való jog főszabályként annak a naptári évnek az utolsó napjától számított 5 év alatt évül el, amelyben a bevallást be kellett nyújtani; az iratokat addig meg kell őrizni.",
    "2017. évi CL. törvény (Art.) 202. §",
    "A bérszámfejtés és az adóbevallások alapadatainak megőrzése legalább az elévülésig tart; ahol a számviteli 8 év hosszabb, az az irányadó.",
    true),
  R("hu-nav-szamla", "HU", "szamlazas", "NAV Online Számla adatszolgáltatás",
    "2021-től minden belföldi számla adatát valós időben jelenteni kell a NAV-nak, a magánszemély vevőnek kiállított számlákét is. Magánszemély vevő esetén a vevő neve és címe nem kerül az adatszolgáltatásba.",
    "2007. évi CXXVII. törvény (Áfa tv.) és a 23/2014. NGM rendelet",
    "A NAV-integráció magánszemély vevőnél nem küld nevet és címet. Az adatszolgáltatási napló tartalmazza, mi ment ki és mikor.",
    true),
  R("hu-marketing", "HU", "marketing", "Reklám és sütik Magyarországon",
    "Közvetlen megkereséssel (például e-mailben) gazdasági reklám csak az érintett előzetes, egyértelmű és kifejezett hozzájárulásával küldhető, és a hozzájárulókról nyilvántartást kell vezetni. A sütik elhelyezéséhez előzetes tájékoztatás és hozzájárulás kell, kivéve a feltétlenül szükségeseket.",
    "2008. évi XLVIII. törvény (Grt.) 6. §; 2003. évi C. törvény (Eht.) 155. § (4)",
    "A marketing részleg csak igazolt hozzájárulású listával tervez. A CRM-ben a hozzájárulás ideje, forrása és visszavonása is tárolódik.",
    true),
  R("hu-kiber", "HU", "kiberbiztonsag", "Magyar kiberbiztonsági törvény (NIS2)",
    "A NIS2-t átültető törvény 2025. január 1-jén lépett hatályba. Hatálya alá tartoznak a magas kockázatú és kockázatos ágazatok legalább középvállalkozásai, az állami szervek és egyes szolgáltatók méretüktől függetlenül. Felügyeleti hatóság ágazattól függően az NBSZ NKI, az SZTFH vagy az MNB. Kiberbiztonsági audit is kötelező.",
    "2024. évi LXIX. törvény (Kiberbiztonsági tv.)",
    "Középvállalati ügyfeleink egy része a törvény hatálya alá tartozik, ezért szállítóként igazolnunk kell a biztonságos fejlesztést, a sérülékenységkezelést és az incidensértesítést. Ehhez biztonsági adatlapot adunk."),

  // ───────────── Lengyelország ─────────────
  R("pl-uodo", "PL", "hatosag", "Lengyel adatvédelmi törvény és az UODO",
    "A GDPR-t kiegészítő lengyel törvény hozza létre az UODO elnökének hatóságát. Közszféra-szervekre a kiszabható bírság legfeljebb 100 000 PLN.",
    "Ustawa z dnia 10 maja 2018 r. o ochronie danych osobowych, art. 102",
    "Lengyel ügyfélnek lengyel nyelvű tájékoztató- és DPA-sablon kell. Az incidensbejelentés az UODO felé történik."),
  R("pl-gyermek", "PL", "gyermek", "Korhatár hozzájáruláshoz",
    "Lengyelországban a GDPR 8. cikk szerinti korhatár 16 év.",
    "GDPR 8. cikk",
    "A regisztrációnál 16 év alatt szülői hozzájárulás kell."),
  R("pl-munkahely", "PL", "munkahely", "Munkavállalói adatok és megfigyelés",
    "A Munka Törvénykönyve felsorolja, milyen adat kérhető a jelölttől és a munkavállalótól. A kamerás és az e-mail-megfigyelés csak meghatározott célra, a munkaszabályzatban rögzítve megengedett, és a munkavállalókat a bevezetés előtt (jellemzően 2 héttel) tájékoztatni kell. A 2019 után kötött munkaviszonyok személyi aktáját főszabályként 10 évig kell megőrizni.",
    "Kodeks pracy art. 22¹, 22², 22³, 94 pkt 9b",
    "A lengyel HR-profil csak a törvényi adatkört kéri. A monitorozó funkció bekapcsolásához rögzített tájékoztatási dátum kell; a személyi akta megőrzési ideje 10 év.",
    true),
  R("pl-megorzes", "PL", "megorzes", "Számviteli és adózási megőrzés",
    "A számviteli könyveket legalább 5 évig kell megőrizni a beszámoló jóváhagyását követő év elejétől. Az adózási iratokat az adókötelezettség elévüléséig, főszabályként az adóév végétől számított 5 évig kell megőrizni.",
    "Ustawa o rachunkowości art. 74; Ordynacja podatkowa art. 70 és 86",
    "A lengyel megőrzési profil alapértéke 5 év a fenti kezdőidőpontokkal. Az elévülés megszakadhat, ezért a törlés előtt kézi jóváhagyás kell.",
    true),
  R("pl-ksef", "PL", "szamlazas", "KSeF kötelező e-számlázás",
    "A strukturált e-számla a KSeF rendszeren keresztül kötelező: 2026. február 1-től a 200 millió PLN feletti forgalmú adózóknak, 2026. április 1-től a többi áfaalanynak, 2027. január 1-től a mikrovállalkozásoknak.",
    "Ustawa o VAT (KSeF módosítás, 2025)",
    "A lengyel piachoz KSeF-integráció kell a számlázó modulba, a KSeF-azonosító tárolásával. Ez belépési feltétel a lengyel piacra."),
  R("pl-marketing", "PL", "marketing", "Marketing és sütik Lengyelországban",
    "2024. november 10-től az elektronikus kommunikációról szóló törvény (PKE) váltotta a távközlési törvényt. Direkt marketinghez távközlési végberendezéssel és automatizált hívórendszerrel előzetes hozzájárulás kell, és a sütikre is a PKE vonatkozik. A kéretlen kereskedelmi információt elektronikus úton a 2002-es e-szolgáltatási törvény is tiltja.",
    "Prawo komunikacji elektronicznej art. 398–400; Ustawa o świadczeniu usług drogą elektroniczną art. 10",
    "A lengyel kampányokhoz külön, csatornánkénti hozzájárulás kell (e-mail, telefon). A süti-banner a PKE szerint működik.",
    true),
  R("pl-kiber", "PL", "kiberbiztonsag", "Lengyel NIS2-átültetés (KSC-módosítás)",
    "A nemzeti kiberbiztonsági rendszerről szóló törvény módosítását 2026. február 19-én írták alá, és 2026. április 2-án lépett hatályba. Egyes rendelkezéseit (magas kockázatú szállítók, bírságok) az elnök az Alkotmánybíróság elé utalta.",
    "Ustawa o krajowym systemie cyberbezpieczeństwa (2026-os módosítás)",
    "A lengyel ügyfelek szállítói kérdőíveire fel kell készülni. Az alkotmánybírósági döntést figyelni kell.",
    true),

  // ───────────── Csehország ─────────────
  R("cz-uoou", "CZ", "hatosag", "Cseh adatvédelmi törvény és az ÚOOÚ",
    "A GDPR-t kiegészítő cseh törvény. A felügyeleti hatóság az ÚOOÚ. Közhatalmi szervekre és közintézményekre a hatóság nem szab ki bírságot.",
    "zákon č. 110/2019 Sb., o zpracování osobních údajů, § 62",
    "Cseh ügyfélnek cseh nyelvű tájékoztató- és DPA-sablon kell. Az incidensbejelentés az ÚOOÚ felé történik.",
    true),
  R("cz-gyermek", "CZ", "gyermek", "Korhatár hozzájáruláshoz",
    "Csehországban a GDPR 8. cikk szerinti korhatár 15 év.",
    "zákon č. 110/2019 Sb., § 7",
    "A cseh regisztrációs folyamatban 15 év a határ, nem 16."),
  R("cz-munkahely", "CZ", "munkahely", "Munkavállalók megfigyelése",
    "A munkáltató a munkáltató tevékenységének természetéből fakadó komoly ok nélkül nem sértheti a munkavállalók magánszféráját nyílt vagy rejtett megfigyeléssel, hívások, e-mailek vagy küldemények ellenőrzésével. Ha ilyen ok fennáll, a munkavállalókat közvetlenül tájékoztatni kell az ellenőrzés terjedelméről és módjáról.",
    "zákon č. 262/2006 Sb. (zákoník práce), § 316",
    "A cseh HR-profilban a monitorozó funkció csak dokumentált komoly ok és közvetlen tájékoztatás után kapcsolható be."),
  R("cz-megorzes", "CZ", "megorzes", "Számviteli és áfa-megőrzés",
    "A beszámolót és az éves jelentést 10 évig, a számviteli bizonylatokat és könyveket 5 évig kell megőrizni. Az áfa szerinti adóbizonylatokat 10 évig kell megőrizni.",
    "zákon č. 563/1991 Sb. (o účetnictví) § 31; zákon č. 235/2004 Sb. (o DPH) § 35",
    "A cseh megőrzési profilban a számlák 10 évig maradnak meg (áfa), a többi bizonylat 5 évig.",
    true),
  R("cz-marketing", "CZ", "marketing", "Marketing és sütik Csehországban",
    "Elektronikus úton kereskedelmi közlemény csak előzetes hozzájárulással küldhető, kivéve a meglévő ügyfélnek saját, hasonló termékről küldött ajánlatot. 2022. január 1-től a sütikhez is előzetes hozzájárulás kell (opt-in).",
    "zákon č. 480/2004 Sb. § 7; zákon č. 127/2005 Sb. § 89 odst. 3",
    "A cseh kampányokban a meglévő ügyfélre vonatkozó kivétel használható, de mindig legyen leiratkozási lehetőség. Süti-banner opt-in módban."),
  R("cz-kiber", "CZ", "kiberbiztonsag", "Cseh kiberbiztonsági törvény (NIS2)",
    "Az új kiberbiztonsági törvény 2025. november 1-jén lépett hatályba, és a korábbi 181/2014 Sb. törvényt váltotta. Fő felügyeleti hatósága a NÚKIB, amely regisztrációs portált is üzemeltet.",
    "zákon č. 264/2025 Sb., o kybernetické bezpečnosti",
    "Cseh ügyfeleink egy része regisztrációköteles szolgáltató lehet. Szállítóként a NÚKIB követelményeire szabott biztonsági adatlapot adunk."),
  R("cz-szamlazas", "CZ", "szamlazas", "Cseh számlázás",
    "Csehországban jelenleg nincs általános kötelező B2B e-számlázás, és az elektronikus pénztárgép-nyilvántartást (EET) 2023-ban megszüntették. A számlákra az áfatörvény formai szabályai vonatkoznak.",
    "zákon č. 235/2004 Sb. (o DPH) § 28–29",
    "A cseh számlázó modulhoz nem kell állami valós idejű integráció, de a jövőbeni bevezetést figyelni kell.",
    true),
];

export const JURISDICTIONS: Jurisdiction[] = ["EU", "HU", "PL", "CZ"];

/** Szabályok keresése joghatóság, téma és szabad szöveg szerint. Az EU-s szabályok mindig mennek az országosakkal. */
export function lookup(opts: { jurisdictions?: Jurisdiction[]; topic?: Topic; query?: string }): PrivacyRule[] {
  const js = opts.jurisdictions?.length ? new Set<Jurisdiction>(["EU", ...opts.jurisdictions]) : new Set(JURISDICTIONS);
  const words = (opts.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return RULES.filter((r) => js.has(r.jurisdiction))
    .filter((r) => (opts.topic ? r.topic === opts.topic : true))
    .filter((r) => {
      if (words.length === 0) return true;
      const hay = `${r.title} ${r.rule} ${r.impact} ${r.source}`.toLowerCase();
      return words.some((w) => hay.includes(w));
    });
}

export function formatRule(r: PrivacyRule): string {
  return `[${r.jurisdiction}] ${r.title} (${r.id})${r.verify ? " ⚠ jogászi ellenőrzés kell" : ""}
Szabály: ${r.rule}
Forrás: ${r.source}
Teendő nálunk: ${r.impact}`;
}
