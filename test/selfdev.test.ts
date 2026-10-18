import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roleById } from "../company/org.js";
import { createTask, emptyState } from "../src/board.js";
import { resetChecksBudget } from "../src/checks.js";
import type { Gh } from "../src/gates.js";
import { deliverEngineChanges, engineTaskOf, EngineWorkspace, ensureEngineBase } from "../src/selfdev.js";
import { runTool, toolDefinitions, type ToolContext } from "../src/tools.js";
import type { CompanyState, Task } from "../src/types.js";
import { Workspace } from "../src/workspace.js";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const ENGINE = "export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport const NAME = \"alicya\";\n";

/** Egy valódi git-repó (main ággal) és a „GitHub” (csupasz origin). */
function repo(): { root: string; origin: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-self-"));
  const origin = path.join(base, "origin.git");
  const root = path.join(base, "work");
  git(base, "init", "-q", "--bare", "-b", "main", origin);
  git(base, "clone", "-q", origin, root);
  git(root, "config", "user.name", "teszt");
  git(root, "config", "user.email", "teszt@example.com");
  git(root, "checkout", "-q", "-b", "main");
  for (const [f, c] of Object.entries({ "src/calc.ts": ENGINE, "test/calc.test.ts": "// teszt\n", "package.json": "{\"name\":\"motor\",\"scripts\":{\"test\":\"vitest run\"}}\n", ".github/workflows/x.yml": "on: push\n", "docs/a.md": "# A\n" })) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), c);
  }
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "alap");
  git(root, "push", "-q", "origin", "main");
  return { root, origin };
}

function engineTask(s: CompanyState, title = "Szorzás a számolóba"): Task {
  return createTask(s, { title, description: "Kell egy mul függvény is, teszttel.", department: "dev", assignee: "tech-lead", engine: true }, "kaizen");
}

const fakeGh = (calls: string[][], failPr = false): Gh => (args) => {
  calls.push(args);
  if (args[0] === "pr" && args[1] === "list") return "[]";
  if (args[0] === "pr" && args[1] === "create") {
    if (failPr) throw new Error("GitHub Actions is not permitted to create pull requests");
    return "https://github.com/o/r/pull/7\n";
  }
  if (args[0] === "issue" && args[1] === "create") return "https://github.com/o/r/issues/8\n";
  return "";
};

describe("önfejlesztés: a motor javaslatként változik", () => {
  it("a valódi motort olvassa, a változás csak a javaslatba kerül, a munkafolyamatokhoz nem nyúlhat", () => {
    const { root } = repo();
    const ws = new EngineWorkspace(root, "T-0001");
    expect(ws.read("src/calc.ts", "code")).toContain("a + b");
    ws.write("src/calc.ts", ENGINE.replace("a + b", "a + b + 0"), "code");
    expect(fs.readFileSync(path.join(root, "src/calc.ts"), "utf8")).toBe(ENGINE);
    expect(ws.read("src/calc.ts", "code")).toContain("a + b + 0");
    expect(fs.existsSync(path.join(root, "state/motor/T-0001/src/calc.ts"))).toBe(true);
    expect(() => ws.write(".github/workflows/x.yml", "on: pull_request\n", "code")).toThrow("nincs jogod");
    expect(() => ws.write("package.json", "{}", "code")).toThrow("nincs jogod");
    expect(() => ws.write("product/x.ts", "x", "code")).toThrow("nincs jogod");
    expect(() => ws.write("src/x.ts", "x", "docs")).toThrow("nincs jogod");
    expect(ws.changed()).toEqual(["src/calc.ts"]);
    expect(ws.diff()).toContain("+  return a + b + 0;");
    const src = Object.fromEntries(ws.sources("motor", "code").map((f) => [f.rel, f.abs]));
    expect(src["package.json"]).toBe(path.join(root, "package.json"));
    expect(src["src/calc.ts"]).toBe(path.join(root, "state/motor/T-0001/src/calc.ts"));
    expect(src[".github/workflows/x.yml"]).toBeUndefined();
    ensureEngineBase(root, "T-0001");
    expect(fs.readFileSync(path.join(root, "state/motor/T-0001/.alap"), "utf8").trim()).toBe(git(root, "rev-parse", "origin/main").trim());
  });

  describe("eszközök", () => {
    beforeEach(() => {
      resetChecksBudget();
      for (const [k, v] of Object.entries({ ALICYA_CHECKS: "", ALICYA_SANDBOX_USER: "", GITHUB_ACTIONS: "" })) vi.stubEnv(k, v);
    });
    afterEach(() => vi.unstubAllEnvs());

    it("a motorfejlesztés saját eszközöket kap, és csak zölden zárható", () => {
      const { root } = repo();
      const s = emptyState();
      const t = engineTask(s);
      const role = roleById("tech-lead")!;
      const ctx: ToolContext = { state: s, role, task: t, workspace: new EngineWorkspace(root, t.id), createdThisRun: { count: 0 }, finished: false, filesWritten: new Set() };
      expect(toolDefinitions(role, t, undefined, true).map((d) => d.name)).toContain("show_changes");
      expect(toolDefinitions(role, t).map((d) => d.name)).not.toContain("show_changes");
      runTool(ctx, "write_file", { path: "src/calc.ts", content: ENGINE + "export const mul = (a: number, b: number) => a * b;\n" });
      expect(runTool(ctx, "show_changes", {}).content).toContain("+export const mul");
      expect(runTool(ctx, "complete_task", { summary: "Kész a szorzás." })).toMatchObject({ isError: true, content: expect.stringContaining("motor") });
      expect(t.notes.at(-1)!.text).toMatch(/^Piros ellenőrzés:/);
      expect(engineTaskOf(s, t)).toBe(t.id);
    });

    it("motorfejlesztést csak vezető adhat ki, kódszerepnek, és ha az önfejlesztés be van kapcsolva", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-self-"));
      const s = emptyState();
      const plan = createTask(s, { title: "Napi tervezés", description: "Nézd át a táblát, és ossz ki munkát.", department: "core", assignee: "ceo", kind: "plan" }, "system");
      const ctxOf = (roleId: string, selfdev = true): ToolContext => ({ state: s, role: roleById(roleId)!, task: plan, workspace: new Workspace(root), createdThisRun: { count: 0 }, finished: false, filesWritten: new Set(), selfdev });
      const input = { title: "Gyorsabb tervezés", description: "A napi tervezés kapja meg a piros ellenőrzések listáját.", department: "dev", assignee: "tech-lead", motor: true };
      expect(runTool(ctxOf("ceo"), "create_task", input).isError).toBe(false);
      const t = s.tasks.find((x) => x.title === "Gyorsabb tervezés")!;
      expect(t).toMatchObject({ engine: true, kind: "code" });
      expect(t.description).toContain("Ez motorfejlesztés");
      expect(runTool(ctxOf("coo"), "create_task", input)).toMatchObject({ isError: true, content: expect.stringContaining("vezető") });
      expect(runTool(ctxOf("ceo", false), "create_task", input)).toMatchObject({ isError: true, content: expect.stringContaining("kikapcsolta") });
      expect(runTool(ctxOf("ceo"), "create_task", { ...input, department: "product", assignee: "product-manager" })).toMatchObject({ isError: true, content: expect.stringContaining("kódszerep") });
    });
  });

  it("az átvizsgált változás ágra kerül a main fölé, és pull request nyílik; a main közbeni változása megmarad", () => {
    const { root, origin } = repo();
    const s = emptyState();
    const t = engineTask(s);
    ensureEngineBase(root, t.id);
    const ws = new EngineWorkspace(root, t.id);
    ws.write("src/calc.ts", ENGINE.replace("return a + b;", "return a + b; // összeadás"), "code");
    ws.write("src/mul.ts", "export const mul = (a: number, b: number) => a * b;\n", "code");
    // Közben a main a fájl másik részén változott.
    git(root, "checkout", "-q", "-b", "mas");
    fs.writeFileSync(path.join(root, "src/calc.ts"), ENGINE.replace('"alicya"', '"alicya-nexus"'));
    git(root, "commit", "-q", "-am", "név");
    git(root, "push", "-q", "origin", "HEAD:main");
    git(root, "checkout", "-q", "main");
    t.status = "done";
    const calls: string[][] = [];
    const r = deliverEngineChanges(s, root, fakeGh(calls), "o/r");
    expect(r).toEqual([expect.objectContaining({ outcome: "pr", url: "https://github.com/o/r/pull/7" })]);
    expect(t.enginePr).toBe("https://github.com/o/r/pull/7");
    const branch = `alicya/motor-${t.id}`;
    const merged = git(origin, "show", `${branch}:src/calc.ts`);
    expect(merged).toContain("// összeadás");
    expect(merged).toContain('"alicya-nexus"');
    expect(git(origin, "show", `${branch}:src/mul.ts`)).toContain("a * b");
    const create = calls.find((c) => c[0] === "pr" && c[1] === "create")!;
    expect(create).toEqual(expect.arrayContaining(["--base", "main", "--head", branch]));
    expect(create[create.indexOf("--body") + 1]).toContain("src/mul.ts");
    // A main ágat nem érintette, a munkakönyvtárat sem.
    expect(git(origin, "show", "main:src/calc.ts")).not.toContain("// összeadás");
    expect(git(root, "status", "--porcelain", "--untracked-files=no")).toBe("");
    // Kétszer nem adja át.
    expect(deliverEngineChanges(s, root, fakeGh([]), "o/r")).toEqual([]);
  });

  it("ütközésnél visszaküldi a fejlesztőnek a jelölőkkel; ha a pull request nem nyitható, issue viszi a linket", () => {
    const { root } = repo();
    const s = emptyState();
    const t = engineTask(s);
    ensureEngineBase(root, t.id);
    new EngineWorkspace(root, t.id).write("src/calc.ts", ENGINE.replace("return a + b;", "return b + a;"), "code");
    fs.writeFileSync(path.join(root, "src/calc.ts"), ENGINE.replace("return a + b;", "return a + b + 0;"));
    git(root, "commit", "-q", "-am", "main változik");
    git(root, "push", "-q", "origin", "main");
    t.status = "done";
    const r = deliverEngineChanges(s, root, fakeGh([]), "o/r");
    expect(r[0]).toMatchObject({ outcome: "conflict" });
    expect(t.status).toBe("todo");
    expect(t.enginePr).toBeUndefined();
    expect(t.notes.at(-1)!.text).toContain("<<<<<<< main");
    const proposal = fs.readFileSync(path.join(root, ENGINE_PATH(t.id)), "utf8");
    expect(proposal).toContain("<<<<<<< main");
    expect(proposal).toContain(">>>>>>> javaslat");
    expect(fs.readFileSync(path.join(root, `state/motor/${t.id}/.alap`), "utf8").trim()).toBe(git(root, "rev-parse", "origin/main").trim());

    // A fejlesztő feloldja, újra kész: a pull request nem nyitható, ezért issue nyílik az összehasonlító linkkel.
    fs.writeFileSync(path.join(root, ENGINE_PATH(t.id)), ENGINE.replace("return a + b;", "return b + a + 0;"));
    t.status = "done";
    const calls: string[][] = [];
    const r2 = deliverEngineChanges(s, root, fakeGh(calls, true), "o/r");
    expect(r2[0]).toMatchObject({ outcome: "issue", url: "https://github.com/o/r/issues/8" });
    const issue = calls.find((c) => c[0] === "issue")!;
    expect(issue[issue.indexOf("--body") + 1]).toContain(`https://github.com/o/r/compare/main...alicya/motor-${t.id}?expand=1`);
  });
});

const ENGINE_PATH = (id: string) => `state/motor/${id}/src/calc.ts`;
