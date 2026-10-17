import type Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { roleById } from "../company/org.js";
import { createTask, emptyState, setDepartmentEnabled } from "../src/board.js";
import { loadConfig } from "../src/config.js";
import { processEmails, type RawEmail } from "../src/inbox.js";
import { emptyInbox, loadInbox, open, readEmailFor, saveInbox, seal } from "../src/inbox-store.js";
import type { ModelClient } from "../src/llm.js";
import { runTool, toolDefinitions } from "../src/tools.js";
import { Workspace } from "../src/workspace.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nexus-inbox-"));

const reply = (input: Record<string, unknown>): Anthropic.Beta.BetaMessage =>
  ({
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [{ type: "tool_use", id: "t", name: "record_email", input }],
    stop_reason: "tool_use",
    usage: { input_tokens: 500, output_tokens: 100 },
  }) as unknown as Anthropic.Beta.BetaMessage;

const fields = (category: string, extra: Record<string, unknown> = {}) => ({
  category,
  urgency: "magas",
  summary: "Kovács Anna a Példa Kft.-től ajánlatot kér 12 felhasználóra.",
  public_title: "Ajánlatkérés 12 fős kereskedőcégnek",
  public_summary: "Árajánlatot kérnek számlázásra és készletkezelésre, november elejéig.",
  company: "Példa Kft.",
  contact_name: "Kovács Anna",
  phone: "+36 30 123 4567",
  deadline: "2026-11-05",
  amounts: ["12 felhasználó"],
  products: ["Alicya ERP"],
  actions: ["Árajánlat küldése"],
  needs_reply: true,
  ...extra,
});

const mail = (uid: number, subject: string): RawEmail => ({
  uid,
  receivedAt: "2026-10-16T08:00:00.000Z",
  from: "anna@pelda.hu",
  fromName: "Kovács Anna",
  subject,
  text: "Jó napot! Árajánlatot kérnénk. Kovács Anna, +36 30 123 4567",
  attachments: [],
});

const client = (answers: Record<string, unknown>[]): ModelClient => {
  let i = 0;
  return { async create() { return reply(answers[i++]!); } };
};

describe("postafiók", () => {
  it("a titkosítás oda-vissza működik, rossz jelmondattal nem nyílik", () => {
    const sealed = seal({ a: "ékezetes ő" }, "titok");
    expect(JSON.stringify(sealed)).not.toContain("ékezetes");
    expect(open<{ a: string }>(sealed, "titok").a).toBe("ékezetes ő");
    expect(() => open(sealed, "rossz")).toThrow();
  });

  it("feladat csak személyes adat nélküli szöveggel készül; hírlevélből nincs feladat", async () => {
    const root = tmp();
    const config = loadConfig({ ANTHROPIC_API_KEY: "x" }, root);
    const s = emptyState();
    const inbox = emptyInbox();
    const added = await processEmails(s, inbox, [mail(7, "Ajánlatkérés"), mail(9, "Akciós hírlevél")], client([fields("ajanlatkeres"), fields("hirlevel", { urgency: "alacsony" })]), config);
    expect(added.map((x) => x.id)).toEqual(["E-0001", "E-0002"]);
    expect(inbox.lastUid).toBe(9);
    const t = s.tasks.find((x) => x.id === added[0]!.taskId)!;
    expect(t.department).toBe("sales");
    expect(t.priority).toBe(1);
    const pub = `${t.title}\n${t.description}`;
    for (const secret of ["Kovács", "Példa", "pelda.hu", "123 4567"]) expect(pub).not.toContain(secret);
    expect(t.description).toContain("E-0001");
    expect(added[1]!.taskId).toBeUndefined();
    expect(added[0]!.company).toBe("Példa Kft.");

    // Ugyanaz a levél másodszor nem dolgozódik fel.
    const again = await processEmails(s, inbox, [mail(7, "Ajánlatkérés")], client([fields("ajanlatkeres")]), config);
    expect(again).toHaveLength(0);

    saveInbox(root, inbox, "jelszo");
    expect(fs.readFileSync(path.join(root, "state/inbox.enc.json"), "utf8")).not.toContain("Kovács");
    expect(loadInbox(root, "jelszo").items).toHaveLength(2);
  });

  it("kikapcsolt részleg nem kap levélből feladatot", async () => {
    const root = tmp();
    const s = emptyState();
    setDepartmentEnabled(s, "sales", false, new Date());
    const added = await processEmails(s, emptyInbox(), [mail(1, "Ajánlat")], client([fields("ajanlatkeres")]), loadConfig({ ANTHROPIC_API_KEY: "x" }, root));
    expect(added[0]!.taskId).toBeUndefined();
  });

  it("a levelet csak az olvashatja, akinek a feladatában szerepel", async () => {
    const root = tmp();
    const inbox = emptyInbox();
    const s = emptyState();
    await processEmails(s, inbox, [mail(1, "Hiba"), mail(2, "Másik")], client([fields("tamogatas"), fields("tamogatas")]), loadConfig({ ANTHROPIC_API_KEY: "x" }, root));
    saveInbox(root, inbox, "jelszo");
    process.env.INBOX_PASSPHRASE = "jelszo";
    try {
      expect(readEmailFor(root, "E-0001", "jelszo")).toContain("Kovács Anna");
      const worker = roleById("kb-editor")!;
      const task = createTask(s, { title: "Levél megválaszolása", description: "Nézd meg az E-0001 levelet és válaszolj.", department: "support", assignee: worker.id }, "system");
      const ctx = { state: s, role: worker, task, workspace: new Workspace(root), createdThisRun: { count: 0 }, finished: false, filesWritten: new Set<string>() };
      expect(toolDefinitions(worker, task).map((d) => d.name)).toContain("read_email");
      expect(runTool(ctx, "read_email", { email_id: "E-0001" }).isError).toBe(false);
      expect(runTool(ctx, "read_email", { email_id: "E-0002" }).isError).toBe(true);
    } finally {
      delete process.env.INBOX_PASSPHRASE;
    }
  });
});
