// Új projekt a tulajdonostól. A vezérlőterem Projektek fülén leírja, mi a feladat és mikor kész;
// ebből egy jelölt issue lesz, amelyet a Döntés munkafolyamat (és a munkanap) feldolgoz:
// projektlap a docs/projektek/ alá, bejegyzés a state/projects.json-ba, és egy indító
// feladat a vezérigazgatónak, aki a projektet a részlegek között feladatokra bontja.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DEPARTMENTS } from "../company/org.js";
import { createTask, logEvent } from "./board.js";
import { slugify } from "./branding.js";
import type { Gh } from "./gates.js";
import type { CompanyState } from "./types.js";

export const PROJECT_MARKER = "<!-- alicya-projekt -->";
export const PROJECTS_FILE = "state/projects.json";
export const PROJECT_DOCS = "docs/projektek";

const depIds = DEPARTMENTS.map((d) => d.id) as [string, ...string[]];
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const projectRequest = z
  .object({
    nev: text(3, 120),
    cel: text(10, 8000),
    eredmeny: text(0, 4000).default(""),
    megkotesek: text(0, 4000).default(""),
    reszleg: z.enum(depIds).or(z.literal("")).default(""),
    prioritas: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
    hatarido: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  })
  .strict();
export type ProjectRequest = z.infer<typeof projectRequest>;

export interface Project {
  id: string;
  title: string;
  goal: string;
  done: string;
  constraints: string;
  department: string;
  priority: 1 | 2 | 3;
  deadline: string;
  createdAt: string;
  issue?: number;
  /** A vezérigazgató indító (tervező) feladata. */
  kickoff: string;
  /** A projektlap a docs/ alatt. */
  doc: string;
}

export interface ProjectsFile {
  version: 1;
  next: number;
  projects: Project[];
}

export function loadProjects(root: string): ProjectsFile {
  try {
    const f = JSON.parse(fs.readFileSync(path.join(root, PROJECTS_FILE), "utf8")) as ProjectsFile;
    return f && f.version === 1 && Array.isArray(f.projects) ? f : { version: 1, next: 1, projects: [] };
  } catch {
    return { version: 1, next: 1, projects: [] };
  }
}

function saveProjects(root: string, f: ProjectsFile): void {
  const file = path.join(root, PROJECTS_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(f, null, 2) + "\n");
}

/**
 * A kérés kinyerése az issue szövegéből: a jelölő utáni JSON-blokk. A blokkon kívül írt szöveg
 * (pl. amit a tulajdonos a GitHubon még hozzáírt) kiegészítésként a leíráshoz kerül.
 */
export function parseProjectIssue(body: string): { request: ProjectRequest } | { error: string } | null {
  if (!(body ?? "").includes(PROJECT_MARKER)) return null;
  const rest = body.slice(body.indexOf(PROJECT_MARKER));
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(rest);
  if (!m) return { error: "Nem találtam a projekt adatait (JSON-blokk) a kérésben." };
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]!);
  } catch {
    return { error: "A projekt adatai nem érvényes JSON-ban érkeztek." };
  }
  const p = projectRequest.safeParse(raw);
  if (!p.success) return { error: `A projekt adatai hibásak, nem rögzítettem: ${p.error.issues.map((i) => `${i.path.join(".") || "kérés"}: ${i.message}`).join("; ")}` };
  const extra = rest.replace(m[0], "").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (extra) p.data.cel = `${p.data.cel}\n\nKiegészítés: ${extra}`.slice(0, 12000);
  return { request: p.data };
}

const PRIO = { 1: "sürgős", 2: "normál", 3: "ráér" } as const;
const depName = (id: string) => DEPARTMENTS.find((d) => d.id === id)?.name ?? id;

function brief(id: string, r: ProjectRequest, now: Date): string {
  return `# ${id} · ${r.nev}

A tulajdonos projektje, ${now.toISOString().slice(0, 10)}. Prioritás: ${PRIO[r.prioritas]}.${r.hatarido ? ` Határidő: ${r.hatarido}.` : ""}${r.reszleg ? ` Fő felelős részleg: ${depName(r.reszleg)}.` : ""}

## Mi a feladat

${r.cel}

## Mikor kész, mit vár el a tulajdonos

${r.eredmeny || "(Nem adta meg; a vezérigazgató a terv elején javasol elfogadási feltételeket.)"}

## Megkötések

${r.megkotesek || "(Nincs külön megkötés; a cég szabályai érvényesek.)"}
`;
}

/** Egy projekt rögzítése: projektlap, nyilvántartás, indító feladat a vezérigazgatónak. */
export function applyProject(s: CompanyState, root: string, r: ProjectRequest, issue?: number, now = new Date()): string {
  const f = loadProjects(root);
  if (issue !== undefined) {
    const dup = f.projects.find((p) => p.issue === issue);
    if (dup) return `Ezt a projektet már rögzítettem (${dup.id}).`;
  }
  const id = `P-${String(f.next++).padStart(3, "0")}`;
  const doc = `${PROJECT_DOCS}/${id}-${slugify(r.nev)}.md`;
  fs.mkdirSync(path.join(root, PROJECT_DOCS), { recursive: true });
  fs.writeFileSync(path.join(root, doc), brief(id, r, now));
  const t = createTask(
    s,
    {
      title: `Projekt indítása: ${r.nev}`,
      description: `A tulajdonos új projektet adott ki (${id}). A teljes leírás: ${doc}. Olvasd el figyelmesen.

Mi a feladat (röviden): ${r.cel.slice(0, 1500)}
${r.eredmeny ? `Mikor kész: ${r.eredmeny.slice(0, 800)}\n` : ""}${r.hatarido ? `Határidő: ${r.hatarido}.\n` : ""}${r.reszleg ? `Fő felelős részleg: ${depName(r.reszleg)}.\n` : ""}
Teendőd:
1. Ha a leírásból hiányzik valami, ami nélkül nem lehet jól elindulni, kérdezd meg a tulajdonost request_approval-lal (kind: spec), és addig csak azt add ki, ami a kérdéstől független.
2. Bontsd a projektet konkrét, egyenként átvizsgálható feladatokra a megfelelő részlegeknek (create_task), a sorrendet függőségekkel (depends_on) add meg. Minden feladat leírásában hivatkozz a(z) ${doc} fájlra.
3. Írd a projektlap végére (${doc}) a „## Terv” részt: a feladatok listája, ki mit csinál, és az elfogadási feltételek.`,
      department: "core",
      assignee: "ceo",
      kind: "plan",
      priority: r.prioritas,
      project: id,
    },
    "owner",
    now,
  );
  f.projects.push({
    id,
    title: r.nev,
    goal: r.cel,
    done: r.eredmeny,
    constraints: r.megkotesek,
    department: r.reszleg,
    priority: r.prioritas,
    deadline: r.hatarido,
    createdAt: now.toISOString(),
    issue,
    kickoff: t.id,
    doc,
  });
  saveProjects(root, f);
  logEvent(s, { actor: "owner", department: "core", kind: "info", text: `Új projekt: ${id} ${r.nev} → ${t.id}` }, now);
  return `Rögzítettem: ${id} ${r.nev}. A vezérigazgató a következő munkanapon feladatokra bontja (${t.id}); a projekt állása a vezérlőterem Projektek fülén látszik.`;
}

/** A tulajdonos nyitott projekt-issue-inak feldolgozása és lezárása. */
export function sweepProjectIssues(s: CompanyState, root: string, gh: Gh, owner: string, deferClose?: (() => void)[]): string[] {
  if (!owner) return [];
  const list = JSON.parse(gh(["issue", "list", "--state", "open", "--author", owner, "--limit", "100", "--json", "number,body"])) as { number: number; body: string }[];
  const out: string[] = [];
  for (const i of list.sort((a, b) => a.number - b.number)) {
    const r = parseProjectIssue(i.body);
    if (!r) continue;
    let msg: string;
    let ok = false;
    if ("error" in r) msg = r.error;
    else {
      try {
        msg = applyProject(s, root, r.request, i.number);
        ok = true;
      } catch (e) {
        msg = `A projektet nem sikerült rögzíteni: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    const close = () => void gh(["issue", "close", String(i.number), "--reason", ok ? "completed" : "not planned", "--comment", msg]);
    // Sikeres rögzítésnél csak a mentés után zárjuk le, hogy egy elveszett mentés után újra feldolgozható legyen.
    if (deferClose && ok) deferClose.push(close);
    else close();
    out.push(msg);
  }
  return out;
}
