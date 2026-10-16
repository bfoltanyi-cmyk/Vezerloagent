// Ügyfélre szabott (márkázott) változat kérése. A vezérlőteremből egy kitöltött GitHub issue
// érkezik a cég nevével és a feltöltött logóval; ebből lesz a branding/<ügyfél>/ mappa és
// egy feladat a dizájncsapatnak.

import fs from "node:fs";
import path from "node:path";
import { createTask, logEvent } from "./board.js";
import type { Gh } from "./gates.js";
import type { CompanyState } from "./types.js";

export const BRANDING_MARKER = "<!-- alicya-markazas -->";
const MAX_LOGO_BYTES = 5_000_000;
const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp", "image/gif": "gif" };

export interface BrandingRequest {
  company: string;
  product: string;
  colors: string;
  contact: string;
  note: string;
  images: string[];
}

const field = (body: string, name: string) => (new RegExp(`^\\s*\\**${name}:?\\**:?\\s*(.*)$`, "im").exec(body)?.[1] ?? "").trim();

export function parseBrandingIssue(body: string): BrandingRequest | null {
  if (!(body ?? "").includes(BRANDING_MARKER)) return null;
  const images = [
    ...[...body.matchAll(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g)].map((m) => m[1]!),
    ...[...body.matchAll(/<img[^>]+src="(https:\/\/[^"]+)"/g)].map((m) => m[1]!),
  ].filter((u) => {
    // Csak a GitHubra feltöltött képeket töltjük le.
    try {
      const h = new URL(u).hostname;
      return h === "github.com" || h.endsWith(".githubusercontent.com");
    } catch {
      return false;
    }
  });
  return {
    company: field(body, "Cégnév"),
    product: field(body, "Termék"),
    colors: field(body, "Színek"),
    contact: field(body, "Kapcsolattartó"),
    note: field(body, "Megjegyzés"),
    images: [...new Set(images)],
  };
}

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "ugyfel";
}

type Fetch = (url: string) => Promise<{ ok: boolean; headers: { get(n: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;

/** Egy kérés feldolgozása: logók letöltése, brand.json, feladat a márkázási dizájnernek. */
export async function applyBranding(s: CompanyState, root: string, req: BrandingRequest, issueNumber: number, fetchImpl: Fetch, now = new Date()): Promise<string> {
  if (!req.company) return "Nem találom a cég nevét a kérésben (Cégnév: …), így nem tudtam rögzíteni.";
  const slug = slugify(req.company);
  const dir = path.join(root, "branding", slug);
  fs.mkdirSync(dir, { recursive: true });
  const logos: string[] = [];
  for (const [i, url] of req.images.entries()) {
    try {
      const r = await fetchImpl(url);
      const type = (r.headers.get("content-type") ?? "").split(";")[0]!.trim();
      const ext = IMAGE_EXT[type];
      if (!r.ok || !ext) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_LOGO_BYTES) continue;
      const file = `logo${i ? `-${i + 1}` : ""}.${ext}`;
      fs.writeFileSync(path.join(dir, file), buf);
      logos.push(file);
    } catch {
      // Egy hibás kép nem állítja meg a többit.
    }
  }
  const brand = { company: req.company, product: req.product || "Alicya ERP", colors: req.colors, contact: req.contact, note: req.note, logos, requestedAt: now.toISOString(), issue: issueNumber };
  fs.writeFileSync(path.join(dir, "brand.json"), JSON.stringify(brand, null, 2) + "\n");
  const t = createTask(
    s,
    {
      title: `Márkázott változat: ${req.company}`,
      description: `A tulajdonos márkázott változatot kért a(z) ${brand.product} termékből ennek a cégnek: ${req.company}.
Adatok: branding/${slug}/brand.json${logos.length ? `, logó: ${logos.map((l) => `branding/${slug}/${l}`).join(", ")}` : " (logó nem érkezett; kérj a tulajdonostól, addig a cégnévvel dolgozz)"}.
${req.colors ? `Kért színek: ${req.colors}.\n` : ""}${req.note ? `Megjegyzés: ${req.note}\n` : ""}
Készítsd el a branding/${slug}/theme.json fájlt (színtokenek a design systemre építve, logóhasználat, kontrasztellenőrzés) és a branding/${slug}/README.md-t: hol jelenik meg a logó és a név (fejléc, bejelentkezés, számlakép, dokumentáció borítója), mit kell a frontendnek tennie hozzá.`,
      department: "design",
      assignee: "brand-designer",
      priority: 2,
    },
    "owner",
    now,
  );
  logEvent(s, { actor: "owner", department: "design", kind: "info", text: `Márkázási kérés: ${req.company} (${logos.length} logó feltöltve) → ${t.id}` }, now);
  return `Rögzítettem: ${req.company} márkázott változata a dizájncsapathoz került (${t.id}). ${logos.length ? `${logos.length} logót mentettem a branding/${slug}/ mappába.` : "Logót nem találtam a kérésben; ha van, töltsd fel egy új kérésben."}`;
}

/** A tulajdonos nyitott márkázási kéréseinek feldolgozása és lezárása. */
export async function sweepBrandingIssues(s: CompanyState, root: string, gh: Gh, owner: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<string[]> {
  if (!owner) return [];
  const list = JSON.parse(gh(["issue", "list", "--state", "open", "--author", owner, "--limit", "100", "--json", "number,body"])) as { number: number; body: string }[];
  const out: string[] = [];
  for (const i of list) {
    const req = parseBrandingIssue(i.body);
    if (!req) continue;
    const msg = await applyBranding(s, root, req, i.number, fetchImpl);
    gh(["issue", "close", String(i.number), "--reason", "completed", "--comment", msg]);
    out.push(msg);
  }
  return out;
}
