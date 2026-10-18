import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roleById } from "../company/org.js";
import { systemPrompt } from "../src/agent.js";
import { createTask, emptyState } from "../src/board.js";
import { checksMode, findProjects, projectOf, resetChecksBudget, runChecks } from "../src/checks.js";
import { codeMap, outline, searchCode } from "../src/codeintel.js";
import { loadConfig, taskLimits } from "../src/config.js";
import { runTool, toolDefinitions, type ToolContext } from "../src/tools.js";
import { ShadowWorkspace, Workspace } from "../src/workspace.js";

const LOCAL = { ALICYA_CHECKS: "", ALICYA_SANDBOX_USER: "", GITHUB_ACTIONS: "" };

function repo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-checks-"));
  const put = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  // Függőség nélküli projekt: a teszt egy sima node-szkript, a lint egy nem telepített eszköz.
  put("product/app/package.json", JSON.stringify({ name: "app", type: "module", scripts: { test: "node test.js", lint: "nincs-ilyen-linter src" } }));
  put("product/app/src/sum.js", "export function sum(a, b) {\n  return a + b;\n}\n");
  put("product/app/test.js", 'import("./src/sum.js").then(({ sum }) => { if (sum(2, 2) !== 4) { console.error("sum hibás"); process.exit(1); } console.log("1 passed; titok:" + (process.env.ALICYA_TEST_SECRET ?? "nincs")); });\n');
  put("product/app/.env", "TITOK=1\n");
  put("product/web/package.json", JSON.stringify({ name: "web", scripts: {} }));
  put("product/db/migrations/0001.up.sql", "CREATE TABLE IF NOT EXISTS invoices (id uuid primary key);\ncreate unique index invoices_no on invoices(no);\n");
  put("docs/dev/a.md", "# Architektúra\n");
  return root;
}

describe("kódolvasás", () => {
  it("kódtérképet ad: fájlok, sorok, exportok, táblák, szkriptek", () => {
    const ws = new Workspace(repo());
    const map = codeMap(ws, "docs");
    expect(map).toContain("product/app/src/sum.js (4 sor)");
    expect(map).toContain("function sum :1");
    expect(map).toContain("table invoices :1");
    expect(map).toContain("index invoices_no :2");
    expect(map).toContain("script test: node test.js");
    expect(map).not.toContain(".env");
    expect(outline("a.ts", "@Controller('invoices')\nexport class InvoicesController {\n  @Get(':id')\n  find() {}\n}\nexport default async function main() {}\n")).toEqual([
      "@Controller('invoices')",
      "class InvoicesController :2",
      "  GET ':id' :3",
      "function main (default) :6",
    ]);
  });

  it("keres a kódban, szövegre és mintára is", () => {
    const ws = new Workspace(repo());
    expect(searchCode(ws, "docs", { query: "return a + b" })).toContain("product/app/src/sum.js:2: return a + b;");
    expect(searchCode(ws, "docs", { query: "sum\\(\\d", regex: true })).toContain("product/app/test.js:1:");
    expect(searchCode(ws, "docs", { query: "Architektúra", path: "docs" })).toContain("docs/dev/a.md:1");
    expect(searchCode(ws, "docs", { query: "SUM(", caseSensitive: true })).toContain("Nincs találat");
    expect(() => searchCode(ws, "docs", { query: "(", regex: true })).toThrow("Hibás reguláris");
    expect(() => searchCode(ws, "docs", { query: "x", path: "src" })).toThrow("nincs jogod");
  });

  it("a kihívó árnyékmásolatában a saját fájljai számítanak", () => {
    const root = repo();
    const overlay = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-ov-"));
    const ws = new ShadowWorkspace(root, overlay);
    ws.write("product/app/src/sum.js", "export const sum = (a, b) => a - b;\n", "code");
    ws.write("product/app/src/uj.js", "export const x = 1;\n", "code");
    const src = Object.fromEntries(ws.sources("product/app", "code").map((f) => [f.rel, f.abs]));
    expect(src["src/sum.js"]!.startsWith(overlay)).toBe(true);
    expect(src["src/uj.js"]).toBeDefined();
    expect(src["test.js"]!.startsWith(root)).toBe(true);
    expect(src[".env"]).toBeUndefined();
    expect(fs.readFileSync(path.join(root, "product/app/src/sum.js"), "utf8")).toContain("a + b");
  });
});

describe("kódellenőrzés", () => {
  beforeEach(() => {
    resetChecksBudget();
    for (const [k, v] of Object.entries(LOCAL)) vi.stubEnv(k, v);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("az Actionsben csak elkülönített felhasználóval fut", () => {
    expect(checksMode({})).toBe("local");
    expect(checksMode({ GITHUB_ACTIONS: "true" })).toBe("off");
    expect(checksMode({ GITHUB_ACTIONS: "true", ALICYA_SANDBOX_USER: "alicya-sandbox" })).toBe("sandbox");
    expect(checksMode({ ALICYA_CHECKS: "off", ALICYA_SANDBOX_USER: "x" })).toBe("off");
    expect(() => runChecks(new Workspace(repo()), "code", "product/app", undefined, { GITHUB_ACTIONS: "true" })).toThrow("nem érhető el");
  });

  it("megtalálja a projekteket", () => {
    const projects = findProjects(repo());
    expect(projects).toEqual(["product/app", "product/web"]);
    expect(projectOf(projects, "product/app/src/sum.js")).toBe("product/app");
    expect(projectOf(projects, "product/app/")).toBe("product/app");
    expect(projectOf(projects, "product/db/x.sql")).toBeUndefined();
    expect(projectOf(projects, "product/apple/x.js")).toBeUndefined();
  });

  it("lefuttatja a teszteket titkok nélkül, és jelzi a hibát", () => {
    vi.stubEnv("ALICYA_TEST_SECRET", "nagyon-titkos");
    const root = repo();
    const ws = new Workspace(root);
    const ok = runChecks(ws, "code", "product/app", undefined, LOCAL);
    expect(ok.ok).toBe(true);
    expect(ok.steps.map((s) => [s.step, s.status])).toEqual([
      ["install", "skipped"],
      ["typecheck", "skipped"],
      ["lint", "skipped"],
      ["test", "ok"],
    ]);
    const test = ok.steps.find((s) => s.step === "test")!;
    expect(test.output).toContain("1 passed; titok:nincs");
    expect(JSON.stringify(ok)).not.toContain("nagyon-titkos");

    fs.writeFileSync(path.join(root, "product/app/src/sum.js"), "export function sum(a, b) {\n  return a - b;\n}\n");
    const bad = runChecks(ws, "code", "product/app", undefined, LOCAL);
    expect(bad.ok).toBe(false);
    expect(bad.steps.find((s) => s.step === "test")).toMatchObject({ status: "fail", note: "kilépési kód 1" });
    expect(bad.steps.find((s) => s.step === "test")!.output).toContain("sum hibás");
  });
});

describe("eszközök és a „kész csak zölden” szabály", () => {
  beforeEach(() => {
    resetChecksBudget();
    for (const [k, v] of Object.entries(LOCAL)) vi.stubEnv(k, v);
  });
  afterEach(() => vi.unstubAllEnvs());

  const ctxFor = (root: string, roleId: string, kind: "code" | "doc") => {
    const s = emptyState();
    const role = roleById(roleId)!;
    const task = createTask(s, { title: "Összeadás javítása", description: "A sum függvény és a tesztje.", department: role.department, assignee: roleId, kind }, "owner");
    const ctx: ToolContext = { state: s, role, task, workspace: new Workspace(root), createdThisRun: { count: 0 }, finished: false, filesWritten: new Set() };
    return { s, task, ctx };
  };

  it("mindenki olvashat kódot, futtatni csak a kódszerepek", () => {
    const { task } = ctxFor(repo(), "backend-invoicing", "code");
    const names = (id: string) => toolDefinitions(roleById(id)!, task).map((t) => t.name);
    expect(names("backend-invoicing")).toEqual(expect.arrayContaining(["code_map", "search_code", "run_checks"]));
    expect(names("product-manager")).toEqual(expect.arrayContaining(["code_map", "search_code"]));
    expect(names("product-manager")).not.toContain("run_checks");
    vi.stubEnv("GITHUB_ACTIONS", "true");
    expect(names("backend-invoicing")).not.toContain("run_checks");
  });

  it("kódfeladat csak zöld ellenőrzés után zárható, és az eredmény az átvizsgálókhoz kerül", () => {
    const root = repo();
    const { s, task, ctx } = ctxFor(root, "backend-invoicing", "code");
    expect(runTool(ctx, "complete_task", { summary: "Kész az összeadás." })).toMatchObject({ isError: true, content: expect.stringContaining("zöld ellenőrzéssel") });

    expect(runTool(ctx, "write_file", { path: "product/app/src/sum.js", content: "export function sum(a, b) {\n  return a - b;\n}\n" }).isError).toBe(false);
    expect(runTool(ctx, "run_checks", { path: "product/app" }).content).toContain("PIROS");
    expect(runTool(ctx, "complete_task", { summary: "Kész az összeadás." })).toMatchObject({ isError: true, content: expect.stringContaining("product/app") });

    runTool(ctx, "write_file", { path: "product/app/src/sum.js", content: "export function sum(a, b) {\n  return a + b;\n}\n" });
    // Részleges ellenőrzés (teszt nélkül) nem elég.
    expect(runTool(ctx, "run_checks", { path: "product/app/src", steps: ["typecheck"] }).content).toContain("Részleges");
    expect(runTool(ctx, "complete_task", { summary: "Kész az összeadás." }).isError).toBe(true);
    const green = runTool(ctx, "run_checks", { path: "product/app/src" });
    expect(green).toMatchObject({ isError: false, content: expect.stringContaining("ZÖLD") });
    expect(runTool(ctx, "complete_task", { summary: "Kész az összeadás." })).toMatchObject({ isError: false });
    expect(task.status).toBe("review");
    const review = s.tasks.find((t) => t.reviewOf === task.id)!;
    expect(review.description).toContain("Ellenőrzés: product/app: install –");
    expect(review.description).toContain("test ✓");
    expect(review.description).toContain("Módosított fájlok: product/app/src/sum.js");

    expect(runTool(ctx, "run_checks", { path: "product/db" })).toMatchObject({ isError: true, content: expect.stringContaining("nem egy projekt") });
  });

  it("dokumentumfeladatot és ellenőrzés nélküli környezetet nem köt", () => {
    const root = repo();
    expect(runTool(ctxFor(root, "product-manager", "doc").ctx, "complete_task", { summary: "Kész a specifikáció." }).isError).toBe(false);
    vi.stubEnv("GITHUB_ACTIONS", "true");
    const { ctx, s, task } = ctxFor(root, "backend-invoicing", "code");
    runTool(ctx, "write_file", { path: "product/app/src/sum.js", content: "export const sum = (a, b) => a + b;\n" });
    expect(runTool(ctx, "complete_task", { summary: "Kész az összeadás." }).isError).toBe(false);
    expect(s.tasks.find((t) => t.reviewOf === task.id)!.description).toContain("Ellenőrzés: nem futott");
  });

  it("a kódszerepek a fejlesztés menetét, mindenki a kódolvasást kapja meg a promptban", () => {
    expect(systemPrompt(roleById("product-manager")!)).toContain("code_map");
    expect(systemPrompt(roleById("product-manager")!)).not.toContain("run_checks");
    expect(systemPrompt(roleById("backend-invoicing")!)).toContain("Csak zölden zárhatod le");
  });

  it("a kódfeladat több lépést és keretet kap", () => {
    const c = loadConfig({}, repo());
    expect(taskLimits(c, "code")).toEqual({ turns: 20, usd: 1.2 });
    expect(taskLimits(c, "doc")).toEqual({ turns: 8, usd: 0.6 });
    expect(taskLimits(loadConfig({ MAX_TURNS_PER_CODE_TASK: "30", CODE_TASK_BUDGET_USD: "2" }, repo()), "code")).toEqual({ turns: 30, usd: 2 });
  });
});
