// Kódellenőrzés az agenteknek: a product/ alatti projektek telepítése, típusellenőrzése, lintje és tesztje.
// Csak rögzített parancsok futnak (nincs szabad shell). A gyerekfolyamat nem kap titkot (üres környezet),
// a GitHub Actionsben pedig külön, jog nélküli felhasználóként, hálózat nélkül fut (a telepítést kivéve).

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Access } from "../company/org.js";
import type { Workspace } from "./workspace.js";

export type CheckStep = "install" | "typecheck" | "lint" | "test";
export const CHECK_STEPS: readonly CheckStep[] = ["install", "typecheck", "lint", "test"];

export type ChecksMode = "off" | "local" | "sandbox";

const STEP_TIMEOUT_S = 300;
const OUTPUT_TAIL = 4000;
const MANIFEST = ".alicya-files.json";

/**
 * Hogyan futhat a kódellenőrzés. A GitHub Actionsben csak elkülönített felhasználóval: ott a lemezen
 * a repó írási tokenje van, és a környezetben az API-kulcsok; az agent kódja egyikhez sem érhet hozzá.
 */
export function checksMode(env: NodeJS.ProcessEnv = process.env): ChecksMode {
  if (env.ALICYA_CHECKS === "off") return "off";
  if (env.ALICYA_SANDBOX_USER?.trim()) return "sandbox";
  if (env.GITHUB_ACTIONS === "true") return "off";
  return "local";
}

/** Egy munkanapban ennyi ideig futhat összesen kódellenőrzés. */
const totalLimitMs = (env: NodeJS.ProcessEnv) => {
  const n = Number(env.ALICYA_CHECKS_MINUTES);
  return (Number.isFinite(n) && n > 0 ? n : 30) * 60_000;
};
let spentMs = 0;
export const resetChecksBudget = (): void => void (spentMs = 0);
export const checksAvailable = (env: NodeJS.ProcessEnv = process.env): boolean => checksMode(env) !== "off" && spentMs < totalLimitMs(env);

/** A product/ alatti projektek (ahol package.json van), pl. product/backend. */
export function findProjects(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string, depth: number) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return;
    if (rel !== "product" && fs.existsSync(path.join(abs, "package.json"))) out.push(rel);
    if (depth >= 3) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith(".")) walk(`${rel}/${e.name}`, depth + 1);
    }
  };
  walk("product", 0);
  return out.sort();
}

/** Melyik projekthez tartozik egy fájl (a legközelebbi package.json-os könyvtár a product/ alatt). */
export function projectOf(projects: string[], rel: string): string | undefined {
  const norm = path.posix.normalize(rel.replaceAll("\\", "/")).replace(/\/$/, "");
  return projects.filter((p) => norm === p || norm.startsWith(p + "/")).sort((a, b) => b.length - a.length)[0];
}

export interface StepResult {
  step: CheckStep | "generate";
  status: "ok" | "fail" | "skipped";
  note?: string;
  output?: string;
  ms: number;
}

export interface ChecksResult {
  project: string;
  ok: boolean;
  steps: StepResult[];
  /** A generáló lépés által előállított fájlok tartalma (pl. a motor kézikönyve). */
  generated?: { rel: string; content: string }[];
}

/** Ellenőrzés előtti generálás: rögzített parancsok, és a fájlok, amelyeket előállítanak. */
export interface Generate {
  cmds: string[][];
  outputs: string[];
}

const GEN_MARK = "@@ALICYA-GENERATED@@";
// A generált fájlokat a homokozott folyamat írja ki a kimenetére: a futtató semmit nem olvas a munkakönyvtárból.
const COLLECT_SCRIPT = `const fs=require("fs"),p=require("path");const o={};for(const r of process.argv.slice(1)){try{const a=p.join(process.cwd(),r);const st=fs.lstatSync(a);if(st.isFile()&&st.size<400000)o[r]=fs.readFileSync(a,"utf8")}catch{}}process.stdout.write("\\n${GEN_MARK}"+JSON.stringify(o));`;

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const tail = (s: string, n = OUTPUT_TAIL) => {
  const t = s.replace(ANSI, "").replace(/\r/g, "").trim();
  return t.length > n ? `…${t.slice(-n)}` : t;
};

const workdirFor = (ws: Workspace, project: string) => {
  const key = crypto.createHash("sha256").update(`${ws.root}\0${"overlay" in ws ? String((ws as { overlay: string }).overlay) : ""}`).digest("hex").slice(0, 12);
  return path.join(os.tmpdir(), "alicya-checks", key, project.replace(/[^\w.-]+/g, "_"));
};

/**
 * A munkakönyvtárba másolást maga a (homokozott) folyamat végzi egy átmeneti, csak olvasható másolatból,
 * így a futtató felhasználó soha nem ír az agent kódja által írható könyvtárba (szimbolikus link csapda).
 * A node_modules megmarad, a forrásból törölt fájlok eltűnnek.
 */
const SYNC_SCRIPT = `const fs=require("fs"),p=require("path");const[s,d]=process.argv.slice(1);
fs.mkdirSync(p.join(d,".home"),{recursive:true});
const mf=p.join(d,"${MANIFEST}");let before=[];try{before=JSON.parse(fs.readFileSync(mf,"utf8"))}catch{}
const files=JSON.parse(fs.readFileSync(p.join(s,"${MANIFEST}"),"utf8"));const now=new Set(files);
for(const r of before)if(!now.has(r))fs.rmSync(p.join(d,r),{force:true});
for(const r of files){const t=p.join(d,r);fs.mkdirSync(p.dirname(t),{recursive:true});fs.rmSync(t,{force:true});fs.copyFileSync(p.join(s,r),t)}
fs.writeFileSync(mf,JSON.stringify(files));`;

function stage(ws: Workspace, access: Access, project: string): string {
  const files = ws.sources(project, access);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alicya-stage-"));
  fs.chmodSync(dir, 0o755);
  for (const f of files) {
    const dest = path.join(dir, f.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o755 });
    fs.copyFileSync(f.abs, dest);
    fs.chmodSync(dest, 0o644);
  }
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(files.map((f) => f.rel)));
  fs.chmodSync(path.join(dir, MANIFEST), 0o644);
  return dir;
}

/** Mely munkakönyvtárban milyen függőségekkel futott már telepítés (csak a futtató memóriájában). */
const installed = new Map<string, string>();

const NET_ENV = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy", "NODE_EXTRA_CA_CERTS", "npm_config_registry"];

interface Runner {
  mode: ChecksMode;
  user?: string;
}

/** Egy rögzített parancs futtatása üres környezettel, időkorláttal; homokozóban más felhasználóként. */
function exec(r: Runner, dir: string, cmd: string[], network: boolean): { code: number; out: string } {
  const bin = path.dirname(process.execPath);
  const envv = [`PATH=${bin}:/usr/local/bin:/usr/bin:/bin`, `HOME=${path.join(dir, ".home")}`, "CI=1", "NODE_ENV=test", "npm_config_update_notifier=false", "LANG=C.UTF-8"];
  // A telepítés a hálózati beállításokat (proxy, saját tanúsítvány, registry) megkapja, mást nem.
  if (network) for (const k of NET_ENV) if (process.env[k]) envv.push(`${k}=${process.env[k]}`);
  const inner = ["/usr/bin/env", "-i", ...envv, "/bin/sh", "-c", 'umask 000; exec "$@"', "sh", "timeout", "-k", "10", String(STEP_TIMEOUT_S), ...cmd];
  let argv: string[];
  if (r.mode === "sandbox") {
    const drop = ["setpriv", `--reuid=${r.user}`, `--regid=${r.user}`, "--init-groups", "--"];
    // Hálózat csak a telepítéshez kell; a többi lépés saját, külvilág nélküli hálózati névtérben fut (csak loopback).
    argv = network
      ? ["sudo", "-n", "--", ...drop, ...inner]
      : ["sudo", "-n", "--", "unshare", "--net", "--", "/bin/sh", "-c", 'ip link set lo up 2>/dev/null || true; exec "$@"', "sh", ...drop, ...inner];
  } else {
    argv = inner;
  }
  const res = spawnSync(argv[0]!, argv.slice(1), { cwd: dir, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: (STEP_TIMEOUT_S + 30) * 1000, killSignal: "SIGKILL" });
  const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}${res.error ? `\n${res.error.message}` : ""}`;
  return { code: res.status ?? (res.error ? 1 : 137), out };
}

function readPkg(dir: string): { scripts: Record<string, string>; deps: number } {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as Record<string, any>;
    const deps = Object.keys(p.dependencies ?? {}).length + Object.keys(p.devDependencies ?? {}).length;
    return { scripts: (p.scripts && typeof p.scripts === "object" ? p.scripts : {}) as Record<string, string>, deps };
  } catch {
    throw new Error("A package.json nem érvényes JSON.");
  }
}

/** Lefuttatja a kért lépéseket egy projekten. A telepítés csak akkor fut újra, ha a függőségek változtak. */
export function runChecks(ws: Workspace, access: Access, project: string, steps?: readonly CheckStep[], env: NodeJS.ProcessEnv = process.env, generate?: Generate): ChecksResult {
  const mode = checksMode(env);
  if (mode === "off") throw new Error("A kódellenőrzés itt nem érhető el.");
  if (spentMs >= totalLimitMs(env)) throw new Error("Ebben a munkanapban elfogyott a kódellenőrzésre szánt idő.");
  const r: Runner = { mode, user: env.ALICYA_SANDBOX_USER?.trim() };
  const dir = workdirFor(ws, project);
  const staged = stage(ws, access, project);
  let pkg: ReturnType<typeof readPkg>;
  let stamp: string;
  let tsconfig: boolean;
  try {
    pkg = readPkg(staged);
    tsconfig = fs.existsSync(path.join(staged, "tsconfig.json"));
    const lockFile = path.join(staged, "package-lock.json");
    stamp = crypto.createHash("sha256").update(fs.readFileSync(path.join(staged, "package.json"))).update(fs.existsSync(lockFile) ? fs.readFileSync(lockFile) : "").digest("hex");
    stamp += fs.existsSync(lockFile) ? ":lock" : "";
    if (mode === "local") fs.mkdirSync(dir, { recursive: true });
    const synced = exec(r, mode === "local" ? dir : staged, ["node", "-e", SYNC_SCRIPT, staged, dir], false);
    if (synced.code !== 0) throw new Error(`A projekt előkészítése nem sikerült: ${tail(synced.out, 600)}`);
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
  const want = new Set(steps ?? CHECK_STEPS);
  const results: StepResult[] = [];
  const run = (step: StepResult["step"], cmd: string[], network = false): StepResult => {
    const t0 = Date.now();
    const { code, out } = exec(r, dir, cmd, network);
    const ms = Date.now() - t0;
    spentMs += ms;
    if (code === 0) return { step, status: "ok", output: tail(out, 1200), ms };
    // A hiányzó eszköz (pl. nincs telepítve az eslint) nem a kód hibája: kihagyott lépés, figyelmeztetéssel.
    if (code === 127) return { step, status: "skipped", note: "a futtatandó eszköz nincs telepítve (vedd fel a devDependencies közé)", output: tail(out, 800), ms };
    if (code === 124 || code === 137) return { step, status: "fail", note: `időtúllépés (${STEP_TIMEOUT_S} mp)`, output: tail(out), ms };
    return { step, status: "fail", note: `kilépési kód ${code}`, output: tail(out), ms };
  };

  // Telepítés: ha a függőségek változtak (vagy kérték), különben a meglévő node_modules marad.
  const lock = stamp.endsWith(":lock");
  const upToDate = installed.get(dir) === stamp && fs.existsSync(path.join(dir, "node_modules"));
  if (pkg.deps === 0) results.push({ step: "install", status: "skipped", note: "nincs függőség", ms: 0 });
  // Újratelepítés csak kifejezett kérésre (steps: ["install"]) vagy változott függőségeknél.
  else if (upToDate && !steps?.includes("install")) results.push({ step: "install", status: "ok", note: "a függőségek nem változtak", ms: 0 });
  else {
    const res = run("install", lock ? ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"] : ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], true);
    results.push(res);
    if (res.status === "ok") installed.set(dir, stamp);
    else {
      installed.delete(dir);
      return { project, ok: false, steps: results };
    }
  }

  let generated: ChecksResult["generated"];
  if (generate) {
    for (const cmd of generate.cmds) {
      const g = run("generate", cmd);
      if (g.status === "fail") {
        results.push(g);
        return { project, ok: false, steps: results };
      }
    }
    const { code, out } = exec(r, dir, ["node", "-e", COLLECT_SCRIPT, ...generate.outputs], false);
    const at = out.lastIndexOf(GEN_MARK);
    try {
      if (code !== 0 || at < 0) throw new Error("nincs kimenet");
      const files = JSON.parse(out.slice(at + GEN_MARK.length).trim().split("\n")[0]!) as Record<string, unknown>;
      generated = generate.outputs.flatMap((rel) => (typeof files[rel] === "string" ? [{ rel, content: files[rel] as string }] : []));
      results.push({ step: "generate", status: "ok", note: generated.map((g) => g.rel).join(", "), ms: 0 });
    } catch {
      results.push({ step: "generate", status: "fail", note: "a generált fájlok nem olvashatók", output: tail(out, 1500), ms: 0 });
      return { project, ok: false, steps: results };
    }
  }

  if (want.has("typecheck")) {
    if (pkg.scripts.typecheck) results.push(run("typecheck", ["npm", "run", "--silent", "typecheck"]));
    else if (tsconfig) results.push(run("typecheck", ["npx", "--no-install", "tsc", "--noEmit", "-p", "tsconfig.json"]));
    else results.push({ step: "typecheck", status: "skipped", note: "nincs tsconfig.json", ms: 0 });
  }
  if (want.has("lint")) {
    results.push(pkg.scripts.lint ? run("lint", ["npm", "run", "--silent", "lint"]) : { step: "lint", status: "skipped", note: "nincs lint szkript", ms: 0 });
  }
  if (want.has("test")) {
    results.push(pkg.scripts.test ? run("test", ["npm", "test", "--silent"]) : { step: "test", status: "skipped", note: "nincs test szkript", ms: 0 });
  }
  return { project, ok: results.every((s) => s.status !== "fail"), steps: results, generated };
}

const ICON = { ok: "✓", fail: "✗", skipped: "–" } as const;

/** Egy soros összefoglaló (az átvizsgálóknak és a feladat jegyzetébe). */
export const checksLine = (r: ChecksResult): string =>
  `${r.project}: ${r.steps.map((s) => `${s.step} ${ICON[s.status]}${s.note && s.status !== "ok" ? ` (${s.note})` : ""}`).join(", ")}`;

/** Az agentnek visszaadott részletes eredmény: a hibás lépések kimenetének vége. */
export function formatChecks(r: ChecksResult): string {
  const head = `${r.ok ? "ZÖLD" : "PIROS"} · ${checksLine(r)}`;
  const details = r.steps
    .filter((s) => s.status === "fail" || (s.status === "ok" && s.step === "test"))
    .map((s) => `--- ${s.step} (${s.status === "ok" ? "rendben" : s.note}, ${Math.round(s.ms / 1000)} mp) ---\n${s.output || "(nincs kimenet)"}`);
  return [head, ...details].join("\n\n");
}
