import type Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { roleById } from "../company/org.js";
import { systemPrompt } from "../src/agent.js";
import { arenaSpentThisMonth } from "../src/budget.js";
import { createTask, emptyState } from "../src/board.js";
import { loadConfig } from "../src/config.js";
import { applyResult, ArenaSession, cleanLesson, duelEligible, emptyArena, lessonsFor, loadArena, mergeLessons, pickChallenger, pickJudge, type Duel } from "../src/arena.js";
import type { ModelClient, ModelRequest } from "../src/llm.js";
import { applySettings } from "../src/settings.js";
import { saveState, loadState } from "../src/state.js";
import { workday } from "../src/workday.js";
import { ShadowWorkspace, Workspace } from "../src/workspace.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nexus-arena-"));
let seq = 0;
const msg = (model: string, content: unknown[], stop = "tool_use"): Anthropic.Beta.BetaMessage =>
  ({ id: `m${seq++}`, type: "message", role: "assistant", model, content, stop_reason: stop, usage: { input_tokens: 1000, output_tokens: 100 } }) as unknown as Anthropic.Beta.BetaMessage;
const call = (name: string, input: unknown) => ({ type: "tool_use", id: `tu_${seq++}`, name, input });

/**
 * Hamis modellek: a munkatárs először fájlt ír (a kihívó „KIHÍVÓ” szöveget), aztán lezár;
 * a bíró mindig a kihívó megoldását tartja jobbnak, bármelyik helyen áll.
 */
class Fake implements ModelClient {
  reqs: ModelRequest[] = [];
  constructor(private readonly incumbent: string) {}
  async create(r: ModelRequest) {
    this.reqs.push(r);
    if (r.system.includes("belső versenyének bírája")) {
      const text = String(r.messages[0]!.content);
      const first = text.slice(text.indexOf("## 1. megoldás"), text.indexOf("## 2. megoldás"));
      const s = (n: number) => ({ teljesseg: n, helyesseg: n, szabalyok: n, hasznossag: n });
      const challengerFirst = first.includes("KIHÍVÓ");
      return msg(r.model, [
        call("record_verdict", {
          jobb: challengerFirst ? "1" : "2",
          pont_1: s(challengerFirst ? 9 : 5),
          pont_2: s(challengerFirst ? 5 : 9),
          indoklas: `A ${challengerFirst ? 1 : 2}. megoldás táblázatba szedte a versenytársakat.`,
          tanulsagok: [{ szoveg: "Összehasonlításnál táblázatba szedd a szempontokat, és írd le a forrást.", tipus: ["doc"] }],
          megerositett: [],
        }),
      ]);
    }
    const challenger = r.model !== this.incumbent;
    if (r.messages.length === 1) return msg(r.model, [call("write_file", { path: "docs/product/piac.md", content: challenger ? "# Piac\nKIHÍVÓ táblázat" : "# Piac\nbajnok szöveg" })]);
    if (r.messages.length === 3) return msg(r.model, [call("create_task", { title: challenger ? "Kihívó ötlete" : "Bajnok ötlete", description: "Részletek kidolgozása a következő lépéshez.", department: "product" })]);
    return msg(r.model, [call("complete_task", { summary: challenger ? "Kihívó: kész a piacelemzés táblázattal." : "Bajnok: kész a piacelemzés." })]);
  }
}

function setup(env: Record<string, string> = {}) {
  const root = tmp();
  const s = emptyState();
  const task = createTask(s, { title: "Piaci rés elemzése", description: "Írd le a magyar KKV ERP-piac réseit.", department: "product", assignee: "market-researcher", kind: "doc", priority: 1 }, "ceo");
  saveState(root, s);
  const config = loadConfig({ ANTHROPIC_API_KEY: "a", MAX_TASKS_PER_RUN: "1", ...env }, root);
  return { root, task, config };
}

describe("aréna", () => {
  it("a kihívó árnyékban dolgozik, a bíró vakon kétszer dönt, a győztesből tanulság lesz", async () => {
    const { root, config } = setup();
    const client = new Fake("claude-sonnet-5-5");
    const r = await workday({ config, client, now: new Date() });
    expect(r.tasksRun).toBe(1);

    // A cég valódi munkája a bajnoké; a kihívó fájlja és feladata nem került be.
    expect(fs.readFileSync(path.join(root, "docs/product/piac.md"), "utf8")).toContain("bajnok");
    const s = loadState(root);
    expect(s.tasks.some((t) => t.title === "Kihívó ötlete")).toBe(false);
    expect(s.tasks.some((t) => t.title === "Bajnok ötlete")).toBe(true);
    expect(s.tasks.find((t) => t.title.startsWith("Piaci rés"))!.status).toBe("done");

    // Mindkét megoldás pillanatképe megvan a vezérlőteremnek.
    expect(fs.readFileSync(path.join(root, "state/arena/D-0001/b/docs/product/piac.md"), "utf8")).toContain("KIHÍVÓ");
    expect(fs.readFileSync(path.join(root, "state/arena/D-0001/a/docs/product/piac.md"), "utf8")).toContain("bajnok");

    const a = loadArena(root);
    const d = a.duels[0]!;
    expect(d.a.model).toBe("claude-sonnet-5-5");
    // Munkatársnál a szomszédos szint (Haiku) a kihívó: kiderül, elég-e az olcsóbb.
    expect(d.b.model).toBe("claude-haiku-5-5");
    expect(d.winner).toBe("b");
    expect(d.agreement).toBe(true);
    expect(d.b.quality).toBe(9);
    expect(d.a.quality).toBe(5);
    expect(d.reasoning).toContain("a kihívó megoldása");
    expect(a.ratings["claude-haiku-5-5"]!.elo).toBeGreaterThan(1000);
    expect(a.ratings["claude-sonnet-5-5"]!.elo).toBeLessThan(1000);
    expect(a.lessons).toHaveLength(1);
    expect(a.lessons[0]).toMatchObject({ id: "L-001", from: "claude-haiku-5-5", kinds: ["doc"], confirmations: 1 });

    // A bíró két hívása vak: modellnév nincs benne; a sorrend felcserélt.
    const judgeReqs = client.reqs.filter((x) => x.system.includes("bírája"));
    expect(judgeReqs).toHaveLength(2);
    for (const j of judgeReqs) expect(String(j.messages[0]!.content)).not.toMatch(/sonnet|haiku|claude/i);

    // A kihívó és a bíró költsége a főkönyvben, a párbajhoz kötve.
    expect(s.ledger.filter((e) => e.arena === "D-0001").map((e) => e.role).sort()).toEqual(["arena-judge", "arena-judge", "market-researcher", "market-researcher", "market-researcher"]);
    expect(arenaSpentThisMonth(s)).toBeGreaterThan(0);

    // A tanulságot a következő hasonló feladatnál minden agent megkapja.
    expect(lessonsFor(a, "doc")).toEqual(["Összehasonlításnál táblázatba szedd a szempontokat, és írd le a forrást."]);
    expect(lessonsFor(a, "code")).toEqual([]);
    expect(systemPrompt(roleById("market-researcher")!, lessonsFor(a, "doc"))).toContain("Tanulságok a belső versenyekből");
    expect(lessonsFor(a, "doc", ["L-001"])).toEqual([]);
  });

  it("ügyféllevél, átvizsgálás és kimerült keret mellett nincs párbaj", async () => {
    const s = emptyState();
    const mk = (title: string, description: string, kind: "doc" | "review" = "doc") => createTask(s, { title, description, department: "product", assignee: "market-researcher", kind }, "ceo");
    expect(duelEligible(mk("Válasz", "Válaszolj az E-0004 levélre."))).toBe(false);
    expect(duelEligible(mk("Átnézés", "x", "review"))).toBe(false);
    expect(duelEligible(mk("Elemzés", "Piac"))).toBe(true);

    const { root, config } = setup();
    applySettings(emptyState(), root, { arena: { monthlyUsd: 0 } });
    const c2 = loadConfig({ ANTHROPIC_API_KEY: "a", MAX_TASKS_PER_RUN: "1" }, root);
    expect(c2.arena.monthlyUsd).toBe(0);
    await workday({ config: c2, client: new Fake("claude-sonnet-5-5"), now: new Date() });
    expect(loadArena(root).duels).toHaveLength(0);
    void config;
  });

  it("kikapcsolva nincs párbaj, de a meglévő tanulságokat továbbra is megkapják", async () => {
    const { root } = setup();
    const a = emptyArena();
    a.lessons.push({ id: "L-001", text: "Mindig hivatkozz a meglévő döntésekre a docs/core alól.", kinds: ["all"], from: "x", duel: "D-0001", at: "2026-10-01", confirmations: 2, lastAt: "2026-10-01" });
    fs.mkdirSync(path.join(root, "state"), { recursive: true });
    fs.writeFileSync(path.join(root, "state/arena.json"), JSON.stringify(a));
    applySettings(emptyState(), root, { arena: { enabled: false } });
    const client = new Fake("claude-sonnet-5-5");
    await workday({ config: loadConfig({ ANTHROPIC_API_KEY: "a", MAX_TASKS_PER_RUN: "1" }, root), client, now: new Date() });
    expect(loadArena(root).duels).toHaveLength(0);
    expect(client.reqs.every((r) => r.model === "claude-sonnet-5-5")).toBe(true);
    expect(client.reqs[0]!.system).toContain("hivatkozz a meglévő döntésekre");
  });

  it("kiegyensúlyozottan párosít, csak kulccsal rendelkező modellt hív, és a bíró lehetőleg harmadik szolgáltató", () => {
    const config = loadConfig({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }, tmp());
    const role = roleById("market-researcher")!;
    const a = emptyArena();
    const first = pickChallenger(a, config, role, "claude-sonnet-5-5")!;
    expect(first).not.toMatch(/^kimi:/);
    a.duels.push({ a: { model: "claude-sonnet-5-5" }, b: { model: first } } as unknown as Duel);
    const second = pickChallenger(a, config, role, "claude-sonnet-5-5")!;
    expect(second).not.toBe(first);
    // Kiesett szolgáltató nem versenyez.
    expect(pickChallenger(emptyArena(), config, role, "claude-sonnet-5-5", new Set(["openai"]))).toBe("claude-haiku-5-5");
    // Beállított versenyzők.
    const own = { ...config, arena: { ...config.arena, contestants: ["openai:gpt-6-luna", "claude-sonnet-5-5"] } };
    expect(pickChallenger(emptyArena(), own, role, "claude-sonnet-5-5")).toBe("openai:gpt-6-luna");

    expect(pickJudge(config, "claude-sonnet-5-5", "claude-haiku-5-5")).toBe("openai:gpt-6-astra");
    expect(pickJudge(config, "claude-sonnet-5-5", "openai:gpt-6-luna")).toBe("claude-opus-5-5");
    expect(pickJudge({ ...config, arena: { ...config.arena, judge: "openai:gpt-6.1-sol" } }, "a", "b")).toBe("openai:gpt-6.1-sol");
  });

  it("az árnyék-munkaterület olvassa a valódit, de nem írja", () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, "docs/core"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs/core/a.md"), "valódi");
    const overlay = tmp();
    const w = new ShadowWorkspace(root, overlay);
    expect(w.read("docs/core/a.md", "docs")).toBe("valódi");
    w.write("docs/core/a.md", "árnyék", "docs");
    w.write("docs/core/b.md", "új", "docs");
    expect(w.read("docs/core/a.md", "docs")).toBe("árnyék");
    expect(fs.readFileSync(path.join(root, "docs/core/a.md"), "utf8")).toBe("valódi");
    expect(fs.existsSync(path.join(root, "docs/core/b.md"))).toBe(false);
    expect(w.list("docs", "docs")).toEqual(["docs/core/a.md", "docs/core/b.md"]);
    expect(() => w.write("../kint.md", "x", "docs")).toThrow();
    expect(() => w.write("product/x.ts", "x", "docs")).toThrow();
    expect(w.shadowRead("docs/core/b.md")).toBe("új");
    expect(w.shadowRead("../../etc/passwd")).toBeUndefined();
    expect(new Workspace(root).list("docs", "docs")).toEqual(["docs/core/a.md"]);
  });

  it("a hasonló tanulságot megerősítésnek veszi, a szemetet eldobja", () => {
    const a = emptyArena();
    const d = { id: "D-0001", winner: "a", a: { model: "x" }, b: { model: "y" } } as unknown as Duel;
    const now = new Date("2026-10-17T08:00:00Z");
    expect(mergeLessons(a, d, [{ text: "Kódnál előbb a tesztet írd meg, aztán a megvalósítást.", kinds: ["code"] }], [], now)).toEqual(["L-001"]);
    expect(mergeLessons(a, d, [{ text: "Kódnál előbb a tesztet írd meg, és aztán a megvalósítást!", kinds: ["code"] }, { text: "rövid", kinds: ["all"] }], ["L-999"], now)).toEqual(["L-001"]);
    expect(a.lessons).toHaveLength(1);
    expect(a.lessons[0]!.confirmations).toBe(2);
    expect(a.lessons[0]!.from).toBe("x");
    expect(cleanLesson("# Cím\n```js\nrm -rf\n``` Nézd meg https://rossz.example a **forrást** mindig, mielőtt írsz.")).toBe("Cím Nézd meg a forrást mindig, mielőtt írsz.");
  });

  it("az Élő-pontszám a meglepő győzelemért többet ad", () => {
    const a = emptyArena();
    const side = (model: string) => ({ model, usd: 0.1, turns: 3, outcome: "finished", closure: "", summary: "", files: [], quality: 7, scores: { teljesseg: 7, helyesseg: 7, szabalyok: 7, hasznossag: 7 } });
    a.ratings["erős"] = { elo: 1200, games: 20, wins: 15, losses: 5, ties: 0, usd: 2, turns: 60, quality: 160 };
    applyResult(a, { id: "D-1", kind: "doc", winner: "b", a: side("erős"), b: side("új") } as unknown as Duel);
    expect(a.ratings["új"]!.elo).toBeGreaterThan(1020);
    expect(a.ratings["erős"]!.elo).toBeLessThan(1192);
    expect(a.ratings["új"]).toMatchObject({ games: 1, wins: 1, turns: 3 });
    expect(a.byKind.doc!["új"]).toBeGreaterThan(1000);
  });
});

describe("aréna munkamenet", () => {
  it("ha a kihívó szolgáltatója hibát ad, a párbaj elmarad, a valódi munka megy tovább", async () => {
    const { root, config } = setup({ OPENAI_API_KEY: "o" });
    const own = { ...config, arena: { ...config.arena, contestants: ["openai:gpt-6-luna"] } };
    const inner = new Fake("claude-sonnet-5-5");
    const client: ModelClient = { create: (r) => (r.model.startsWith("openai:") ? Promise.reject(new Error("OpenAI hívás sikertelen: 500")) : inner.create(r)) };
    const r = await workday({ config: own, client, now: new Date() });
    expect(r.tasksRun).toBe(1);
    expect(loadArena(root).duels).toHaveLength(0);
    expect(loadState(root).events.some((e) => e.text.includes("a kihívó (openai:gpt-6-luna) nem tudott dolgozni"))).toBe(true);
    void ArenaSession;
  });
});
