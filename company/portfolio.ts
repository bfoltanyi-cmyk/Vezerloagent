// Az ACHIEVE-R termékportfóliója és piacai. Az Alicya Nexus (a cég agentekből álló ügynöksége) ebből
// tudja, mit gyárt a cég és kinek. Új termékvonalat vagy országot ide kell felvenni; a motor (kézikönyv,
// kiadás, posta) és a vezérlőterem innen olvas.

export const COMPANY = {
  name: "ACHIEVE-R",
  agency: "Alicya Nexus",
  tagline: "B2B szoftvercég a közép-európai régióra: saját SaaS és dobozos termékek, elég nagy megrendelésnél egyedi fejlesztés.",
};

export interface Market {
  /** ISO 3166-1 alpha-2, kisbetűvel. */
  id: string;
  name: string;
  currency: string;
  status: "active" | "planned";
  /** Ami országonként más: e-számlázás, hatóság, nyelv. */
  note: string;
}

/** Piacok a belépés sorrendjében. Az első az aktív; a többi akkor lesz aktív, ha van országcsomagja. */
export const MARKETS: Market[] = [
  { id: "hu", name: "Magyarország", currency: "HUF", status: "active", note: "első piac; NAV Online Számla, NAIH, magyar nyelv" },
  { id: "sk", name: "Szlovákia", currency: "EUR", status: "planned", note: "e-számlázás (eFaktúra), ÚOOÚ SR, szlovák nyelv" },
  { id: "pl", name: "Lengyelország", currency: "PLN", status: "planned", note: "KSeF, UODO, lengyel nyelv" },
  { id: "at", name: "Ausztria", currency: "EUR", status: "planned", note: "DSB, német nyelv, osztrák számviteli szabályok" },
  { id: "cz", name: "Csehország", currency: "CZK", status: "planned", note: "ÚOOÚ, cseh nyelv, cseh áfa-szabályok" },
];

export type ProductKind = "saas" | "boxed" | "custom";
export type ProductStatus = "live" | "build" | "spec" | "idea";

export interface Product {
  id: string;
  name: string;
  kind: ProductKind;
  status: ProductStatus;
  /** Kinek készül. */
  audience: string;
  summary: string;
  /** Hol él a kódja. Ha nincs, a product/ alá kerül ebben a repóban. */
  repo?: string;
  /** Szöveg (feladatcím, kapu, levél) alapján ehhez a vonalhoz sorolunk. */
  match: RegExp;
}

export const PRODUCTS: Product[] = [
  {
    id: "hld",
    name: "ACHIEVE-R HLD",
    kind: "saas",
    status: "live",
    audience: "értékesítési csapatok, B2B cégek",
    summary: "Piackutató és lead-generáló SaaS: szegmens → keresés a bekötött forrásokban → AI-mélykutatás forrással igazolt tényekkel → ICP-pontszám → CRM (Pipedrive, miniCRM) vagy export.",
    repo: "külön repó (Next.js + Supabase), M0–M5 kész",
    match: /\bhld\b|lead-?gener|piackutat/i,
  },
  {
    id: "praxis",
    name: "Alicya Praxis",
    kind: "boxed",
    status: "idea",
    audience: "magánrendelők",
    summary: "Praxiskezelő: időpont, páciensnyilvántartás, számlázás, EESZT-kapcsolat. Egészségügyi adat: csak külön jogi átvilágítás után indul.",
    match: /praxis|rendel[őo]|eeszt/i,
  },
  {
    id: "erp",
    name: "Alicya ERP",
    kind: "boxed",
    status: "spec",
    audience: "kis- és középvállalkozások",
    summary: "Dobozos vállalatirányítás: Start (számlázás + készlet), Pro (+ könyvelés, HR), Enterprise (+ API, több cég, SSO). NAV Online Számla, KSeF.",
    match: /\berp\b|számláz|készlet|könyvel/i,
  },
];

/** Ami egyik vonalra sem illik, ide tartozik. */
export const DEFAULT_PRODUCT = "erp";

/** Amire a cég most fókuszál; a napi tervezés ezt veszi alapul. A tulajdonosi iránymutatás felülírhatja. */
export const CURRENT_FOCUS = "Alicya ERP Start (számlázás + készlet) a magyar piacra, és az ACHIEVE-R HLD értékesítése.";

export const CUSTOM_WORK =
  "Egyedi fejlesztést csak elég nagy megrendelésre vállalunk (a küszöböt a tulajdonosi iránymutatás adja meg); alatta SaaS vagy dobozos terméket ajánlunk. Egyedi megrendelés projektlapként ugyanezen a gyártósoron megy végig.";

export const productById = (id: string): Product | undefined => PRODUCTS.find((p) => p.id === id);
export const productOf = (text: string): Product => PRODUCTS.find((p) => p.match.test(text)) ?? productById(DEFAULT_PRODUCT)!;
export const activeMarkets = (): Market[] => MARKETS.filter((m) => m.status === "active");
export const marketNames = (): string => MARKETS.map((m) => m.name).join(", ");

const STATUS_HU: Record<ProductStatus, string> = { live: "él, eladható", build: "fejlesztés alatt", spec: "specifikáció", idea: "ötlet" };
const KIND_HU: Record<ProductKind, string> = { saas: "SaaS", boxed: "dobozos", custom: "egyedi" };

/** Egy sor termékenként a kézikönyvbe és a rendszerpromptba. */
export const productLine = (p: Product): string =>
  `${p.name} (${KIND_HU[p.kind]}, ${STATUS_HU[p.status]}) – ${p.audience}: ${p.summary}${p.repo ? ` Kód: ${p.repo}.` : ""}`;

/** A cég bemutatása az agentek rendszerpromptjához. */
export function companyIntro(): string {
  const active = activeMarkets().map((m) => m.name).join(", ");
  const planned = MARKETS.filter((m) => m.status === "planned").map((m) => m.name).join(", ");
  return [
    `Te a(z) ${COMPANY.agency} nevű, agentekből álló ügynökség egyik munkatársa vagy; az ügynökség az ${COMPANY.name} szoftvercég fejlesztését, megrendeléseit és marketingjét viszi.`,
    COMPANY.tagline,
    `Aktív piac: ${active}. Következő piacok ebben a sorrendben: ${planned}.`,
    `Termékvonalak: ${PRODUCTS.map((p) => `${p.name} (${KIND_HU[p.kind]}, ${STATUS_HU[p.status]})`).join("; ")}.`,
    `Fókusz most: ${CURRENT_FOCUS}`,
  ].join("\n");
}
