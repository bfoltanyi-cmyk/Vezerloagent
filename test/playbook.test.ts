import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DEPARTMENTS, ROLES } from "../company/org.js";
import { DEPARTMENT_PLAYBOOK, DUTIES, LIFECYCLE, playbookFor, renderHandbook } from "../company/playbook.js";
import { systemPrompt } from "../src/agent.js";

describe("kézikönyv", () => {
  it("minden szerepnek és részlegnek van munkarendje, és a fázisok felelősei létező szerepek", () => {
    for (const r of ROLES) expect(DUTIES[r.id], r.id).toBeDefined();
    expect(Object.keys(DUTIES).sort()).toEqual(ROLES.map((r) => r.id).sort());
    for (const d of DEPARTMENTS) expect(DEPARTMENT_PLAYBOOK[d.id].length).toBeGreaterThan(0);
    for (const p of LIFECYCLE) for (const o of p.owners) expect(ROLES.some((r) => r.id === o), `${p.id}: ${o}`).toBe(true);
  });

  it("minden agent a saját részét kapja a rendszerpromptban", () => {
    const dev = ROLES.find((r) => r.id === "backend-invoicing")!;
    const p = systemPrompt(dev);
    expect(p).toContain("product/backend/src/modules/invoicing/");
    expect(p).toContain("Definition of Done");
    expect(p).toContain("4. Fejlesztés");
    expect(playbookFor(ROLES.find((r) => r.id === "pricing-analyst")!)).toContain("pricing kapu");
    // A rendszerprompt szerepenként stabil marad, hogy gyorsítótárazható legyen.
    expect(systemPrompt(dev)).toBe(p);
  });

  it("a docs/core/kezikonyv.md naprakész", () => {
    expect(fs.readFileSync("docs/core/kezikonyv.md", "utf8")).toBe(renderHandbook());
  });
});
