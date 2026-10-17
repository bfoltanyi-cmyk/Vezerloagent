import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { roleById } from "../company/org.js";
import { completeTask, emptyState } from "../src/board.js";
import type { Gh } from "../src/gates.js";
import { applyProject, loadProjects, parseProjectIssue, PROJECT_MARKER, sweepProjectIssues } from "../src/projects.js";
import { runTool, type ToolContext } from "../src/tools.js";
import { Workspace } from "../src/workspace.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nexus-proj-"));
const issue = (req: unknown, extra = "") => `${PROJECT_MARKER}\n<!-- Új projekt a vezérlőteremből. -->\n\n\`\`\`json\n${JSON.stringify(req)}\n\`\`\`\n${extra}`;
const reqOf = (body: string) => {
  const r = parseProjectIssue(body);
  if (!r || "error" in r) throw new Error("hibás kérés");
  return r.request;
};
const req = { nev: "Webshop-integráció", cel: "Az ERP számlázása kapcsolódjon a Shoprenter webshophoz: rendelésből automatikusan számla.", eredmeny: "Egy próbarendelésből NAV-kompatibilis számla lesz.", prioritas: 1, hatarido: "2026-11-30", reszleg: "dev" };

describe("projektek", () => {
  it("a jelölt issue-ból kiolvassa és ellenőrzi a projektet", () => {
    expect(parseProjectIssue("sima issue")).toBeNull();
    const ok = parseProjectIssue(issue(req, "\nA Shoprenter API-dokumentációja a csatolt linken van.\n"));
    expect(ok && "request" in ok && ok.request).toMatchObject({ nev: "Webshop-integráció", prioritas: 1, reszleg: "dev", megkotesek: "" });
    expect(ok && "request" in ok && ok.request.cel).toContain("Kiegészítés: A Shoprenter API-dokumentációja");
    for (const bad of [{ nev: "x", cel: "rövid" }, { ...req, reszleg: "nincsilyen" }, { ...req, prioritas: 5 }, { ...req, hekk: 1 }, { ...req, hatarido: "jövő hét" }]) {
      expect(parseProjectIssue(issue(bad))).toHaveProperty("error");
    }
    expect(parseProjectIssue(`${PROJECT_MARKER}\nnincs blokk`)).toHaveProperty("error");
  });

  it("projektlapot, nyilvántartást és indító feladatot készít; a kiadott munka a projekthez tartozik", () => {
    const root = tmp();
    const s = emptyState();
    const msg = applyProject(s, root, reqOf(issue(req)), 21);
    expect(msg).toContain("P-001");
    const f = loadProjects(root);
    expect(f.projects).toHaveLength(1);
    const p = f.projects[0]!;
    expect(p).toMatchObject({ id: "P-001", title: "Webshop-integráció", issue: 21, deadline: "2026-11-30" });
    expect(fs.readFileSync(path.join(root, p.doc), "utf8")).toContain("NAV-kompatibilis számla");
    const kickoff = s.tasks.find((t) => t.id === p.kickoff)!;
    expect(kickoff).toMatchObject({ assignee: "ceo", kind: "plan", priority: 1, project: "P-001" });
    expect(kickoff.description).toContain(p.doc);
    // Ugyanaz az issue nem lesz kétszer projekt.
    expect(applyProject(s, root, reqOf(issue(req)), 21)).toContain("már rögzítettem");
    expect(loadProjects(root).projects).toHaveLength(1);

    // A vezérigazgató a projekt feladatából ad ki munkát: az is a projekthez tartozik, és az átvizsgálása is.
    const ctx: ToolContext = { state: s, role: roleById("ceo")!, task: kickoff, workspace: new Workspace(root), createdThisRun: { count: 0 }, finished: false, filesWritten: new Set() };
    const r = runTool(ctx, "create_task", { title: "Shoprenter API feltérképezése", description: "Nézd meg a rendelés-API-t és a webhookokat a projektlap alapján.", department: "dev", assignee: "architect", priority: 1 });
    expect(r.isError).toBe(false);
    const child = s.tasks.find((t) => t.title === "Shoprenter API feltérképezése")!;
    expect(child.project).toBe("P-001");
    completeTask(s, child.id, "architect", "Elkészült az API-feltérképezés a docs/dev alatt.");
    const reviews = s.tasks.filter((t) => t.reviewOf === child.id);
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.every((t) => t.project === "P-001")).toBe(true);
  });

  it("feldolgozza a tulajdonos projekt-issue-it, a sikereset csak mentés után zárja le", () => {
    const root = tmp();
    const s = emptyState();
    const calls: string[][] = [];
    const gh: Gh = (args) => {
      calls.push(args);
      if (args[0] === "issue" && args[1] === "list") return JSON.stringify([{ number: 31, body: issue(req) }, { number: 30, body: issue({ nev: "x" }) }, { number: 32, body: "más" }]);
      return "";
    };
    const later: (() => void)[] = [];
    const out = sweepProjectIssues(s, root, gh, "tulaj", later);
    expect(out).toHaveLength(2);
    expect(calls.filter((c) => c[1] === "close").map((c) => [c[2], c[4]])).toEqual([["30", "not planned"]]);
    later.forEach((f) => f());
    expect(calls.filter((c) => c[1] === "close").map((c) => [c[2], c[4]])).toEqual([["30", "not planned"], ["31", "completed"]]);
    expect(sweepProjectIssues(s, root, gh, "")).toEqual([]);
  });
});
