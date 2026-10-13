// A közös feladattábla. Minden művelet tiszta függvény a CompanyState-en,
// így a motor és a tesztek ugyanazt a logikát használják.

import { DEPARTMENTS, roleById, type DepartmentId } from "../company/org.js";
import { touchesPersonalData } from "../company/privacy/review.js";
import type { CompanyEvent, CompanyState, Gate, GateKind, Task, TaskKind, TaskStatus } from "./types.js";

export const MAX_EVENTS = 400;

export function emptyState(): CompanyState {
  return { version: 1, meta: { runs: 0, nextTask: 1, nextGate: 1 }, tasks: [], gates: [], events: [], ledger: [] };
}

const iso = (now: Date) => now.toISOString();

export function logEvent(
  s: CompanyState,
  e: Omit<CompanyEvent, "at">,
  now = new Date(),
): void {
  s.events.push({ at: iso(now), ...e });
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
}

export function getTask(s: CompanyState, id: string): Task {
  const t = s.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`Nincs ilyen feladat: ${id}`);
  return t;
}

export interface NewTask {
  title: string;
  description: string;
  department: DepartmentId;
  assignee?: string;
  kind?: TaskKind;
  priority?: 1 | 2 | 3;
  dependsOn?: string[];
  reviewOf?: string;
}

export function createTask(s: CompanyState, input: NewTask, by: string, now = new Date()): Task {
  const dep = DEPARTMENTS.find((d) => d.id === input.department);
  if (!dep) throw new Error(`Ismeretlen részleg: ${input.department}`);
  const assignee = input.assignee ?? dep.lead;
  const role = roleById(assignee);
  if (!role) throw new Error(`Ismeretlen szerep: ${assignee}`);
  if (role.department !== input.department) {
    throw new Error(`${assignee} nem a(z) ${input.department} részleg tagja, hanem a(z) ${role.department} részlegé.`);
  }
  for (const d of input.dependsOn ?? []) getTask(s, d);
  const t: Task = {
    id: `T-${String(s.meta.nextTask++).padStart(4, "0")}`,
    title: input.title.trim(),
    description: input.description.trim(),
    department: input.department,
    assignee,
    status: "todo",
    kind: input.kind ?? (role.access === "code" ? "code" : "doc"),
    priority: input.priority ?? 2,
    dependsOn: input.dependsOn ?? [],
    reviewOf: input.reviewOf,
    createdBy: by,
    createdAt: iso(now),
    updatedAt: iso(now),
    notes: [],
  };
  s.tasks.push(t);
  logEvent(s, { actor: by, department: roleById(by)?.department ?? "system", kind: "info", text: `Új feladat ${t.id} → ${role.name}: ${t.title}` }, now);
  return t;
}

export function addNote(t: Task, by: string, text: string, now = new Date()): void {
  t.notes.push({ at: iso(now), by, text });
  t.updatedAt = iso(now);
}

function setStatus(t: Task, status: TaskStatus, now: Date): void {
  t.status = status;
  t.updatedAt = iso(now);
}

/**
 * Egy feladat elkészült. Kódfeladatnál nem zárul le azonnal: automatikusan
 * kódellenőrzés és biztonsági átvizsgálás indul, személyes adatot érintő változásnál
 * adatvédelmi átvizsgálás is, és csak mindegyik jóváhagyása után kész.
 */
export function completeTask(s: CompanyState, id: string, by: string, summary: string, now = new Date()): Task {
  const t = getTask(s, id);
  if (t.status === "done") return t;
  addNote(t, by, summary, now);
  if (t.kind === "code") {
    setStatus(t, "review", now);
    t.reviewRound = (t.reviewRound ?? 0) + 1;
    const reviewers = ["code-reviewer", "appsec"];
    if (touchesPersonalData(t, summary)) reviewers.push("privacy-officer");
    for (const reviewer of reviewers) {
      const role = roleById(reviewer)!;
      const rt = createTask(
        s,
        {
          title: `Átvizsgálás: ${t.title}`,
          description:
            reviewer === "privacy-officer"
              ? `Vizsgáld át adatvédelmi szempontból a(z) ${t.id} feladat változásait: jogalap, adattakarékosság, megőrzés, érintetti jogok, naplózás, és az EU, HU, PL, CZ szabályok (privacy_lookup). A fejlesztő összefoglalója: ${summary}`
              : `Vizsgáld át a(z) ${t.id} feladat változásait (${role.name}). A fejlesztő összefoglalója: ${summary}`,
          department: role.department,
          assignee: reviewer,
          kind: "review",
          priority: t.priority,
          reviewOf: t.id,
        },
        "system",
        now,
      );
      rt.reviewRound = t.reviewRound;
    }
    return t;
  }
  setStatus(t, "done", now);
  logEvent(s, { actor: by, department: t.department, kind: "info", text: `Kész: ${t.id} ${t.title}` }, now);
  if (t.reviewOf) settleReview(s, t.reviewOf, now);
  return t;
}

/** Átvizsgáló döntése: jóváhagy vagy javítást kér. */
export function submitReview(
  s: CompanyState,
  reviewTaskId: string,
  by: string,
  verdict: "approve" | "changes",
  note: string,
  now = new Date(),
): void {
  const rt = getTask(s, reviewTaskId);
  if (rt.kind !== "review" || !rt.reviewOf) throw new Error(`${reviewTaskId} nem átvizsgálási feladat.`);
  const target = getTask(s, rt.reviewOf);
  if (verdict === "changes") {
    addNote(rt, by, `Javítást kér: ${note}`, now);
    setStatus(rt, "done", now);
    addNote(target, by, `Javítás kell: ${note}`, now);
    setStatus(target, "todo", now);
    // A többi nyitott átvizsgálás is újraindul a javítás után.
    for (const other of s.tasks) {
      if (other.reviewOf === target.id && other.id !== rt.id && other.status !== "done") {
        addNote(other, "system", "Visszavonva: a feladat javításra visszament.", now);
        setStatus(other, "done", now);
      }
    }
    logEvent(s, { actor: by, department: rt.department, kind: "warn", text: `${target.id} visszaküldve javításra: ${note}` }, now);
    return;
  }
  addNote(rt, by, `Jóváhagyva: ${note}`, now);
  setStatus(rt, "done", now);
  settleReview(s, target.id, now);
}

function settleReview(s: CompanyState, targetId: string, now: Date): void {
  const target = getTask(s, targetId);
  if (target.status !== "review") return;
  const latestRound = s.tasks.filter((x) => x.reviewOf === targetId && x.reviewRound === target.reviewRound);
  if (latestRound.length > 0 && latestRound.every((x) => x.status === "done" && x.notes.some((n) => n.text.startsWith("Jóváhagyva")))) {
    setStatus(target, "done", now);
    logEvent(s, { actor: "system", department: target.department, kind: "info", text: `Kész és átvizsgálva: ${target.id} ${target.title}` }, now);
  }
}

export function blockTask(s: CompanyState, id: string, by: string, reason: string, now = new Date()): void {
  const t = getTask(s, id);
  addNote(t, by, `Elakadt: ${reason}`, now);
  setStatus(t, "blocked", now);
  logEvent(s, { actor: by, department: t.department, kind: "warn", text: `${t.id} elakadt: ${reason}` }, now);
}

export function reassignTask(s: CompanyState, id: string, assignee: string, by: string, now = new Date()): void {
  const t = getTask(s, id);
  const role = roleById(assignee);
  if (!role) throw new Error(`Ismeretlen szerep: ${assignee}`);
  t.assignee = assignee;
  t.department = role.department;
  if (t.status === "blocked") t.status = "todo";
  addNote(t, by, `Átadva neki: ${role.name}`, now);
}

export function requestGate(
  s: CompanyState,
  taskId: string,
  kind: GateKind,
  title: string,
  summary: string,
  by: string,
  now = new Date(),
): Gate {
  const t = getTask(s, taskId);
  const g: Gate = {
    id: `G-${String(s.meta.nextGate++).padStart(3, "0")}`,
    kind,
    title,
    summary,
    taskId,
    requestedBy: by,
    status: "pending",
    createdAt: iso(now),
  };
  s.gates.push(g);
  t.gateId = g.id;
  setStatus(t, "awaiting_approval", now);
  logEvent(s, { actor: by, department: t.department, kind: "gate", text: `Jóváhagyásra vár (${g.id}): ${title}` }, now);
  return g;
}

/** A tulajdonos döntése egy kapun. Jóváhagyásnál a feladat kész, elutasításnál visszamegy. */
export function decideGate(
  s: CompanyState,
  gateId: string,
  decision: "approved" | "rejected",
  note: string,
  now = new Date(),
): void {
  const g = s.gates.find((x) => x.id === gateId);
  if (!g) throw new Error(`Nincs ilyen kapu: ${gateId}`);
  if (g.status !== "pending") return;
  g.status = decision;
  g.decidedAt = iso(now);
  g.decisionNote = note;
  const t = getTask(s, g.taskId);
  if (decision === "approved") {
    addNote(t, "owner", `Jóváhagyva${note ? `: ${note}` : ""}`, now);
    setStatus(t, "done", now);
  } else {
    addNote(t, "owner", `Elutasítva: ${note || "nincs indoklás"}`, now);
    setStatus(t, "todo", now);
  }
  logEvent(s, { actor: "owner", department: t.department, kind: "gate", text: `${g.id} ${decision === "approved" ? "jóváhagyva" : "elutasítva"}: ${g.title}` }, now);
}

const isReady = (s: CompanyState, t: Task) =>
  t.status === "todo" && t.dependsOn.every((d) => s.tasks.find((x) => x.id === d)?.status === "done");

/** A következő elvégezhető feladatok: prioritás, majd életkor szerint. */
export function runnableTasks(s: CompanyState, limit: number): Task[] {
  return s.tasks
    .filter((t) => isReady(s, t))
    // A napi tervezés mindig elsőként fut, utána prioritás és életkor szerint.
    .sort((a, b) => Number(b.kind === "plan") - Number(a.kind === "plan") || a.priority - b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function boardSummary(s: CompanyState): Record<TaskStatus, number> {
  const out: Record<TaskStatus, number> = { todo: 0, in_progress: 0, review: 0, awaiting_approval: 0, blocked: 0, done: 0 };
  for (const t of s.tasks) out[t.status]++;
  return out;
}

/** Az első munkanap induló feladatai, ha a tábla üres. */
export function seedBacklog(s: CompanyState, now = new Date()): void {
  if (s.tasks.length > 0) return;
  const research = createTask(s, {
    title: "Piaci rés: magyar KKV számlázás + készlet",
    description: "Elemezd a magyar KKV-knak szóló számlázó és készletkezelő szoftverek piacát (funkciók, árak, NAV Online Számla, gyenge pontok). Írd le a docs/product/market.md fájlba, és javasolj egy első, gyorsan eladható termékszeletet.",
    department: "product",
    assignee: "market-researcher",
    priority: 1,
  }, "ceo", now);
  const prd = createTask(s, {
    title: "PRD: első termékszelet (számlázás + készlet)",
    description: "A piackutatás alapján írd meg a termékleírást a docs/product/prd.md fájlba: célfelhasználó, modulok, elfogadási feltételek, nem-célok, licencmodell javaslat. Ha kész, kérj spec jóváhagyást.",
    department: "product",
    assignee: "product-manager",
    priority: 1,
    dependsOn: [research.id],
  }, "ceo", now);
  createTask(s, {
    title: "Biztonsági alapszabályzat",
    description: "Írd meg a docs/security/policy.md fájlba a fejlesztés biztonsági szabályait: titokkezelés, függőségek, kódellenőrzés, adatkezelés (GDPR), és mit jelent a kiadás előtti biztonsági jóváhagyás.",
    department: "security",
    assignee: "ciso",
    priority: 1,
  }, "ceo", now);
  createTask(s, {
    title: "Architektúra és repó-struktúra",
    description: "A PRD alapján tervezd meg a termék architektúráját (NestJS + PostgreSQL + React, moduláris monolit) a docs/dev/architecture.md fájlba, hozd létre a product/ alatti vázat, és bontsd fejlesztői feladatokra a munkát.",
    department: "dev",
    assignee: "architect",
    priority: 1,
    dependsOn: [prd.id],
  }, "ceo", now);
  createTask(s, {
    title: "Pozicionálás és üzenet",
    description: "Írd meg a docs/marketing/positioning.md fájlba, kinek és milyen ígérettel adjuk el a terméket. Ez belső vázlat, nem publikálunk.",
    department: "marketing",
    assignee: "brand-strategist",
    priority: 3,
    dependsOn: [research.id],
  }, "ceo", now);
}

/** Az adatvédelmi modul induló feladatai. Idempotens: meglévő táblára is csak egyszer kerülnek fel. */
export function seedPrivacyBacklog(s: CompanyState, now = new Date()): void {
  const base = "Adatvédelmi követelmények az ERP-hez (EU)";
  if (s.tasks.some((t) => t.title === base)) return;
  const eu = createTask(s, {
    title: base,
    description:
      "A privacy_lookup tudásbázis és a docs/security/adatvedelem/README.md alapján írd meg a docs/security/privacy/requirements.md fájlba az ERP adatvédelmi követelményeit: adatkategóriák és jogalapok modulonként, érintetti kérelem funkció, megőrzési profil-modell, naplózás, különleges adatok kezelése, DPA-sablon váza. A fejlesztésnek szánt teendőket hozd létre feladatként az architektnek.",
    department: "security",
    assignee: "privacy-officer",
    priority: 1,
  }, "ciso", now);
  const countries = [
    ["privacy-hu", "Magyarország", "magyar"],
    ["privacy-pl", "Lengyelország", "lengyel"],
    ["privacy-cz", "Csehország", "cseh"],
  ] as const;
  for (const [role, country, lang] of countries) {
    createTask(s, {
      title: `Országprofil: ${country} (adatvédelem és megőrzés)`,
      description: `Írd meg a docs/security/privacy/${role.slice(-2)}.md fájlba a(z) ${country} országprofilt: megőrzési idők adatkategóriánként, munkahelyi adatkezelés, e-számlázás, marketing és sütik, incidensbejelentés a hatóságnak, kiberbiztonsági (NIS2) szállítói elvárások. Készíts ${lang} nyelvű adatkezelési tájékoztató-sablont is. A ⚠ jelölésű pontokat jelöld meg jogászi ellenőrzésre.`,
      department: "security",
      assignee: role,
      priority: 2,
      dependsOn: [eu.id],
    }, "ciso", now);
  }
}
