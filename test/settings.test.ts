import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { roleById } from "../company/org.js";
import { emptyState } from "../src/board.js";
import { costUsd } from "../src/budget.js";
import { loadConfig, modelFor } from "../src/config.js";
import type { Gh } from "../src/gates.js";
import { applySettings, parseSettingsIssue, readSettings, SETTINGS_FILE, SETTINGS_MARKER, sweepSettingsIssues } from "../src/settings.js";
// @ts-expect-error: függőség nélküli JS-modul (a GitHub-futtatón telepítés nélkül fut)
import { localDayHour, shouldRunNow } from "../scripts/schedule.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nexus-set-"));
const issue = (patch: unknown) => `${SETTINGS_MARKER}\nSzöveg\n\n\`\`\`json\n${JSON.stringify(patch)}\n\`\`\`\n`;

describe("beállítások", () => {
  it("a jelölt issue-ból kiolvassa és ellenőrzi a változtatást", () => {
    expect(parseSettingsIssue("sima issue")).toBeNull();
    const ok = parseSettingsIssue(issue({ models: { worker: "kimi:kimi-k2.6", roles: { architect: "openai:gpt-6-sol" } }, budget: { monthlyUsd: 80 } }));
    expect(ok).toEqual({ patch: { models: { worker: "kimi:kimi-k2.6", roles: { architect: "openai:gpt-6-sol" } }, budget: { monthlyUsd: 80 } } });
    // Ismeretlen szolgáltató, ismeretlen mező, ismeretlen szerep, rossz összeg: semmi nem kerül be.
    for (const bad of [{ models: { worker: "valami:x" } }, { hekk: true }, { models: { roles: { nincsilyen: "claude-haiku-5-5" } } }, { budget: { monthlyUsd: -5 } }, { models: { lead: "claude sonnet; rm -rf" } }]) {
      expect(parseSettingsIssue(issue(bad))).toHaveProperty("error");
    }
    expect(parseSettingsIssue(`${SETTINGS_MARKER}\n\`\`\`json\n{nem json\n\`\`\``)).toHaveProperty("error");
  });

  it("összefésüli a változtatást; a null visszaállítja az alapot; a részlegeket is kapcsolja", () => {
    const root = tmp();
    const s = emptyState();
    applySettings(s, root, { models: { worker: "kimi:kimi-k2.6", roles: { architect: "openai:gpt-6-sol", "qa-lead": "claude-haiku-5-5" } }, schedule: { hours: [16, 8, 8] }, paused: true });
    expect(readSettings(root)).toEqual({ models: { worker: "kimi:kimi-k2.6", roles: { architect: "openai:gpt-6-sol", "qa-lead": "claude-haiku-5-5" } }, schedule: { hours: [8, 16] }, paused: true });
    const msg = applySettings(s, root, { models: { roles: { architect: null } }, paused: null, departments: { security: false } });
    expect(readSettings(root)).toEqual({ models: { worker: "kimi:kimi-k2.6", roles: { "qa-lead": "claude-haiku-5-5" } }, schedule: { hours: [8, 16] } });
    expect(s.meta.disabledDepartments).toContain("security");
    expect(msg).toMatch(/AI-motorok, szünet, részlegek/);
    expect(applySettings(s, root, { paused: null })).toBe("A beállítások nem változtak.");
    expect(s.events.at(-1)!.text).toMatch(/Beállítások módosítva/);
  });

  it("a beállítás erősebb a GitHub-változónál, és agentenként is adható motor", () => {
    const root = tmp();
    applySettings(emptyState(), root, {
      models: { lead: "openai:gpt-6.1-sol", roles: { architect: "kimi:kimi-k3" } },
      effort: { worker: "high" },
      budget: { monthlyUsd: 120, taskUsd: 1, chatUsd: 0.2, maxTasksPerRun: 10 },
      inbox: { createTasks: false },
      prices: { "openai:sajat": { input: 1, output: 2 } },
    });
    const c = loadConfig({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", MOONSHOT_API_KEY: "m", MODEL_LEAD: "claude-opus-5-5", MONTHLY_BUDGET_USD: "30" }, root);
    expect(c.models.lead).toBe("openai:gpt-6.1-sol");
    expect(c.monthlyBudgetUsd).toBe(120);
    expect(c.taskBudgetUsd).toBe(1);
    expect(c.chatBudgetUsd).toBe(0.2);
    expect(c.maxTasksPerRun).toBe(10);
    expect(c.effort.worker).toBe("high");
    expect(c.inbox).toEqual({ enabled: true, createTasks: false });
    expect(modelFor(c, roleById("architect")!)).toBe("kimi:kimi-k3");
    expect(modelFor(c, roleById("ceo")!)).toBe("claude-opus-5-5");
    expect(costUsd("openai:sajat", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(3);
    // Egyedi agentmotor kulcsa is kell.
    expect(loadConfig({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }, root).missingKeys).toEqual(["MOONSHOT_API_KEY"]);
  });

  it("egy kézzel elrontott beállítás nem állítja le a céget", () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, "state"), { recursive: true });
    fs.writeFileSync(path.join(root, SETTINGS_FILE), JSON.stringify({ version: 1, settings: { models: { worker: "ismeretlen:x", roles: { architect: "rossz:y" } } } }));
    const c = loadConfig({ ANTHROPIC_API_KEY: "a" }, root);
    expect(c.models.worker).toBe("claude-sonnet-5-5");
    expect(c.roleModels).toEqual({});
    fs.writeFileSync(path.join(root, SETTINGS_FILE), "nem json");
    expect(loadConfig({ ANTHROPIC_API_KEY: "a" }, root).models.worker).toBe("claude-sonnet-5-5");
  });

  it("a tulajdonos beállítás-issue-it sorban feldolgozza és lezárja", () => {
    const root = tmp();
    const s = emptyState();
    const calls: string[][] = [];
    const gh: Gh = (args) => {
      calls.push(args);
      if (args[0] === "issue" && args[1] === "list") return JSON.stringify([{ number: 12, body: issue({ paused: false }) }, { number: 11, body: issue({ paused: true }) }, { number: 13, body: issue({ hekk: 1 }) }, { number: 14, body: "más" }]);
      return "";
    };
    const out = sweepSettingsIssues(s, root, gh, "tulaj");
    expect(out).toHaveLength(3);
    // A régebbi (#11) előbb, így az újabb (#12) dönt: nincs szünet.
    expect(readSettings(root).paused).toBe(false);
    const closes = calls.filter((c) => c[1] === "close").map((c) => [c[2], c[4]]);
    expect(closes).toEqual([["11", "completed"], ["12", "completed"], ["13", "not planned"]]);
    expect(sweepSettingsIssues(s, root, gh, "")).toEqual([]);
  });
});

describe("munkarend", () => {
  it("budapesti idő szerint számol, nyári és téli időben is", () => {
    expect(localDayHour(new Date("2026-10-19T06:30:00Z"))).toEqual({ day: 1, hour: 8 }); // hétfő, nyári idő (UTC+2)
    expect(localDayHour(new Date("2026-11-02T07:30:00Z"))).toEqual({ day: 1, hour: 8 }); // hétfő, téli idő (UTC+1)
    expect(localDayHour(new Date("2026-10-16T22:10:00Z"))).toEqual({ day: 6, hour: 0 }); // péntek éjfél után már szombat
  });

  it("alapból hétköznap 8 és 16 órakor dolgozik; szünetben soha", () => {
    expect(shouldRunNow({}, new Date("2026-10-19T06:05:00Z")).run).toBe(true);
    expect(shouldRunNow({}, new Date("2026-10-19T08:05:00Z")).run).toBe(false); // 10:05, a 8 órás sáv lejárt
    expect(shouldRunNow({}, new Date("2026-10-17T06:05:00Z")).run).toBe(false); // szombat
    expect(shouldRunNow({ paused: true }, new Date("2026-10-19T06:05:00Z")).run).toBe(false);
    expect(shouldRunNow({ schedule: { days: [6], hours: [10] } }, new Date("2026-10-17T08:20:00Z")).run).toBe(true);
    expect(shouldRunNow({ schedule: { hours: [] } }, new Date("2026-10-19T06:05:00Z")).run).toBe(false);
  });

  it("a késve induló ütemezés még elindítja a munkanapot, de egy munkaóra csak egyszer fut", () => {
    // 9:20 budapesti idő: a 8 órás sáv még él, ha ma még nem futott.
    expect(shouldRunNow({}, new Date("2026-10-19T07:20:00Z")).run).toBe(true);
    expect(shouldRunNow({}, new Date("2026-10-19T07:20:00Z"), "2026-10-19T06:17:00Z").run).toBe(false);
    // Tegnapi futás nem számít.
    expect(shouldRunNow({}, new Date("2026-10-19T06:17:00Z"), "2026-10-16T14:17:00Z").run).toBe(true);
    // 9:35 már túl késő a 8 órás sávhoz.
    expect(shouldRunNow({}, new Date("2026-10-19T07:35:00Z")).run).toBe(false);
  });

  it("egy modell ára egészben cserélődik, és az előtag írásmódja nem számít", () => {
    const root = tmp();
    applySettings(emptyState(), root, { prices: { "openai:sajat": { input: 1, output: 2, cacheRead: 0.5 } } });
    applySettings(emptyState(), root, { prices: { "openai:sajat": { input: 3, output: 4 } } });
    expect(readSettings(root).prices).toEqual({ "openai:sajat": { input: 3, output: 4 } });
    applySettings(emptyState(), root, { prices: { "moonshot:k-x": { input: 1, output: 1 } } });
    loadConfig({ ANTHROPIC_API_KEY: "a" }, root);
    expect(costUsd("kimi:k-x", { input_tokens: 1_000_000, output_tokens: 0 })).toBe(1);
    applySettings(emptyState(), root, { prices: { "openai:sajat": null, "moonshot:k-x": null } });
    expect(readSettings(root).prices).toBeUndefined();
  });
});
