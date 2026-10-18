// Önfejlesztés: a cég a saját motorját (src/, company/, test/, dashboard/) is javíthatja.
// A motorfejlesztési feladat a valódi motort olvassa, de amit ír, az a state/motor/<feladat>/ alá kerül,
// így a futó cég nem változik. Átvizsgálás után a munkanap a változást egy ágra teszi a main fölé, és
// pull requestet nyit; a main ágra csak a tulajdonos jóváhagyásával (beolvasztásával) kerül.
// A munkafolyamatokhoz (.github/) és a függőségekhez (package.json) az agentek nem nyúlhatnak.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Access } from "../company/org.js";
import { addNote, getTask, logEvent } from "./board.js";
import type { Gh } from "./gates.js";
import type { CompanyState, Task } from "./types.js";
import { ShadowWorkspace } from "./workspace.js";

/** A motor írható részei. */
export const ENGINE_ROOTS = ["src", "company", "test", "dashboard", "README.md"];
/** A motor ellenőrzéséhez (run_checks) szükséges, de nem írható fájlok. */
const ENGINE_FILES = ["package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts"];
/** A motor kódjából generált dokumentumok: a run_checks állítja elő őket a javasolt motorból. */
export const ENGINE_GENERATED = {
  cmds: [
    ["npm", "run", "-s", "build:handbook"],
    ["npm", "run", "-s", "build:privacy"],
  ],
  outputs: ["docs/core/kezikonyv.md", "docs/security/adatvedelem/README.md"],
};
export const ENGINE_DIR = "state/motor";
/** A motor projektje a run_checks számára. */
export const ENGINE_PROJECT = "motor";
const BASE_FILE = ".alap";
const MAX_DIFF = 20_000;

export type Git = (args: string[], cwd: string) => string;
export const realGit: Git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Melyik motorfejlesztéshez tartozik a feladat (maga az, vagy annak átvizsgálása). */
export function engineTaskOf(s: CompanyState, t: Task): string | undefined {
  if (t.engine) return t.id;
  if (t.reviewOf) return s.tasks.find((x) => x.id === t.reviewOf)?.engine ? t.reviewOf : undefined;
  return undefined;
}

export class EngineWorkspace extends ShadowWorkspace {
  constructor(
    root: string,
    readonly taskId: string,
  ) {
    super(root, path.join(root, ENGINE_DIR, taskId));
  }

  protected override allowedRoots(access: Access, mode: "read" | "write"): string[] {
    if (mode === "read") return ["docs", "product", "branding", ...ENGINE_ROOTS];
    return access === "code" ? ENGINE_ROOTS : [];
  }

  /** A motor projektje: a valódi motor a javasolt fájlokkal felülírva. */
  override sources(rel: string, access: Access): { rel: string; abs: string }[] {
    if (rel !== ENGINE_PROJECT) throw new Error(`Motorfejlesztésnél a projekt neve: ${ENGINE_PROJECT}.`);
    const out = new Map<string, string>();
    for (const f of [...ENGINE_FILES, ...ENGINE_GENERATED.outputs]) if (fs.existsSync(path.join(this.root, f))) out.set(f, path.join(this.root, f));
    // A scripts/ a munkafolyamatoké: a tesztek olvassák, de az agent nem írhatja.
    const walk = (rel: string) => {
      for (const e of fs.readdirSync(path.join(this.root, rel), { withFileTypes: true })) {
        if (e.isDirectory() && e.name !== "node_modules") walk(`${rel}/${e.name}`);
        else if (e.isFile()) out.set(`${rel}/${e.name}`, path.join(this.root, rel, e.name));
      }
    };
    if (fs.existsSync(path.join(this.root, "scripts"))) walk("scripts");
    for (const top of ENGINE_ROOTS) {
      if (!fs.existsSync(path.join(this.root, top))) continue;
      if (fs.statSync(path.join(this.root, top)).isFile()) out.set(top, path.join(this.root, top));
      else for (const f of super.sources(top, access)) out.set(`${top}/${f.rel}`, f.abs);
    }
    for (const f of this.changed()) out.set(f, path.join(this.overlay, f));
    return [...out].map(([r, abs]) => ({ rel: r, abs }));
  }

  /** A generált dokumentum frissítése a javaslatban (csak a run_checks hívja, csak ezekre az utakra). */
  writeGenerated(rel: string, content: string): boolean {
    if (!ENGINE_GENERATED.outputs.includes(rel)) throw new Error(`Nem generált fájl: ${rel}`);
    const current = fs.existsSync(path.join(this.overlay, rel)) ? path.join(this.overlay, rel) : path.join(this.root, rel);
    if (fs.existsSync(current) && fs.readFileSync(current, "utf8") === content) return false;
    fs.mkdirSync(path.dirname(path.join(this.overlay, rel)), { recursive: true });
    fs.writeFileSync(path.join(this.overlay, rel), content);
    return true;
  }

  /** A javasolt (megváltoztatott vagy új) fájlok. */
  changed(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && e.name !== BASE_FILE) out.push(path.relative(this.overlay, p).split(path.sep).join("/"));
      }
    };
    if (fs.existsSync(this.overlay)) walk(this.overlay);
    return out.sort();
  }

  /** A változások egységes diffként (a valódi motorhoz képest). */
  diff(): string {
    const files = this.changed();
    if (!files.length) return "Még nincs változás.";
    const parts: string[] = [];
    for (const f of files) {
      const real = path.join(this.root, f);
      const r = spawnSync("diff", ["-u", "--label", `a/${f}`, "--label", `b/${f}`, fs.existsSync(real) ? real : "/dev/null", path.join(this.overlay, f)], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      parts.push(r.stdout || `(${f}: nincs eltérés)`);
    }
    const all = parts.join("\n");
    return all.length > MAX_DIFF ? `${all.slice(0, MAX_DIFF)}\n…[a diff levágva; a fájlokat read_file-lal olvashatod]` : all;
  }
}

/** A motorfejlesztés alapja: a main ág commitja, amelyből indult (az ütközések felismeréséhez). */
export function ensureEngineBase(root: string, taskId: string, git: Git = realGit): void {
  const dir = path.join(root, ENGINE_DIR, taskId);
  const file = path.join(dir, BASE_FILE);
  if (fs.existsSync(file)) return;
  let sha = "";
  for (const ref of ["origin/main", "HEAD"]) {
    try {
      sha = git(["rev-parse", "--verify", "--quiet", ref], root).trim();
      if (sha) break;
    } catch {
      /* következő */
    }
  }
  if (!sha) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${sha}\n`);
}

export interface DeliveryResult {
  task: string;
  outcome: "pr" | "issue" | "conflict" | "empty" | "error";
  url?: string;
  message: string;
}

const branchOf = (taskId: string) => `alicya/motor-${taskId}`;

function prBody(t: Task, files: string[], diffstat: string): string {
  const review = t.notes.filter((n) => /^(Jóváhagyva|Javítás kell|Ellenőrzés)/.test(n.text) || n.text.includes("Ellenőrzés:")).slice(-6);
  return `Az Alicya agentjei a saját motorjukon dolgoztak (${t.id}). A változás csak akkor kerül a main ágra, ha beolvasztod.

**${t.title}**

${t.description.slice(0, 2500)}

**Módosított fájlok:** ${files.map((f) => `\`${f}\``).join(", ")}

\`\`\`
${diffstat.trim().slice(0, 3000)}
\`\`\`

**Átvizsgálás és ellenőrzés:**
${review.map((n) => `- ${n.by}: ${n.text.slice(0, 600).replace(/\n+/g, " ")}`).join("\n") || "- (nincs jegyzet)"}

A munkafolyamatokhoz és a függőségekhez az agentek nem nyúlhatnak. Nézd át a diffet, és ha rendben van, olvaszd be; ha nem, zárd le egy megjegyzéssel.`;
}

/**
 * Az átvizsgált (kész) motorfejlesztések átadása: ág a main fölé háromutas összefésüléssel, aztán pull request.
 * Ha a main közben ugyanott változott, a feladat visszamegy a fejlesztőhöz az ütközésjelekkel.
 */
export function deliverEngineChanges(s: CompanyState, root: string, gh: Gh, repo: string, git: Git = realGit, now = new Date()): DeliveryResult[] {
  const out: DeliveryResult[] = [];
  for (const t of s.tasks.filter((x) => x.engine && x.status === "done" && !x.enginePr)) {
    const ws = new EngineWorkspace(root, t.id);
    const files = ws.changed();
    if (!files.length) {
      t.enginePr = "-";
      out.push({ task: t.id, outcome: "empty", message: `${t.id}: nincs motorváltozás, nincs mit átadni.` });
      continue;
    }
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), "alicya-motor-"));
    try {
      git(["fetch", "-q", "origin", "main"], root);
      const head = git(["rev-parse", "origin/main"], root).trim();
      git(["worktree", "add", "-q", "--detach", wt, head], root);
      const baseFile = path.join(ws.overlay, BASE_FILE);
      const base = fs.existsSync(baseFile) ? fs.readFileSync(baseFile, "utf8").trim() : head;
      const conflicts: string[] = [];
      const merged = new Map<string, string>();
      for (const f of files) {
        const theirs = fs.readFileSync(path.join(ws.overlay, f), "utf8");
        const oursPath = path.join(wt, f);
        const ours = fs.existsSync(oursPath) ? fs.readFileSync(oursPath, "utf8") : undefined;
        let baseText: string | undefined;
        try {
          baseText = git(["show", `${base}:${f}`], root);
        } catch {
          baseText = undefined;
        }
        if (ours === undefined || baseText === undefined) {
          // Új fájl (vagy a main-ről közben törölték): csak akkor tiszta, ha nincs vele ütköző változat.
          if (ours === undefined && baseText === undefined) merged.set(f, theirs);
          else if (ours === theirs) merged.set(f, theirs);
          else {
            conflicts.push(f);
            merged.set(f, ours === undefined ? theirs : `<<<<<<< main\n${ours}=======\n${theirs}>>>>>>> javaslat\n`);
          }
          continue;
        }
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alicya-merge-"));
        try {
          const [o, b, th] = ["main", "alap", "javaslat"].map((n) => path.join(tmp, n));
          fs.writeFileSync(o!, ours);
          fs.writeFileSync(b!, baseText);
          fs.writeFileSync(th!, theirs);
          const r = spawnSync("git", ["merge-file", "-p", "-L", "main", "-L", "alap", "-L", "javaslat", o!, b!, th!], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
          if (r.status === null || r.status < 0) throw new Error(`git merge-file hiba: ${r.stderr}`);
          if (r.status > 0) conflicts.push(f);
          merged.set(f, r.stdout);
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      }
      if (conflicts.length) {
        // Újraalapozás: a javaslat a mostani main-re kerül, az ütköző helyeken jelölőkkel.
        for (const [f, text] of merged) fs.writeFileSync(path.join(ws.overlay, f), text);
        fs.writeFileSync(baseFile, `${head}\n`);
        t.status = "todo";
        t.updatedAt = now.toISOString();
        addNote(t, "system", `A main ág közben ugyanott változott (${conflicts.join(", ")}). A javaslatodat a mostani main-re tettem; az ütköző részeket <<<<<<< main / ======= / >>>>>>> javaslat jelek mutatják. Oldd fel őket (show_changes, read_file), futtasd a run_checks-et a motoron, és zárd le újra.`, now);
        logEvent(s, { actor: "system", department: "dev", kind: "warn", text: `Motorfejlesztés ${t.id}: ütközés a main ággal, visszament a fejlesztőhöz.` }, now);
        out.push({ task: t.id, outcome: "conflict", message: `${t.id}: ütközés (${conflicts.join(", ")}), visszament javításra.` });
        continue;
      }
      for (const [f, text] of merged) {
        fs.mkdirSync(path.dirname(path.join(wt, f)), { recursive: true });
        fs.writeFileSync(path.join(wt, f), text);
      }
      git(["add", "-A", "--", ...files], wt);
      const stat = git(["diff", "--cached", "--stat"], wt);
      if (!stat.trim()) {
        t.enginePr = "-";
        out.push({ task: t.id, outcome: "empty", message: `${t.id}: a változás már benne van a main ágban.` });
        continue;
      }
      git(["commit", "-q", "-m", `Motorfejlesztés: ${t.title} (${t.id})`], wt);
      const branch = branchOf(t.id);
      git(["push", "-q", "--force", "origin", `HEAD:refs/heads/${branch}`], wt);
      const title = `Motorfejlesztés: ${t.title} (${t.id})`;
      const body = prBody(t, files, stat);
      let url = "";
      let outcome: DeliveryResult["outcome"] = "pr";
      try {
        const existing = JSON.parse(gh(["pr", "list", "--head", branch, "--state", "open", "--json", "url"]) || "[]") as { url: string }[];
        url = existing[0]?.url ?? gh(["pr", "create", "--base", "main", "--head", branch, "--title", title, "--body", body]).trim();
      } catch {
        // A GitHub Actions alapból nem nyithat pull requestet: ilyenkor egy issue viszi a kész összehasonlító linket.
        outcome = "issue";
        const compare = `https://github.com/${repo}/compare/main...${branch}?expand=1`;
        url = gh(["issue", "create", "--title", `[Motor] ${title}`, "--body", `${body}\n\n**Pull request nyitása:** ${compare}`]).trim();
      }
      t.enginePr = url;
      t.updatedAt = now.toISOString();
      addNote(t, "system", `Átadva a tulajdonosnak: ${url}`, now);
      logEvent(s, { actor: "kaizen", department: "core", kind: "gate", text: `Motorfejlesztés ${t.id} jóváhagyásra vár: ${url}` }, now);
      out.push({ task: t.id, outcome, url, message: `${t.id}: ${outcome === "pr" ? "pull request" : "issue"} nyílt: ${url}` });
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 300);
      logEvent(s, { actor: "system", department: "system", kind: "warn", text: `Motorfejlesztés ${t.id} átadása nem sikerült: ${msg}` }, now);
      out.push({ task: t.id, outcome: "error", message: `${t.id}: ${msg}` });
    } finally {
      try {
        git(["worktree", "remove", "--force", wt], root);
      } catch {
        fs.rmSync(wt, { recursive: true, force: true });
      }
    }
  }
  return out;
}

/** A tulajdonos és az agentek számára: a motorfejlesztés leírásához fűzött szabályok. */
export const ENGINE_RULES = `Ez motorfejlesztés: a cég saját működését javítod (src/, company/, test/, dashboard/, README.md), nem a terméket.
- Előbb értsd meg a meglévőt: code_map és search_code a src/ alatt, aztán read_file. Kis, jól körülhatárolt változtatást csinálj.
- Amit írsz, az nem a futó céget módosítja, hanem egy javaslatot: show_changes mutatja a különbséget a mostani motorhoz képest.
- TypeScript, a meglévő stílusban, magyar kommentekkel; minden változáshoz teszt a test/ alá.
- A run_checks path-ja itt "${ENGINE_PROJECT}": típusellenőrzés és a motor összes tesztje. Csak zölden zárhatod le.
- A munkafolyamatokhoz (.github/), a függőségekhez (package.json) és a titkokhoz nem nyúlhatsz; ne gyengíts biztonsági korlátot, költségkeretet vagy jóváhagyási kaput.
- Átvizsgálás után a változás pull requestként a tulajdonoshoz kerül; ő dönt a beolvasztásról.`;

export const isEngineTask = (s: CompanyState, id: string): boolean => Boolean(getTask(s, id).engine);
