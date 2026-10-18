import type Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { roleById } from "../company/org.js";
import { systemPrompt } from "../src/agent.js";
import { addNote, blockTask, createTask, emptyState, requestGate, decideGate, submitReview, completeTask } from "../src/board.js";
import { loadConfig } from "../src/config.js";
import { applyRetro, collectSignals, lessonsForRole, loadLearning, retrospective, type Learning, type RetroOutput } from "../src/learning.js";
import type { ModelClient, ModelRequest } from "../src/llm.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nexus-learn-"));
const T0 = new Date("2026-10-19T08:00:00Z");
const T1 = new Date("2026-10-19T09:00:00Z");

/** Egy nap, amikor sok minden félrement. */
function badDay() {
  const s = emptyState();
  const old = createTask(s, { title: "Régi", description: "Régi feladat leírása.", department: "dev", assignee: "backend-inventory" }, "owner", new Date("2026-10-01T08:00:00Z"));
  addNote(old, "system", "Elakadt: régi ok", new Date("2026-10-01T09:00:00Z"));
  const code = createTask(s, { title: "Készletmozgás API", description: "A mozgások végpontja tesztekkel.", department: "dev", assignee: "backend-inventory" }, "owner", T0);
  completeTask(s, code.id, "backend-inventory", "Kész az API.", T1);
  const review = s.tasks.find((t) => t.reviewOf === code.id && t.assignee === "code-reviewer")!;
  submitReview(s, review.id, "code-reviewer", "changes", "Hiányzik a negatív készlet tesztje.", T1);
  const doc = createTask(s, { title: "Árazási javaslat", description: "Árazás a KKV-knak, három csomag.", department: "product", assignee: "product-manager" }, "owner", T0);
  const g = requestGate(s, doc.id, "pricing", "Árazás", "Három csomag, havidíjjal és éves kedvezménnyel.", "product-manager", T1);
  decideGate(s, g.id, "rejected", "Túl drága a lengyel piacra.", T1);
  const blocked = createTask(s, { title: "NAV-teszt", description: "NAV tesztkörnyezet bekötése.", department: "dev", assignee: "backend-invoicing" }, "owner", T0);
  blockTask(s, blocked.id, "backend-invoicing", "Nincs NAV tesztfelhasználó.", T1);
  addNote(code, "system", "Piros ellenőrzés: product/backend: test ✗ (kilépési kód 1)", T1);
  return { s, code, doc, blocked };
}

const retro = (o: Partial<RetroOutput>): RetroOutput => ({ osszefoglalo: "Ma a tesztek és az árazás volt a gond.", uj: [], megerosit: [], visszavon: [], ...o });

describe("tanulás a saját munkából", () => {
  it("összegyűjti a nap jelzéseit, a régieket kihagyja", () => {
    const { s, code, doc, blocked } = badDay();
    const sig = collectSignals(s, T0.toISOString());
    const kinds = sig.map((x) => `${x.kind}:${x.task}`);
    expect(kinds).toEqual(expect.arrayContaining([`review:${code.id}`, `checks:${code.id}`, `owner:${doc.id}`, `blocked:${blocked.id}`]));
    expect(sig.find((x) => x.kind === "review")!.text).toContain("negatív készlet");
    expect(sig.find((x) => x.kind === "owner")).toMatchObject({ role: "product-manager", text: "Túl drága a lengyel piacra." });
    expect(sig.some((x) => x.text.includes("régi ok"))).toBe(false);
  });

  it("a tanulságokat rögzíti, összevonja, megerősíti és visszavonja; a motorhibából feladat lesz", () => {
    const { s, code, doc } = badDay();
    const l: Learning = { version: 1, next: 1, lessons: [], retros: [] };
    const sig = collectSignals(s, T0.toISOString());
    const r1 = applyRetro(s, l, retro({
      uj: [
        { szerep: "backend-inventory", szoveg: "Készletmozgásnál mindig írj tesztet a negatív készletre is.", bizonyitek: [code.id] },
        { reszleg: "product", tipus: "doc", szoveg: "Árazásnál a lengyel és cseh vásárlóerőt külön számold.", bizonyitek: [doc.id] },
        { szoveg: "Ennek nincs valódi bizonyítéka, ezért nem kerülhet be.", bizonyitek: ["T-9999"] },
      ],
      motor: { cim: "Piros teszt jelzése a tervezésben", problema: "A vezérigazgató nem látja, mely projektek pirosak, ezért nem ad ki rájuk javítást.", javaslat: "A napi tervezés feladatleírása sorolja fel a piros run_checks eredményeket.", bizonyitek: [code.id] },
    }), sig, { selfdev: true, usd: 0.02 }, T1);
    expect(r1.added).toEqual(["S-0001", "S-0002"]);
    expect(l.lessons[0]).toMatchObject({ role: "backend-inventory", department: undefined, evidence: [code.id] });
    expect(l.lessons[1]).toMatchObject({ department: "product", kind: "doc" });
    const eng = s.tasks.find((t) => t.id === r1.engineTask)!;
    expect(eng).toMatchObject({ engine: true, assignee: "tech-lead", kind: "code", department: "dev" });
    expect(eng.description).toContain("run_checks path-ja itt \"motor\"");

    // Ugyanaz a szöveg megerősítés, nem új; a téves visszavonható; kikapcsolt önfejlesztésnél nincs új motorfeladat.
    const r2 = applyRetro(s, l, retro({
      uj: [{ szerep: "backend-inventory", szoveg: "Készletmozgásnál mindig írj tesztet a negatív készletre is.", bizonyitek: [code.id] }],
      visszavon: [{ id: "S-0002", ok: "A tulajdonos a forintárat kérte." }],
      motor: { cim: "Más", problema: "Valami a motorban, ami elég hosszú leírás.", javaslat: "Valami javítás, ami elég hosszú leírás.", bizonyitek: [code.id] },
    }), sig, { selfdev: false, usd: 0.01 }, T1);
    expect(r2).toMatchObject({ added: [], confirmed: ["S-0001"], retired: ["S-0002"] });
    expect(r2.engineTask).toBeUndefined();
    expect(l.lessons[0]!.confirmations).toBe(2);
    expect(l.lastRetro).toBe(T1.toISOString());
  });

  it("az agent a saját szerepéhez illő, bekapcsolt tanulságokat kapja", () => {
    const at = T1.toISOString();
    const base = { evidence: ["T-0001"], createdAt: at, lastAt: at };
    const l: Learning = {
      version: 1, next: 5, retros: [],
      lessons: [
        { ...base, id: "S-0001", text: "Mindenkinek szóló tanulság.", confirmations: 5 },
        { ...base, id: "S-0002", role: "backend-inventory", text: "Készletes tanulság.", confirmations: 1 },
        { ...base, id: "S-0003", role: "product-manager", text: "Termékes tanulság.", confirmations: 9 },
        { ...base, id: "S-0004", kind: "doc", text: "Dokumentumos tanulság.", confirmations: 3 },
        { ...base, id: "S-0005", department: "dev", text: "Kikapcsolt fejlesztői tanulság.", confirmations: 3 },
        { ...base, id: "S-0006", text: "Visszavont.", confirmations: 9, retired: { at, reason: "téves" } },
      ],
    };
    expect(lessonsForRole(l, roleById("backend-inventory")!, "code", ["S-0005"])).toEqual(["Készletes tanulság.", "Mindenkinek szóló tanulság."]);
    expect(lessonsForRole(l, roleById("product-manager")!, "doc")).toEqual(["Termékes tanulság.", "Dokumentumos tanulság.", "Mindenkinek szóló tanulság."]);
    const p = systemPrompt(roleById("backend-inventory")!, [], ["Készletes tanulság."]);
    expect(p).toContain("Tanulságok a saját munkánkból");
    expect(p).toContain("- Készletes tanulság.");
    expect(systemPrompt(roleById("tech-lead")!, [], [], true)).toContain("motor: true");
    expect(systemPrompt(roleById("backend-inventory")!, [], [], true)).not.toContain("motor: true");
  });

  it("a napi visszatekintés egy modellhívás, a költség a fejlődési vezetőé; jelzés nélkül nem hív", async () => {
    const root = tmp();
    const config = { ...loadConfig({ ANTHROPIC_API_KEY: "x" }, root), rootDir: root };
    const { s, code } = badDay();
    const requests: ModelRequest[] = [];
    const client: ModelClient = {
      async create(req) {
        requests.push(req);
        // Első válasz hibás (rövid összefoglaló), a második jó: egyszer újrakérjük.
        const input = requests.length === 1 ? { osszefoglalo: "x" } : retro({ uj: [{ szerep: "backend-inventory", szoveg: "Készletmozgásnál mindig írj tesztet a negatív készletre is.", bizonyitek: [code.id] }] });
        return {
          id: `m${requests.length}`, type: "message", role: "assistant", model: req.model, stop_reason: "tool_use",
          content: [{ type: "tool_use", id: `tu${requests.length}`, name: "record_retro", input }],
          usage: { input_tokens: 2000, output_tokens: 300 },
        } as unknown as Anthropic.Beta.BetaMessage;
      },
    };
    const r = await retrospective({ state: s, config, client, since: T0.toISOString(), remainingUsd: () => 1, now: T1 });
    expect(requests).toHaveLength(2);
    expect(requests[0]!.tools.map((t) => t.name)).toEqual(["record_retro"]);
    expect(requests[0]!.messages[0]!.content).toContain("negatív készlet");
    expect(r?.added).toEqual(["S-0001"]);
    expect(loadLearning(root).lessons).toHaveLength(1);
    expect(s.ledger.filter((e) => e.role === "kaizen")).toHaveLength(2);

    // Másnap nincs új jelzés: nincs modellhívás.
    const quiet = emptyState();
    expect(await retrospective({ state: quiet, config, client, since: new Date("2026-10-20T08:00:00Z").toISOString(), remainingUsd: () => 1, now: new Date("2026-10-20T09:00:00Z") })).toBeUndefined();
    expect(requests).toHaveLength(2);
  });
});
