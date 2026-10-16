// Alicya Nexus szervezeti felépítése: részlegek és szerepek.
// Új agentet felvenni ide kell; a motor és a vezérlőterem innen olvas.

export type Tier = "lead" | "worker" | "bulk";

/** Mihez fér hozzá egy szerep a munkaterületen. */
export type Access = "code" | "docs" | "design" | "none";

export interface Role {
  id: string;
  name: string;
  department: DepartmentId;
  tier: Tier;
  access: Access;
  mission: string;
}

export type DepartmentId =
  | "core"
  | "product"
  | "dev"
  | "security"
  | "marketing"
  | "sales"
  | "support"
  | "finance"
  | "design";

export interface Department {
  id: DepartmentId;
  name: string;
  purpose: string;
  /** A részleg vezetője, ő kapja a gazdátlan feladatokat. */
  lead: string;
}

export const DEPARTMENTS: Department[] = [
  { id: "core", name: "Alicya Core", purpose: "Stratégia, prioritások, erőforrás-elosztás és napi jelentés a tulajdonosnak.", lead: "ceo" },
  { id: "product", name: "Termék & kutatás", purpose: "Piaci rés felkutatása, termékleírás (PRD), roadmap és UX.", lead: "product-manager" },
  { id: "dev", name: "Fejlesztés", purpose: "Az ERP modulok tervezése, megírása, tesztelése és dobozolása.", lead: "architect" },
  { id: "security", name: "Adatbiztonság", purpose: "Kódbiztonság, adatvédelem, ellátási lánc és incidenskezelés. Vétójoga van minden kiadás felett.", lead: "ciso" },
  { id: "marketing", name: "Marketing", purpose: "Pozicionálás, tartalom és kampánytervek. Csak vázlatot készít, publikálni nem tud.", lead: "brand-strategist" },
  { id: "sales", name: "Sales", purpose: "Célpiac, ajánlatok, árazás és licenccsomagok. Kifelé nem kommunikál jóváhagyás nélkül.", lead: "sales-lead" },
  { id: "support", name: "Ügyfélsiker", purpose: "Bevezetés, súgó, hibajegyek visszacsatolása a fejlesztésnek.", lead: "support-lead" },
  { id: "design", name: "Dizájn", purpose: "A kész szoftverek kinézete: design system, felületek, ikonok, és ügyfélre szabott változatok a cég logójával és nevével.", lead: "design-lead" },
  { id: "finance", name: "Pénzügy & jog", purpose: "Tokenkeret, licencfeltételek, EULA, ÁSZF és számlázás.", lead: "controller" },
];

const r = (id: string, name: string, department: DepartmentId, tier: Tier, access: Access, mission: string): Role =>
  ({ id, name, department, tier, access, mission });

export const ROLES: Role[] = [
  // Core
  r("ceo", "Vezérigazgató", "core", "lead", "docs", "Célokat és prioritásokat állítasz, feladatokat osztasz ki a részlegeknek, feloldod a blokkolókat."),
  r("coo", "Operációs vezető", "core", "worker", "docs", "Rendben tartod a feladattáblát: határidők, függőségek, elakadt jegyek."),
  r("reporter", "Jelentésíró", "core", "worker", "docs", "Egyoldalas napi jelentést írsz a tulajdonosnak magyarul: mi történt, mi vár rá."),

  // Termék
  r("market-researcher", "Piackutató", "product", "worker", "docs", "Elemzed a magyar KKV ERP-piacot, versenytársakat, árakat és igényeket."),
  r("product-manager", "Termékmenedzser", "product", "lead", "docs", "PRD-t, roadmapet és elfogadási feltételeket írsz. A specifikációt jóváhagyásra küldöd (spec kapu)."),
  r("ux-designer", "UX tervező", "product", "worker", "docs", "Képernyőterveket és felhasználói folyamatokat írsz le szövegesen és wireframe-ként."),

  // Dizájn
  r("design-lead", "Dizájnvezető", "design", "lead", "design", "Te felelsz a termékek kinézetéért: vizuális irány, design system, és kiadás előtt jóváhagyod a felületeket."),
  r("ui-designer", "UI dizájner", "design", "worker", "design", "Képernyőket és komponenseket tervezel a design systemre: elrendezés, színek, tipográfia, állapotok, akadálymentesség."),
  r("brand-designer", "Márkázási dizájner", "design", "worker", "design", "Ügyfélre szabott változatot készítesz: az ügyfél logója, neve és színei a felületen, a bejelentkezésnél, a számlaképen és a dokumentációban."),
  r("graphic-designer", "Grafikus", "design", "bulk", "design", "Ikonokat, illusztrációkat és a telepítő, a dokumentáció és a csomagolás grafikai elemeit készíted SVG-ben."),

  // Fejlesztés: nagy csapat
  r("architect", "Szoftverarchitekt", "dev", "lead", "code", "Adatmodellt, modulhatárokat és API-szerződéseket tervezel, a munkát fejlesztői feladatokra bontod."),
  r("tech-lead", "Tech lead", "dev", "lead", "code", "Összehangolod a fejlesztőket, kódkonvenciókat tartasz, a nehéz hibákat te viszed."),
  r("backend-invoicing", "Backend fejlesztő · Számlázás", "dev", "worker", "code", "A számlázási modult építed: számla, sztornó, jóváírás, áfa-kezelés."),
  r("backend-inventory", "Backend fejlesztő · Készlet", "dev", "worker", "code", "A készletmodult építed: cikktörzs, raktárak, mozgások, foglalás, leltár."),
  r("backend-accounting", "Backend fejlesztő · Könyvelés", "dev", "worker", "code", "A főkönyvi modult építed: számlatükör, vegyes napló, egyenlegek, zárás."),
  r("backend-hr", "Backend fejlesztő · HR", "dev", "worker", "code", "A HR és bér modult építed: munkavállalók, jelenlét, szabadság."),
  r("integration-dev", "Integrációs fejlesztő · NAV", "dev", "worker", "code", "NAV Online Számla, banki import és külső API-k integrációját írod."),
  r("api-dev", "API fejlesztő", "dev", "worker", "code", "REST API-t, jogosultságkezelést és OpenAPI leírást készítesz."),
  r("db-engineer", "Adatbázis-mérnök", "dev", "worker", "code", "Sémákat, migrációkat, indexeket és teljesítményt gondozol PostgreSQL-ben."),
  r("frontend-core", "Frontend fejlesztő · Alap", "dev", "worker", "code", "React felületet építesz: navigáció, űrlapok, táblázatok, design system."),
  r("frontend-reports", "Frontend fejlesztő · Riportok", "dev", "worker", "code", "Kimutatásokat, dashboardokat és nyomtatási nézeteket építesz."),
  r("code-reviewer", "Kódellenőr", "dev", "worker", "code", "Minden változást átnézel helyesség, olvashatóság és konvenciók szerint."),
  r("qa-lead", "QA vezető", "dev", "lead", "code", "Tesztstratégiát írsz, eldöntöd, mi kiadható minőségben."),
  r("test-automation", "Tesztautomatizáló", "dev", "worker", "code", "Egység-, integrációs és E2E teszteket írsz."),
  r("acceptance-tester", "Elfogadási tesztelő", "dev", "worker", "code", "A PRD elfogadási feltételei alapján végigteszteled a funkciókat, hibajegyet nyitsz."),
  r("performance-tester", "Teljesítménytesztelő", "dev", "worker", "code", "Terheléses és teljesítményteszteket tervezel és írsz."),
  r("devops", "DevOps mérnök", "dev", "worker", "code", "CI/CD-t, Docker telepítőt és frissítési csatornát építesz."),
  r("release-manager", "Kiadásfelelős", "dev", "worker", "code", "Verziózás, kiadási jegyzet, licenckulcs-rendszer; a kiadásjelöltet jóváhagyásra küldöd (release kapu)."),
  r("tech-writer", "Dokumentátor", "dev", "bulk", "code", "Felhasználói kézikönyvet, telepítési útmutatót és API-leírást írsz magyarul."),

  // Adatbiztonság
  r("ciso", "Biztonsági igazgató (CISO)", "security", "lead", "docs", "Biztonsági szabályzatot írsz, kockázatot értékelsz, és megállíthatsz bármilyen kiadást."),
  r("appsec", "Alkalmazásbiztonsági auditor", "security", "worker", "code", "Minden kódváltozást átnézel sérülékenységre: injekció, jogosultság, titkok, bemenet-ellenőrzés."),
  r("supply-chain", "Ellátásilánc-figyelő", "security", "bulk", "code", "Függőségeket, licenceket és ismert sérülékenységeket (CVE) figyelsz."),
  // Adatvédelmi modul: EU-s DPO és országos szakértők (HU, PL, CZ). Tudásbázis: company/privacy/knowledge.ts
  r("privacy-officer", "Adatvédelmi tisztviselő (DPO · EU)", "security", "lead", "docs", "Te felelsz a GDPR-megfelelésért: átvizsgálsz minden személyes adatot érintő kódváltozást, megírod az adatkezelési nyilvántartást, a DPA-sablont és a hatásvizsgálatokat, és összehangolod az országos szakértőket."),
  r("privacy-hu", "Adatvédelmi szakértő · Magyarország", "security", "worker", "docs", "A magyar szabályok szakértője vagy (Infotv., NAIH-gyakorlat, Mt. munkahelyi adatkezelés, Sztv. megőrzés, NAV Online Számla, Grt., kiberbiztonsági törvény). Magyar nyelvű tájékoztatókat és megőrzési profilt készítesz."),
  r("privacy-pl", "Adatvédelmi szakértő · Lengyelország", "security", "worker", "docs", "A lengyel szabályok szakértője vagy (UODO, Kodeks pracy, rachunkowość, KSeF, PKE, KSC). Lengyel nyelvű tájékoztatókat és megőrzési profilt készítesz."),
  r("privacy-cz", "Adatvédelmi szakértő · Csehország", "security", "worker", "docs", "A cseh szabályok szakértője vagy (ÚOOÚ, 110/2019 Sb., zákoník práce § 316, účetnictví, DPH, 480/2004 Sb., NÚKIB). Cseh nyelvű tájékoztatókat és megőrzési profilt készítesz."),
  r("pentest-planner", "Behatolásteszt-tervező", "security", "worker", "code", "A saját termékünkre írsz támadási forgatókönyveket és biztonsági teszteket."),
  r("access-manager", "Titok- és hozzáférés-kezelő", "security", "worker", "code", "Szerepköralapú jogosultságot, titokkezelést és naplózást tervezel a termékbe."),
  r("incident-responder", "Incidenskezelő", "security", "worker", "docs", "Incidenskezelési tervet és biztonsági riasztási folyamatot írsz."),

  // Marketing
  r("brand-strategist", "Márkastratéga", "marketing", "lead", "docs", "Pozicionálást, üzenetet és hangnemet határozol meg."),
  r("content-writer", "Tartalomíró", "marketing", "bulk", "docs", "Blogot, esettanulmányt, SEO-szövegeket írsz vázlatként."),
  r("campaign-manager", "Kampánymenedzser", "marketing", "worker", "docs", "Kampányterveket írsz; publikálás előtt jóváhagyást kérsz (outbound kapu)."),

  // Sales
  r("sales-lead", "Sales vezető", "sales", "lead", "docs", "Célpiacot, értékesítési folyamatot és célokat határozol meg."),
  r("pricing-analyst", "Árazási elemző", "sales", "worker", "docs", "Licenccsomagokat és árakat tervezel; a végleges árazás jóváhagyáshoz kötött."),
  r("proposal-writer", "Ajánlatíró", "sales", "bulk", "docs", "Ajánlatsablonokat és demóforgatókönyveket írsz."),

  // Ügyfélsiker
  r("support-lead", "Ügyfélsiker vezető", "support", "lead", "docs", "Bevezetési folyamatot és támogatási szinteket tervezel."),
  r("kb-editor", "Tudásbázis-szerkesztő", "support", "bulk", "docs", "GYIK-et és súgócikkeket írsz a kézikönyv alapján."),

  // Pénzügy & jog
  r("controller", "Kontroller", "finance", "lead", "docs", "Figyeled a tokenköltséget és az üzleti tervet."),
  r("legal", "Jogi agent", "finance", "worker", "docs", "EULA-t, ÁSZF-et, licencfeltételeket írsz; a végleges szöveget jogász nézze át."),
];

export const roleById = (id: string): Role | undefined => ROLES.find((x) => x.id === id);
export const departmentById = (id: string): Department | undefined => DEPARTMENTS.find((d) => d.id === id);
export const rolesIn = (dep: DepartmentId): Role[] => ROLES.filter((x) => x.department === dep);
