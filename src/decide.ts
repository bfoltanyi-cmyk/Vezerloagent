// Döntés egy kapuról azonnal, munkanap nélkül.
// A vezérlőterem gombjai egy előre kitöltött "döntés" issue-t nyitnak; ez a program
// rögzíti a döntést a cég állapotában, lezárja a kapu issue-ját, és a megjegyzést
// a tulajdonosi iránymutatásba is beírja, hogy minden agent lássa.
// Ugyanígy kezeli a kapu issue-n a "/jóváhagyom" és "/elutasítom" hozzászólást,
// valamint a címkézést és a lezárást.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decideGate, logEvent, setDepartmentEnabled } from "./board.js";
import { sweepBrandingIssues } from "./branding.js";
import { gitCheckpoint } from "./checkpoint.js";
import { GUIDANCE_FILE } from "./ceo-chat.js";
import { loadConfig } from "./config.js";
import { LABELS, realGh, syncDecisions, type Gh } from "./gates.js";
import { loadState, saveState } from "./state.js";
import type { CompanyState, Gate } from "./types.js";

export type Decision = "approved" | "rejected";

export interface ParsedDecision {
  gateId: string;
  decision: Decision;
  note: string;
}

const MARKER = /<!--\s*alicya-dontes\s+(G-\d+)\s+(approved|rejected)\s*-->/;

/** A vezérlőterem által kitöltött döntés-issue törzse. */
export function decisionBody(gateId: string, decision: Decision): string {
  const hint =
    decision === "approved"
      ? "Ide írhatsz megjegyzést vagy feltételt a csapatnak (nem kötelező), aztán kattints a Create / Submit gombra."
      : "Írd ide, mi a gond, és mit kérsz helyette, aztán kattints a Create / Submit gombra.";
  return `<!-- alicya-dontes ${gateId} ${decision} -->\n<!-- ${hint} -->\n\n`;
}

/** Döntés-issue: a rejtett jelölőből olvassuk ki, a megjegyzés a többi szöveg. */
export function parseDecisionIssue(body: string): ParsedDecision | null {
  const m = MARKER.exec(body ?? "");
  if (!m) return null;
  const note = body.replace(/<!--[\s\S]*?-->/g, "").trim();
  return { gateId: m[1]!, decision: m[2] as Decision, note };
}

/** Részlegkapcsoló issue a vezérlőteremből: <!-- alicya-reszleg security off --> */
export function parseDepartmentToggle(body: string): { department: string; enabled: boolean } | null {
  const m = /<!--\s*alicya-reszleg\s+([a-z]+)\s+(on|off)\s*-->/.exec(body ?? "");
  return m ? { department: m[1]!, enabled: m[2] === "on" } : null;
}

/** Hozzászólás a kapu issue-ján: "/jóváhagyom [megjegyzés]" vagy "/elutasítom <indoklás>". */
export function parseCommand(body: string): { decision: Decision; note: string } | null {
  const m = /^\s*\/(jóváhagy\S*|elfogad\S*|approve\S*|elutasít\S*|reject\S*)\s*([\s\S]*)$/i.exec(body ?? "");
  if (!m) return null;
  const word = m[1]!.toLowerCase();
  const decision: Decision = word.startsWith("elutas") || word.startsWith("reject") ? "rejected" : "approved";
  return { decision, note: (m[2] ?? "").trim() };
}

/** A megjegyzés bekerül a tulajdonosi iránymutatásba, amit a tervezés és minden agent olvas. */
export function recordGuidance(root: string, g: Gate, decision: Decision, note: string, now = new Date()): void {
  if (!note) return;
  const file = path.join(root, GUIDANCE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const head = fs.existsSync(file) ? "" : "# Tulajdonosi iránymutatás\n\nA tulajdonos döntései és irányelvei. Minden agent köteles követni.\n";
  const verdict = decision === "approved" ? "jóváhagyva" : "elutasítva";
  fs.appendFileSync(file, `${head}\n## ${now.toISOString().slice(0, 10)} · ${g.id} ${verdict}: ${g.title}\n\n${note}\n`);
}

export interface DecideOutcome {
  gate?: Gate;
  message: string;
}

/** Egy döntés alkalmazása: állapot, iránymutatás és a kapu issue-ja. */
export function applyDecision(
  s: CompanyState,
  root: string,
  gh: Gh | undefined,
  d: ParsedDecision,
  source: string,
  now = new Date(),
): DecideOutcome {
  const g = s.gates.find((x) => x.id === d.gateId);
  if (!g) return { message: `Nem találom a(z) ${d.gateId} kaput.` };
  if (g.status !== "pending") {
    return { gate: g, message: `A(z) ${g.id} kapuról már döntöttél (${g.status === "approved" ? "jóváhagyva" : "elutasítva"}), ezért ezt nem rögzítettem újra.` };
  }
  if (d.decision === "rejected" && !d.note) {
    return { gate: g, message: `Az elutasításhoz írd meg röviden, mi a gond, hogy a csapat tudja, min javítson. A(z) ${g.id} kapu nyitva maradt.` };
  }
  decideGate(s, g.id, d.decision, d.note, now);
  recordGuidance(root, g, d.decision, d.note, now);
  if (gh && g.issueNumber !== undefined) {
    const n = String(g.issueNumber);
    const verdict = d.decision === "approved" ? "Jóváhagyva" : "Elutasítva";
    try {
      gh(["issue", "edit", n, "--add-label", d.decision === "approved" ? LABELS.approved.name : LABELS.rejected.name]);
      gh(["issue", "close", n, "--reason", d.decision === "approved" ? "completed" : "not planned", "--comment", `**${verdict}** (${source}).${d.note ? `\n\n${d.note}` : ""}`]);
    } catch (e) {
      logEvent(s, { actor: "system", department: "system", kind: "warn", text: `A(z) ${g.id} kapu issue-ját nem sikerült lezárni: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` }, now);
    }
  }
  const next = d.decision === "approved" ? "A csapat a következő munkanapon továbbmegy." : "A feladat visszakerült a csapathoz átdolgozásra.";
  return { gate: g, message: `Rögzítettem: ${g.id} ${d.decision === "approved" ? "jóváhagyva" : "elutasítva"}. ${next}${d.note ? " A megjegyzésedet minden agent látja." : ""}` };
}

/**
 * A tulajdonos nyitott döntés-issue-inak feldolgozása. A munkanap is lefuttatja, így
 * egy elmaradt döntés sem vész el. Más szerzők issue-it nem nézzük.
 */
export function sweepDecisionIssues(s: CompanyState, root: string, gh: Gh, owner: string): string[] {
  if (!owner) return [];
  const list = JSON.parse(gh(["issue", "list", "--state", "open", "--author", owner, "--limit", "100", "--json", "number,body"])) as { number: number; body: string }[];
  const out: string[] = [];
  for (const i of list) {
    const dep = parseDepartmentToggle(i.body);
    if (dep) {
      let msg: string;
      try {
        const changed = setDepartmentEnabled(s, dep.department, dep.enabled);
        msg = changed ? `Rögzítettem: a(z) ${dep.department} részleg ${dep.enabled ? "bekapcsolva, a következő munkanaptól újra dolgozik" : "kikapcsolva, nem kap munkát és nem tartja fel a többieket"}.` : `A(z) ${dep.department} részleg már ${dep.enabled ? "be" : "ki"} volt kapcsolva.`;
      } catch (e) {
        msg = e instanceof Error ? e.message : String(e);
      }
      gh(["issue", "close", String(i.number), "--reason", "completed", "--comment", msg]);
      out.push(msg);
      continue;
    }
    const d = parseDecisionIssue(i.body);
    if (!d) continue;
    const r = applyDecision(s, root, gh, d, `a vezérlőteremből, #${i.number}`);
    gh(["issue", "close", String(i.number), "--reason", r.gate?.status === "pending" ? "not planned" : "completed", "--comment", r.message]);
    out.push(r.message);
  }
  return out;
}

interface IssueInfo {
  number: number;
  title: string;
  body: string;
  labels: string[];
}

function readIssueInfo(gh: Gh, n: number): IssueInfo {
  const v = JSON.parse(gh(["issue", "view", String(n), "--json", "number,title,body,labels"])) as { number: number; title: string; body: string; labels: { name: string }[] };
  return { number: v.number, title: v.title, body: v.body ?? "", labels: v.labels.map((l) => l.name) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = loadConfig().rootDir;
  const gh = realGh;
  const n = Number(process.env.ISSUE_NUMBER);
  const comment = process.env.COMMENT_BODY;
  const s = loadState(root);
  const before = JSON.stringify(s);
  const issue = readIssueInfo(gh, n);
  const done: string[] = [];

  if (comment !== undefined && issue.labels.includes(LABELS.gate.name)) {
    // Parancs a kapu issue-ján.
    const cmd = parseCommand(comment);
    const g = s.gates.find((x) => x.issueNumber === n);
    if (cmd && g) {
      const r = applyDecision(s, root, gh, { gateId: g.id, ...cmd }, "hozzászólásban");
      if (g.status === "pending") gh(["issue", "comment", String(n), "--body", r.message]);
      done.push(r.message);
    }
  } else if (issue.labels.includes(LABELS.gate.name)) {
    // Címke vagy lezárás a kapu issue-ján: ugyanaz, amit a munkanap is beolvas, csak most azonnal.
    const pendingBefore = new Set(s.gates.filter((g) => g.status === "pending").map((g) => g.id));
    syncDecisions(s, gh);
    for (const g of s.gates) if (pendingBefore.has(g.id) && g.status !== "pending") {
      recordGuidance(root, g, g.status as Decision, g.decisionNote ?? "");
      done.push(`${g.id} ${g.status === "approved" ? "jóváhagyva" : "elutasítva"}.`);
    }
  }
  // A vezérlőterem gombjaival nyitott döntések, a mostani és az esetleg elmaradtak is.
  done.push(...sweepDecisionIssues(s, root, gh, process.env.GITHUB_REPOSITORY_OWNER ?? ""));
  // Márkázási kérések logóval.
  done.push(...(await sweepBrandingIssues(s, root, gh, process.env.GITHUB_REPOSITORY_OWNER ?? "")));

  if (JSON.stringify(s) !== before) {
    saveState(root, s);
    if (process.env.ALICYA_CHECKPOINT === "1") gitCheckpoint(root, process.env.WORK_BRANCH || "alicya/munka")(`Tulajdonosi döntés (issue #${n})`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "changed=true\n");
  }
  const summary = done.join("\n") || "Nincs rögzítendő döntés.";
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
