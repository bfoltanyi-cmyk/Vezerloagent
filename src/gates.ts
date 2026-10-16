// Emberi jóváhagyási kapuk GitHub issue-kként.
// Jóváhagyás: "jóváhagyva" címke vagy az issue lezárása "completed" állapottal.
// Elutasítás: "elutasítva" címke vagy lezárás "not planned" állapottal; az utolsó hozzászólás az indoklás.

import { execFileSync } from "node:child_process";
import { decideGate, logEvent } from "./board.js";
import type { CompanyState, Gate } from "./types.js";

export type Gh = (args: string[]) => string;

export const realGh: Gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export const LABELS = {
  gate: { name: "kapu", color: "ffb347", description: "Alicya Nexus: a tulajdonos döntésére vár" },
  approved: { name: "jóváhagyva", color: "5ee6a8", description: "A tulajdonos jóváhagyta" },
  rejected: { name: "elutasítva", color: "e5534b", description: "A tulajdonos elutasította" },
  ceo: { name: "ceo", color: "6ff3ff", description: "Alicya Nexus: beszélgetés a vezérigazgató agenttel" },
} as const;

const KIND_LABEL: Record<Gate["kind"], string> = {
  spec: "Specifikáció: mit építünk",
  release: "Kiadás: kiadható-e",
  outbound: "Kifelé menő kommunikáció",
  pricing: "Árazás",
};

export function githubAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GITHUB_REPOSITORY && (env.GH_TOKEN || env.GITHUB_TOKEN));
}

export function ensureLabels(gh: Gh): void {
  for (const l of Object.values(LABELS)) {
    gh(["label", "create", l.name, "--color", l.color, "--description", l.description, "--force"]);
  }
}

export function issueBody(g: Gate): string {
  return `**${KIND_LABEL[g.kind]}** · kérte: \`${g.requestedBy}\` · feladat: \`${g.taskId}\`

${g.summary}

---
**Hogyan dönts?**
- Jóváhagyás: tedd rá a \`jóváhagyva\` címkét, vagy zárd le az issue-t (Close as completed).
- Elutasítás: írd meg hozzászólásban, mi a gond, és tedd rá az \`elutasítva\` címkét (vagy Close as not planned).

A döntést a következő munkanap olvassa be. (Alicya Nexus kapu ${g.id})`;
}

export function openIssues(s: CompanyState, gh: Gh): void {
  const pending = s.gates.filter((g) => g.status === "pending" && g.issueNumber === undefined);
  if (pending.length === 0) return;
  ensureLabels(gh);
  for (const g of pending) {
    const url = gh(["issue", "create", "--title", `[${g.id}] ${g.title}`, "--body", issueBody(g), "--label", LABELS.gate.name]).trim();
    const n = Number(url.split("/").pop());
    if (Number.isInteger(n)) g.issueNumber = n;
  }
}

interface IssueView {
  state: "OPEN" | "CLOSED";
  stateReason?: string | null;
  labels: { name: string }[];
  comments: { body: string }[];
}

export function syncDecisions(s: CompanyState, gh: Gh): void {
  for (const g of s.gates) {
    if (g.status !== "pending" || g.issueNumber === undefined) continue;
    let v: IssueView;
    try {
      v = JSON.parse(gh(["issue", "view", String(g.issueNumber), "--json", "state,stateReason,labels,comments"])) as IssueView;
    } catch (e) {
      logEvent(s, { actor: "system", department: "system", kind: "warn", text: `Nem sikerült beolvasni a(z) ${g.id} kapu issue-ját: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` });
      continue;
    }
    const labels = new Set(v.labels.map((l) => l.name));
    const note = v.comments.at(-1)?.body.trim().slice(0, 1000) ?? "";
    const reason = (v.stateReason ?? "").toUpperCase();
    if (labels.has(LABELS.rejected.name) || (v.state === "CLOSED" && reason === "NOT_PLANNED")) {
      decideGate(s, g.id, "rejected", note);
    } else if (labels.has(LABELS.approved.name) || (v.state === "CLOSED" && reason !== "NOT_PLANNED")) {
      decideGate(s, g.id, "approved", note);
      if (v.state === "OPEN") gh(["issue", "close", String(g.issueNumber), "--reason", "completed"]);
    }
  }
}
