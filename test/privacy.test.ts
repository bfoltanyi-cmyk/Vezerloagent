import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { roleById } from "../company/org.js";
import { JURISDICTIONS, lookup, RULES } from "../company/privacy/knowledge.js";
import { completeTask, createTask, emptyState, seedPrivacyBacklog } from "../src/board.js";
import { renderPrivacyDocs } from "../src/build-privacy-docs.js";
import { runTool, type ToolContext } from "../src/tools.js";
import { Workspace } from "../src/workspace.js";

describe("adatvédelmi tudásbázis", () => {
  it("minden szabálynak egyedi azonosítója, forrása és teendője van", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RULES) {
      expect(r.source.length).toBeGreaterThan(5);
      expect(r.impact.length).toBeGreaterThan(10);
    }
  });

  it("minden országra lefedi a fő témákat", () => {
    for (const j of ["HU", "PL", "CZ"] as const) {
      const topics = new Set(RULES.filter((r) => r.jurisdiction === j).map((r) => r.topic));
      for (const t of ["hatosag", "gyermek", "munkahely", "megorzes", "marketing", "kiberbiztonsag", "szamlazas"] as const) {
        expect(topics, `${j} / ${t}`).toContain(t);
      }
    }
    expect(JURISDICTIONS).toEqual(["EU", "HU", "PL", "CZ"]);
  });

  it("országra szűrve az EU-s szabályokat is adja, a többi országét nem", () => {
    const pl = lookup({ jurisdictions: ["PL"] });
    expect(pl.some((r) => r.jurisdiction === "EU")).toBe(true);
    expect(pl.some((r) => r.jurisdiction === "PL")).toBe(true);
    expect(pl.some((r) => r.jurisdiction === "HU" || r.jurisdiction === "CZ")).toBe(false);
  });

  it("téma és kulcsszó szerint keres", () => {
    const ages = lookup({ topic: "gyermek" });
    expect(ages.find((r) => r.jurisdiction === "CZ")!.rule).toContain("15 év");
    expect(lookup({ jurisdictions: ["PL"], query: "KSeF" }).map((r) => r.id)).toContain("pl-ksef");
  });

  it("a dokumentáció szinkronban van a tudásbázissal", () => {
    expect(fs.readFileSync("docs/security/adatvedelem/README.md", "utf8")).toBe(renderPrivacyDocs());
  });
});

describe("adatvédelmi átvizsgálás", () => {
  const reviewersOf = (s: ReturnType<typeof emptyState>, id: string) =>
    s.tasks.filter((t) => t.reviewOf === id).map((t) => t.assignee).sort();

  it("személyes adatot érintő kódnál a DPO is átvizsgál", () => {
    const s = emptyState();
    const t = createTask(s, { title: "Szabadság-nyilvántartás", description: "Szabadságkérelmek API", department: "dev", assignee: "backend-hr" }, "architect");
    completeTask(s, t.id, "backend-hr", "Kész.");
    expect(reviewersOf(s, t.id)).toEqual(["appsec", "code-reviewer", "privacy-officer"]);
  });

  it("személyes adat nélküli kódnál nem", () => {
    const s = emptyState();
    const t = createTask(s, { title: "CI gyorsítótár", description: "A build gyorsítása npm cache-sel", department: "dev", assignee: "devops" }, "architect");
    completeTask(s, t.id, "devops", "Kész.");
    expect(reviewersOf(s, t.id)).toEqual(["appsec", "code-reviewer"]);
  });

  it("a kulcsszó az összefoglalóban is számít", () => {
    const s = emptyState();
    const t = createTask(s, { title: "Exportfunkció", description: "CSV export riportokból", department: "dev", assignee: "frontend-reports" }, "architect");
    completeTask(s, t.id, "frontend-reports", "Az export a vevő e-mail címét is tartalmazza.");
    expect(reviewersOf(s, t.id)).toContain("privacy-officer");
  });

  it("az induló adatvédelmi feladatok egyszer kerülnek fel", () => {
    const s = emptyState();
    seedPrivacyBacklog(s);
    seedPrivacyBacklog(s);
    expect(s.tasks.filter((t) => t.department === "security")).toHaveLength(4);
    expect(s.tasks.map((t) => t.assignee).sort()).toEqual(["privacy-cz", "privacy-hu", "privacy-officer", "privacy-pl"]);
  });

  it("az agentek eszközként keresnek a tudásbázisban", () => {
    const s = emptyState();
    const task = createTask(s, { title: "Bérjegyzék", description: "Bérjegyzék PDF", department: "dev", assignee: "backend-hr" }, "architect");
    const ctx: ToolContext = { state: s, role: roleById("backend-hr")!, task, workspace: new Workspace("."), createdThisRun: { count: 0 }, finished: false, filesWritten: new Set() };
    const r = runTool(ctx, "privacy_lookup", { jurisdictions: ["CZ"], topic: "munkahely" });
    expect(r.isError).toBe(false);
    expect(r.content).toContain("§ 316");
    expect(runTool(ctx, "privacy_lookup", { jurisdictions: ["DE"] }).isError).toBe(true);
  });
});
