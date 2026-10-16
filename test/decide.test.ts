import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTask, emptyState, getTask, requestGate } from "../src/board.js";
import { GUIDANCE_FILE } from "../src/ceo-chat.js";
import { applyDecision, decisionBody, parseCommand, parseDecisionIssue, parseDepartmentToggle, sweepDecisionIssues } from "../src/decide.js";

const t0 = new Date("2026-10-16T08:00:00Z");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alicya-decide-"));
  const s = emptyState();
  const t = createTask(s, { title: "PRD", description: "Termékleírás", department: "product", assignee: "product-manager" }, "ceo", t0);
  const g = requestGate(s, t.id, "spec", "PRD v1", "Nézd át.", "product-manager", t0);
  g.issueNumber = 2;
  return { root, s, t, g };
}

describe("döntés a vezérlőteremből", () => {
  it("a kitöltött döntés-issue-ból kiolvassa a kaput, a döntést és a megjegyzést", () => {
    const body = decisionBody("G-001", "approved") + "Előlegszámla maradjon ki.";
    expect(parseDecisionIssue(body)).toEqual({ gateId: "G-001", decision: "approved", note: "Előlegszámla maradjon ki." });
    expect(parseDecisionIssue("sima issue")).toBeNull();
  });

  it("felismeri a /jóváhagyom és /elutasítom parancsot", () => {
    expect(parseCommand("/jóváhagyom")).toEqual({ decision: "approved", note: "" });
    expect(parseCommand("/elutasítom Kell a NAV export.")).toEqual({ decision: "rejected", note: "Kell a NAV export." });
    expect(parseCommand("Szerintem jó.")).toBeNull();
  });

  it("jóváhagyáskor lezárja a kaput és a megjegyzést az iránymutatásba írja", () => {
    const { root, s, t, g } = setup();
    const calls: string[][] = [];
    const r = applyDecision(s, root, (a) => (calls.push(a), ""), { gateId: g.id, decision: "approved", note: "Örökös licenc." }, "teszt", t0);
    expect(g.status).toBe("approved");
    expect(getTask(s, t.id).status).toBe("done");
    expect(calls.map((c) => c.slice(0, 2))).toEqual([["issue", "edit"], ["issue", "close"]]);
    expect(fs.readFileSync(path.join(root, GUIDANCE_FILE), "utf8")).toContain("Örökös licenc.");
    expect(r.message).toMatch(/jóváhagyva/);
  });

  it("indoklás nélküli elutasítást nem rögzít, és kétszer sem dönt", () => {
    const { root, s, g } = setup();
    applyDecision(s, root, undefined, { gateId: g.id, decision: "rejected", note: "" }, "teszt", t0);
    expect(g.status).toBe("pending");
    applyDecision(s, root, undefined, { gateId: g.id, decision: "rejected", note: "Hiányzik a NAV." }, "teszt", t0);
    expect(g.status).toBe("rejected");
    const r = applyDecision(s, root, undefined, { gateId: g.id, decision: "approved", note: "" }, "teszt", t0);
    expect(g.status).toBe("rejected");
    expect(r.message).toMatch(/már döntöttél/);
  });

  it("a tulajdonos nyitott döntés-issue-it feldolgozza és lezárja", () => {
    const { root, s, g } = setup();
    const calls: string[][] = [];
    const gh = (a: string[]) => {
      calls.push(a);
      return a[1] === "list" ? JSON.stringify([{ number: 9, body: decisionBody(g.id, "approved") }, { number: 10, body: "más" }]) : "";
    };
    expect(sweepDecisionIssues(s, root, gh, "")).toEqual([]);
    sweepDecisionIssues(s, root, gh, "folti");
    expect(g.status).toBe("approved");
    expect(calls.some((c) => c[1] === "close" && c[2] === "9")).toBe(true);
    expect(calls.some((c) => c[2] === "10")).toBe(false);
  });

  it("a vezérlőterem részlegkapcsolóját is feldolgozza", () => {
    const { root, s } = setup();
    expect(parseDepartmentToggle("<!-- alicya-reszleg security off -->")).toEqual({ department: "security", enabled: false });
    const gh = (a: string[]) => (a[1] === "list" ? JSON.stringify([{ number: 11, body: "<!-- alicya-reszleg security off -->" }]) : "");
    const out = sweepDecisionIssues(s, root, gh, "folti");
    expect(s.meta.disabledDepartments).toEqual(["security"]);
    expect(out[0]).toMatch(/kikapcsolva/);
  });
});

