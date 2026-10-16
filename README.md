# Alicya Nexus

Egy agentekből álló szoftverház, amely önállóan dolgozik egy dobozosan eladható vállalatirányítási (ERP) szoftveren magyar, lengyel és cseh kis- és középvállalkozásoknak. Nyolc részlegben 45 Claude agent dolgozik, közös feladattáblán. A tulajdonos (te) csak a kritikus pontokon dönt.

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

Minden agent a rendszerpromptjában kapja meg a cég kézikönyvét: mit jelent nálunk a dobozos termék (telepítő, licenckulcsos kiadások, frissítés, HU/PL/CZ lokalizáció), a termék nyolc fázisú életciklusát a kapukkal, a részlege munkarendjét, a saját bemenetét, kimenetét és azt, hogy kinek adja tovább a munkát. Forrás: [`company/playbook.ts`](company/playbook.ts), olvasható formában [`docs/core/kezikonyv.md`](docs/core/kezikonyv.md). Módosítás után futtasd az `npm run build:handbook` parancsot.

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

## Döntés egy kapuról

A legegyszerűbb a vezérlőterem **Jóváhagyási panelje**: minden döntésre váró kérés kártyán látszik (ki kérte, melyik feladathoz, a teljes leírás és a hivatkozott fájlok).

- **✓ Jóváhagyom** vagy **✕ Elutasítom:** a GitHubon megnyit egy kész döntést. Írhatsz hozzá megjegyzést (elutasításnál kötelező), aztán Create / Submit. A `Döntés` munkafolyamat pár percen belül rögzíti, lezárja a kapu issue-ját, újraépíti a vezérlőtermet, és a megjegyzésedet beírja a `docs/core/tulajdonosi-iranymutatas.md` fájlba, amit minden agent követ.
- **Kérdezem a vezérigazgatót:** új beszélgetést nyit a döntésről, mielőtt határoznál.

A kapu issue-ján is dönthetsz: `/jóváhagyom [megjegyzés]` vagy `/elutasítom <indoklás>` hozzászólással, illetve a `jóváhagyva` / `elutasítva` címkével vagy a lezárással. Mindegyiket azonnal rögzíti a rendszer; ha valami miatt elmaradna, a következő munkanap pótolja. Csak a repó tulajdonosának döntései számítanak.

## Részleg ki- és bekapcsolása

A részleg lapján (kattints a részleg ikonjára a körben) kapcsolóval ki- és bekapcsolhatod a részleget (az Alicya Core kivételével). Kikapcsolva a részleg nem kap munkát és nem költ, a többi részleg nem vár rá, és az átvizsgálásai sem kellenek a feladatok lezárásához. Ha a chathez már összekapcsoltad a GitHubot, egy kattintás; különben a GitHubon kell elküldeni a kitöltött kérést. A `Döntés` munkafolyamat pár percen belül rögzíti.

## Kész szoftverek

Amikor a tulajdonos jóváhagy egy kiadási (`release`) kaput, a rendszer GitHub Release-t készít: a termék kódja, a kiadási jegyzet és a dokumentáció egy letölthető csomagban. A vezérlőterem **Kész szoftverek** fülén ezek letölthetők, alatta pedig termékvonalanként (ERP, Praxis) látszik, hol tart a munka a piackutatástól a kiadásig.

## Beállítás

1. **API-kulcs:** Settings → Secrets and variables → Actions → New repository secret, név: `ANTHROPIC_API_KEY`. Kulcs nélkül a cég nem dolgozik, csak a táblát frissíti.
2. **Vezérlőterem:** Settings → Pages → Source: **GitHub Actions**. Utána futtasd a *Vezérlőterem* workflow-t.
3. **Pull request engedélyezése:** Settings → Actions → General → Workflow permissions → pipáld be az *Allow GitHub Actions to create and approve pull requests* opciót.
4. **Költségkeret (nem kötelező):** Settings → Secrets and variables → Actions → Variables:
   - `MONTHLY_BUDGET_USD` havi keret (alapértelmezés: 50)
   - `RUN_BUDGET_USD` egy munkanap kerete (alapértelmezés: 3)
   - `MAX_TASKS_PER_RUN` feladat munkanaponként (alapértelmezés: 6)
5. **Első indítás:** Actions → *Munkanap* → Run workflow.

A keret elérésekor a cég leáll a hónap végéig.

## Modellek

| Kik | Modell | Erőfeszítés |
|---|---|---|
| Vezérigazgató | `claude-opus-5-5` | közepes |
| Többi vezető (az architekt is) és munkatárs | `claude-sonnet-5-5` | közepes |
| Tömeg (dokumentáció, tartalom) | `claude-haiku-5-5` | alacsony |

Felülírható a `MODEL_STRATEGIC`, `MODEL_LEAD`, `MODEL_WORKER`, `MODEL_BULK` környezeti változókkal. Egy feladat legfeljebb 8 kört és `TASK_BUDGET_USD` (alapból 0,60 USD) költést kap; a keretnél az agent lezárja a munkát. Az Opus és Sonnet hívások szerveroldali tartalék modellt használnak, ha a modell biztonsági okból visszautasítana egy kérést.

## Biztonsági korlátok

- Az agenteknek nincs eszközük kifelé kommunikálni (e-mail, közösségi média, fizetés). Amit kifelé szánnak, vázlatként írják meg és jóváhagyást kérnek.
- Fájlt csak a `docs/` és `product/` alá írhatnak; a workflow-khoz, a motorhoz és a titkokhoz nem férnek hozzá.
- Az agentek által írt kódot a munkanap nem futtatja.
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
