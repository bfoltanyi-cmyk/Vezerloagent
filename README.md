# Alicya Nexus – az ACHIEVE-R ügynöksége

Az ACHIEVE-R B2B szoftvercég agentekből álló ügynöksége: a fejlesztést, a megrendeléseket és a marketinget viszi. Termékvonalak: ACHIEVE-R HLD (lead-generáló SaaS, él), Alicya ERP (dobozos, specifikáció), Alicya Praxis (ötlet); elég nagy megrendelésre egyedi fejlesztés. Piacok a belépés sorrendjében: Magyarország, Szlovákia, Lengyelország, Ausztria, Csehország. A portfólió és a piacok a [`company/portfolio.ts`](company/portfolio.ts) fájlban vannak. Nyolc részlegben 45 Claude agent dolgozik, közös feladattáblán. A tulajdonos (te) csak a kritikus pontokon dönt.

A cég GitHub Actionsben fut hétköznap kétszer (8:00 és 16:00 körül), és kézzel is indítható. Az állapotát egy GitHub Pages-en futó vezérlőterem mutatja.

## Részlegek

| Részleg | Agentek | Szerepek |
|---|---|---|
| Alicya Core | 3 | Vezérigazgató, Operációs vezető, Jelentésíró |
| Termék & kutatás | 3 | Piackutató, Termékmenedzser, UX tervező |
| Fejlesztés | 19 | Szoftverarchitekt, Tech lead, 4 backend fejlesztő (számlázás, készlet, könyvelés, HR), NAV-integrációs fejlesztő, API fejlesztő, Adatbázis-mérnök, 2 frontend fejlesztő, Kódellenőr, QA vezető, Tesztautomatizáló, Elfogadási tesztelő, Teljesítménytesztelő, DevOps mérnök, Kiadásfelelős, Dokumentátor |
| Adatbiztonság | 10 | CISO, Adatvédelmi tisztviselő (DPO · EU), Adatvédelmi szakértő · Magyarország, · Lengyelország, · Csehország, Alkalmazásbiztonsági auditor, Ellátásilánc-figyelő, Behatolásteszt-tervező, Titok- és hozzáférés-kezelő, Incidenskezelő |
| Marketing | 3 | Márkastratéga, Tartalomíró, Kampánymenedzser |
| Sales | 3 | Sales vezető, Árazási elemző, Ajánlatíró |
| Ügyfélsiker | 2 | Ügyfélsiker vezető, Tudásbázis-szerkesztő |
| Pénzügy & jog | 2 | Kontroller, Jogi agent |

A szervezet a [`company/org.ts`](company/org.ts) fájlban van leírva. Új agentet ide kell felvenni.

## Hogyan dolgozik

1. **Döntések beolvasása.** A munkanap elején a cég beolvassa a GitHub issue-kon hozott döntéseidet.
2. **Tervezés.** A vezérigazgató agent átnézi a táblát, feloldja az elakadt feladatokat, és új munkát ad a részlegeknek.
3. **Munka.** A legsürgősebb elvégezhető feladatok sorra kerülnek. Minden agent csak a saját szerepkörében dolgozik: a kódszerepek a `product/` és `docs/` alá írhatnak, a többiek csak a `docs/` alá.
4. **Kötelező átvizsgálás.** Minden kódfeladat lezárásakor automatikusan indul egy kódellenőrzés és egy biztonsági átvizsgálás, személyes adatot érintő változásnál adatvédelmi átvizsgálás is. A feladat csak akkor kész, ha mindegyik jóváhagyta; különben visszamegy a fejlesztőhöz.
5. **Jóváhagyási kapuk.** A specifikáció, a kiadás, az árazás és minden kifelé szánt szöveg rád vár. Ezekből `kapu` címkés GitHub issue lesz.
6. **Mentés.** Minden munka az `alicya/munka` ágra kerül, és egy nyitott pull requestben vár. A `main` ágra semmi nem kerül nélküled.
7. **Napi jelentés** a `state/reports/` alatt és a vezérlőteremben.

## Kézikönyv: így gyártunk dobozos szoftvert

Minden agent a rendszerpromptjában kapja meg a cég kézikönyvét: mit gyárt a cég (a portfólió, a piacok, mi a SaaS, a dobozos és az egyedi termék), a termék nyolc fázisú életciklusát a kapukkal, a részlege munkarendjét, a saját bemenetét, kimenetét és azt, hogy kinek adja tovább a munkát. Forrás: [`company/playbook.ts`](company/playbook.ts), olvasható formában [`docs/core/kezikonyv.md`](docs/core/kezikonyv.md). Módosítás után futtasd az `npm run build:handbook` parancsot.

## Adatvédelmi modul (EU, HU, PL, CZ)

A cég célpiaca Magyarország, Lengyelország és Csehország, ezért az adatbiztonsági részlegben egy EU-s adatvédelmi tisztviselő (DPO) és három országos szakértő dolgozik. A munkájukat egy tudásbázis segíti: [`company/privacy/knowledge.ts`](company/privacy/knowledge.ts), olvasható formában [`docs/security/adatvedelem/README.md`](docs/security/adatvedelem/README.md).

- **Lefedett terület:** GDPR (alapelvek, jogalap, különleges adatok, érintetti jogok, incidens, adatfeldolgozás, nyilvántartás, DPIA, DPO, adattovábbítás, bírság), ePrivacy, NIS2, MI-rendelet, adatrendelet, továbbá országonként a hatóság, a gyermekkorhatár, a munkahelyi adatkezelés, a számviteli és adózási megőrzés, az e-számlázás (NAV Online Számla, KSeF), a marketing és a sütik, valamint a nemzeti NIS2-törvény.
- **Minden agent** kereshet benne a `privacy_lookup` eszközzel, és minden szabályhoz tartozik egy „Teendő nálunk” pont az ERP-re.
- **Minden személyes adatot érintő kódváltozást** a DPO is átvizsgál.
- **Ez munkasegédlet, nem jogi tanácsadás.** A ⚠ jelölésű pontokat kiadás előtt helyi jogásznak kell ellenőriznie, és a tudásbázist legalább félévente át kell nézni (`LAST_REVIEWED`). Módosítás után futtasd az `npm run build:privacy` parancsot.

## Beszélgetés a vezérigazgatóval

A vezérlőteremben a **Chat a vezérigazgatóval** gomb jobb oldalt megnyit egy chatablakot. Íráshoz egyszer össze kell kapcsolni egy saját, finomhangolt GitHub tokennel (csak ez a repó, Issues: Read and write); a token csak a böngésződben tárolódik. Az üzenetek egy `ceo` címkés issue-ba kerülnek, a válasz pár percen belül megjelenik az ablakban. Az **ÚJ** gomb új beszélgetést kezd.

A GitHubon is írhatsz: nyiss egy issue-t az **Üzenet a vezérigazgatónak** sablonnal, vagy tedd rá egy issue-ra a `ceo` címkét. A vezérigazgató agent pár percen belül hozzászólásban válaszol, és minden új hozzászólásodra újra.

- Kérdezheted a cég állapotáról: a feladattáblából és a dokumentumokból válaszol.
- Adhatsz utasítást: konkrét munkát feladatként ad ki, az általános irányt a `docs/core/tulajdonosi-iranymutatas.md` fájlba írja, amit minden napi tervezés elolvas.
- Csak a repó tulajdonosának üzeneteire válaszol. Egy válasz legfeljebb 0,5 USD (`CHAT_BUDGET_USD` változóval állítható), és a havi keretbe számít.
- Ha épp fut egy munkanap, a válasz megvárja a végét.

## Projektek fül: új projekt kiadása

A vezérlőterem **Projektek** fülén a tulajdonos új projektet adhat ki: név, mi a feladat, mikor kész (elfogadási feltételek), megkötések, felelős részleg, prioritás és határidő. Az űrlap egy jelölt issue-t küld (`<!-- alicya-projekt -->` és egy JSON-blokk; a blokk alá a GitHubon kiegészítés vagy csatolmány is írható). A Döntés munkafolyamat pár percen belül:

- projektlapot ír a `docs/projektek/P-xxx-<név>.md` alá, és felveszi a `state/projects.json` nyilvántartásba;
- indító (tervező) feladatot ad a vezérigazgatónak, aki a következő munkanapon elsőként a részlegek között feladatokra bontja, és ha valami nem egyértelmű, jóváhagyási kérésben megkérdezi a tulajdonost.

A projektből kiadott feladatok és átvizsgálásaik a projekthez tartoznak (`project` mező), így a fülön látszik a projekt állása: hány feladat kész, mi van folyamatban, és van-e rád váró döntés.

## Döntés egy kapuról

A legegyszerűbb a vezérlőterem **Jóváhagyási panelje**: minden döntésre váró kérés kártyán látszik (ki kérte, melyik feladathoz, a teljes leírás és a hivatkozott fájlok).

- **✓ Jóváhagyom** vagy **✕ Elutasítom:** a GitHubon megnyit egy kész döntést. Írhatsz hozzá megjegyzést (elutasításnál kötelező), aztán Create / Submit. A `Döntés` munkafolyamat pár percen belül rögzíti, lezárja a kapu issue-ját, újraépíti a vezérlőtermet, és a megjegyzésedet beírja a `docs/core/tulajdonosi-iranymutatas.md` fájlba, amit minden agent követ.
- **Kérdezem a vezérigazgatót:** új beszélgetést nyit a döntésről, mielőtt határoznál.

A kapu issue-ján is dönthetsz: `/jóváhagyom [megjegyzés]` vagy `/elutasítom <indoklás>` hozzászólással, illetve a `jóváhagyva` / `elutasítva` címkével vagy a lezárással. Mindegyiket azonnal rögzíti a rendszer; ha valami miatt elmaradna, a következő munkanap pótolja. Csak a repó tulajdonosának döntései számítanak.

## Dizájn és márkázott változatok

A Dizájn részleg (dizájnvezető, UI dizájner, márkázási dizájner, grafikus) tervezi a kész szoftverek kinézetét: design system a `docs/design/` alatt, tokenekkel, amiket a frontend közvetlenül használ. Ha egy ügyfél a saját nevével és logójával kéri a szoftvert, a vezérlőterem **Kész szoftverek** fülén (vagy a Dizájn részleg lapján) a **Márkázott változat kérése** űrlap kitölt egy GitHub kérést; ebbe húzod bele a logót. A rendszer elmenti a `branding/<ügyfél>/` mappába, és a márkázási dizájner elkészíti az ügyfél témáját.

## Részleg ki- és bekapcsolása

A részleg lapján (kattints a részleg ikonjára a körben) kapcsolóval ki- és bekapcsolhatod a részleget (az Alicya Core kivételével). Kikapcsolva a részleg nem kap munkát és nem költ, a többi részleg nem vár rá, és az átvizsgálásai sem kellenek a feladatok lezárásához. Ha a chathez már összekapcsoltad a GitHubot, egy kattintás; különben a GitHubon kell elküldeni a kitöltött kérést. A `Döntés` munkafolyamat pár percen belül rögzíti.

## Kész szoftverek

Amikor a tulajdonos jóváhagy egy kiadási (`release`) kaput, a rendszer GitHub Release-t készít: a termék kódja, a kiadási jegyzet és a dokumentáció egy letölthető csomagban. A vezérlőterem **Kész szoftverek** fülén ezek letölthetők, alatta pedig termékvonalanként (ERP, Praxis) látszik, hol tart a munka a piackutatástól a kiadásig.

## Céges levelek (Posta)

A **Posta** munkafolyamat hétköznap 6 és 18 óra között félóránként megnézi a cég postafiókját IMAP-on. Minden új levélből a legolcsóbb modell kiszedi a lényeget: kategória (ajánlatkérés, megrendelés, támogatás, márkázás, pénzügy, jogi, partnerség, hírlevél), sürgősség, cég, kapcsolattartó, telefon, határidő, összegek, termékek, teendők. Ha teendő van, a megfelelő részleg kap feladatot (pl. ajánlatkérés → értékesítés, hiba → ügyfélsiker); a hírlevél nem kap.

A repó nyilvános, ezért a levelek titkosítva kerülnek a `state/inbox.enc.json` fájlba (AES-256-GCM, a kulcs az `INBOX_PASSPHRASE` jelmondatból). A feladattáblára csak személyes adat nélküli összefoglaló kerül; a teljes levelet az agent a `read_email` eszközzel olvassa, és csak azt, amelyik a feladatában szerepel. Választ nem küldhet: vázlatot ír, és kifelé menő kommunikációként jóváhagyást kér. A vezérlőterem **Posta** lapján a jelmondattal a böngészőben nyithatod meg a leveleket.

Bekötés (Settings → Secrets and variables → Actions → Secrets): `IMAP_HOST` (pl. `imap.gmail.com`), `IMAP_USER` (a teljes e-mail-cím), `IMAP_PASSWORD` (Gmailnél alkalmazásjelszó), `INBOX_PASSPHRASE` (szabadon választott, hosszú jelmondat). Nem kötelező: `IMAP_PORT` (alapból 993). Az első futás az elmúlt 14 nap leveleit dolgozza fel, utána csak az újakat, futásonként legfeljebb 25-öt.

## Beállítás

1. **API-kulcs:** Settings → Secrets and variables → Actions → New repository secret, név: `ANTHROPIC_API_KEY`. Kulcs nélkül a cég nem dolgozik, csak a táblát frissíti.
2. **Vezérlőterem:** Settings → Pages → Source: **GitHub Actions**. Utána futtasd a *Vezérlőterem* workflow-t.
3. **Pull request engedélyezése:** Settings → Actions → General → Workflow permissions → pipáld be az *Allow GitHub Actions to create and approve pull requests* opciót.
4. **Költségkeret (nem kötelező):** Settings → Secrets and variables → Actions → Variables:
   - `MONTHLY_BUDGET_USD` havi keret (alapértelmezés: 50)
   - `RUN_BUDGET_USD` egy munkanap kerete (alapértelmezés: 3)
   - `MAX_TASKS_PER_RUN` feladat munkanaponként (alapértelmezés: 6)
5. **Első indítás:** Actions → *Munkanap* → Run workflow. Ütemezve óránként ellenőrzi, hogy a munkarend szerint indulnia kell-e.

A keret elérésekor a cég leáll a hónap végéig.

## Beállítások fül

A vezérlőterem **Beállítások** lapján (a felső sor végén) kód és GitHub-menük nélkül állítható a cég:

- **AI-motorok:** szintenként (vezérigazgató, vezetők, munkatársak, tömeges munka) és agentenként is választható az Anthropic (Claude), az OpenAI vagy a Moonshot Kimi modellje, a gondolkodás mélységével együtt. A levelek feldolgozásához külön modell adható.
- **API-kulcsok:** a kulcs a böngészőben titkosítva, közvetlenül a GitHub titkai közé kerül (a repóba sosem íródik). Ehhez egy *fine-grained* GitHub-token kell ehhez a repóhoz, *Issues: Read and write* és *Secrets: Read and write* jogosultsággal (a lap alján kötheted be). Token nélkül a kulcsot kézzel add meg: Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MOONSHOT_API_KEY`.
- **Költségkeret:** havi, munkanaponkénti, feladatonkénti és chatválaszonkénti keret, feladatszám és lépésszám.
- **Munkarend:** mely napokon és hány órakor (budapesti idő) induljon munkanap; alapból hétköznap 8 és 16 órakor. A **szünet** kapcsolóval az ütemezett munka és a levélfeldolgozás áll; a chat és a döntések működnek.
- **Adatvédelem:** mely szolgáltatók kaphatnak személyes adatot (ügyféllevelet). Alapból az Anthropic és az OpenAI igen, a Kimi (kínai szolgáltató) nem; az ilyen motoron dolgozó agent csak személyes adat nélküli összefoglalót lát.
- **Posta**, **Részlegek** és **egyéni modellárak** (ha a listán nem szereplő modellt használsz).

Mentéskor a vezérlőterem egy jelölt issue-t nyit a változtatással; a következő döntésfeldolgozás (pár perc) beírja a `state/settings.json`-ba és lezárja az issue-t. Csak a repó tulajdonosának issue-ját fogadja el. A változás a következő munkanaptól érvényes. A beállítás erősebb a GitHub-változóknál, azok pedig az alapértéknél.

**Kimi:** a Moonshot fiókra legalább 10 USD feltöltés kell a használható sebességkorláthoz (a K3-hoz legalább 1 USD).

## Aréna: belső verseny az AI-motorok között

A vezérlőterem **Aréna** lapján látszik, melyik AI-motor dolgozik a legjobban és a leghatékonyabban.

- **Párbaj:** munkanaponként egy (a Beállításokban 0–5) feladatot egy másik motor is megold, árnyék-munkaterületen: a cég valódi fájljait olvassa, de amit ír, az nem kerül a cég munkájába, és az általa létrehozott feladatok sem kerülnek a táblára. A cég munkáját továbbra is a beállított motor („bajnok”) végzi.
- **Kihívó:** alapból a szerep szintjének és a szomszédos szinteknek ajánlott modellek közül az, amelyikhez van kulcs, és amelyik a bajnokkal a legkevesebbet mérkőzött. Így egyetlen Anthropic-kulccsal is van verseny (pl. Sonnet és Haiku), és kiderül, elég-e az olcsóbb motor. A Beállításokban versenyzők is kijelölhetők.
- **Bíró:** erős modell, lehetőleg olyan szolgáltatótól, amelyik nem versenyez; ha ilyen nincs, a két versenyző szolgáltatójának erős modellje egyszer-egyszer. Vakon (modellnév nélkül), kétszer, felcserélt sorrendben dönt; ha a két vélemény eltér, döntetlen. Csak akkor születik eredmény, ha mindkét vélemény megvan. Szempontok: teljesség, helyesség, szabálykövetés, hasznosság (1–10).
- **Rangsor:** Élő-pontszám (összesítve és feladattípusonként), győzelmek, átlagos minőség, költség feladatonként és hatékonyság (minőségpont / dollár). Szintenként ajánlást is ad, amelyet egy gombbal be lehet állítani.
- **Tanulás egymástól:** a jobb megoldásból a bíró legfeljebb három általános munkamódszert szűr le. Egy tanulság akkor lesz aktív, ha két különböző feladaton is igazolódott, vagy ha a tulajdonos az Aréna lapon jóváhagyja; addig „jóváhagyásra vár”. Személyes adatot vagy a szabályok megkerülésére szóló utasítást tartalmazó tanulságot a rendszer eldob. Minden agent a feladattípusához illő, legtöbbször megerősített hat aktív tanulságot kapja meg a rendszerpromptjában; a munkaszabályok és a kézikönyv ezeknél erősebbek. A nem tetsző tanulság kikapcsolható.
- **Keret:** a versenynek saját havi kerete van (alapból 5 USD), amely a cég havi keretébe is beleszámít. A kihívó a munkanap keretéből nem költheti el a bajnok és a bíró részét; ha valamelyik félnek mégis elfogy a kerete, a párbaj elmarad. Ügyféllevelet érintő feladat nem kerül versenybe, a kihívó személyes adatot nem kap, és ha a bajnok mégis ügyféllevelet olvasott, a párbaj elmarad.

Az eredmény a `state/arena.json` fájlban, a két megoldás pillanatképe a `state/arena/<párbaj>/` alatt van (a legutóbbi 40 párbajé).

## Fejlődés fül: tanulás és önfejlesztés

**Tanulás.** Minden munkanap végén a fejlődési vezető (új szerep a Core részlegben) átnézi a nap jelzéseit: mit dobott vissza egy átvizsgáló, mit utasítottál el, mi akadt el, hol maradt piros a teszt, és mi nem fért bele a keretbe. Ebből rövid tanulságokat ír egy-egy szerepnek, részlegnek vagy feladattípusnak, bizonyítékkal (feladatazonosítókkal), és a meglévőket megerősíti vagy visszavonja. A következő munkanaptól minden agent a hozzá illő, legtöbbször megerősített hat tanulságot kapja a rendszerpromptjában. Ha nem volt jelzés, nincs modellhívás. A tanulságok a `state/learning.json`-ban vannak; a Fejlődés fülön egyenként kikapcsolhatók.

**Önfejlesztés.** Ha egy hiba a cég működéséből fakad (hiányzó eszköz, rossz szabály, szűk keret), a fejlődési vezető vagy bármelyik vezető motorfejlesztési feladatot ad ki egy kódszerepnek (jellemzően a tech leadnek). Ez a feladat a valódi motort olvassa (`src/`, `company/`, `test/`, `dashboard/`), de amit ír, az csak javaslat a `state/motor/<feladat>/` alatt, a futó cég nem változik. A `show_changes` mutatja a diffet, a `run_checks` (`path: "motor"`) a motor típusellenőrzését és teljes tesztkészletét futtatja a homokozóban, és a kézikönyvet meg az adatvédelmi összefoglalót is újragenerálja. Csak zölden zárható, utána a kódellenőr és az appsec is átnézi. Ha mindketten jóváhagyták, a munkanap a változást háromutas összefésüléssel egy `alicya/motor-<feladat>` ágra teszi a mostani main fölé, és pull requestet nyit. **A main ágra csak akkor kerül, ha beolvasztod.** Ha a main közben ugyanott változott, a feladat az ütközésjelekkel visszamegy a fejlesztőhöz.

- A munkafolyamatokhoz (`.github/`), a függőségekhez (`package.json`) és a `scripts/`-hez az agentek nem nyúlhatnak.
- Ha a repóban nincs engedélyezve, hogy a GitHub Actions pull requestet nyisson (Settings → Actions → General → „Allow GitHub Actions to create and approve pull requests”), a munkanap egy issue-t nyit a kész összehasonlító linkkel; onnan egy kattintás a pull request.
- A GitHub Actions által feltöltött ágon a CI magától nem indul; a motor tesztjei a homokozóban már zölden futottak, beolvasztás előtt kézzel is elindíthatod az ágon (Actions → CI → Run workflow), a beolvasztás után pedig a main ágon magától lefut.
- Kikapcsolás: Fejlődés fül → Tanulás / Önfejlesztés.

## Modellek

Alapbeállítás (a Beállítások fülön módosítható):

| Kik | Modell | Gondolkodás |
|---|---|---|
| Vezérigazgató | `claude-opus-5-5` | közepes |
| Többi vezető (az architekt is) és munkatárs | `claude-sonnet-5-5` | közepes |
| Tömeg (dokumentáció, tartalom) | `claude-haiku-5-5` | alacsony |

Más szolgáltató modellje előtaggal adható meg: `openai:gpt-6.1-sol`, `kimi:kimi-k3`. GitHub-változóval is felülírható: `MODEL_STRATEGIC`, `MODEL_LEAD`, `MODEL_WORKER`, `MODEL_BULK`, `MODEL_INBOX`. Ha egy beállított modellhez hiányzik a kulcs, a cég nem dolgozik, csak a táblát frissíti, és a vezérlőterem megmutatja, melyik kulcs hiányzik. Egy feladat legfeljebb 8 kört és `TASK_BUDGET_USD` (alapból 0,60 USD) költést kap, egy kódfeladat 20 kört és 1,20 USD-t (`MAX_TURNS_PER_CODE_TASK`, `CODE_TASK_BUDGET_USD`, vagy a Beállítások fül); a keretnél az agent lezárja a munkát.

## Kódolvasás és fejlesztés az agenteknél

Minden agent látja és olvassa a kódot:

- `code_map`: a `product/` (vagy egy alkönyvtára) térképe: fájlok sorszámmal, exportok, osztályok, függvények, NestJS-végpontok, adatbázistáblák, npm-szkriptek.
- `search_code`: szöveg vagy reguláris kifejezés keresése, `fájl:sor: szöveg` találatokkal.
- `read_file`, `list_files`: a fájlok olvasása (hosszú fájl szeletekben).

A kódszerepek (fejlesztők, tesztelők, biztonság, adatbázis stb.) futtatni is tudják a kódot a `run_checks` eszközzel. Ez egy `product/` alatti projekten (ahol `package.json` van, pl. `product/backend`) lefuttatja a telepítést (`npm ci` vagy `npm install`, install szkriptek nélkül), a típusellenőrzést (`typecheck` szkript vagy `tsc --noEmit`), a lintet és a teszteket, és visszaadja a hibák kimenetét. Kódfeladatot csak akkor lehet lezárni, ha az érintett projekt az utolsó módosítás után zöld; az eredmény és a módosított fájlok listája az átvizsgálókhoz is eljut.

Csak rögzített parancsok futnak, szabad shell nincs. A GitHub Actionsben a munkanap egy külön, jog nélküli felhasználót (`alicya-sandbox`) hoz létre: a parancsok üres környezettel (titkok nélkül) futnak, a repó tokenjét nem látják, a telepítésen kívül nincs hálózatuk, lépésenként 5 perc, munkanaponként összesen 30 perc (`ALICYA_CHECKS_MINUTES`) az időkorlát. Ha ez a felhasználó nincs meg, az Actionsben a `run_checks` nem érhető el. Kikapcsolás: `ALICYA_CHECKS=off`.

## Biztonsági korlátok

- Az agenteknek nincs eszközük kifelé kommunikálni (e-mail, közösségi média, fizetés). Amit kifelé szánnak, vázlatként írják meg és jóváhagyást kérnek.
- Fájlt csak a `docs/` és `product/` alá írhatnak; a workflow-khoz, a motorhoz és a titkokhoz nem férnek hozzá.
- Az agentek által írt kódot csak a `run_checks` futtatja, rögzített parancsokkal, külön felhasználóként, titkok és (a telepítésen kívül) hálózat nélkül.
- Munkanaponként és havonta is van költségkorlát, és minden hívás költsége a `state/company.json` főkönyvében látszik.

## Fejlesztés

```bash
npm install
npm test            # tesztek hamis modellel, API-kulcs nélkül
npm run workday     # egy munkanap helyben (API-kulcs nélkül csak a táblát frissíti)
npm run build:dashboard && npx serve _site
npm run gate -- G-001 approve "megjegyzés"   # kapu eldöntése GitHub nélkül
```

Felépítés: `company/` a szervezet, `src/` a motor (`workday.ts` a belépési pont), `dashboard/` a vezérlőterem, `state/` a cég állapota, `docs/` és `product/` a munka eredménye.
