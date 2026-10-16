import type { DepartmentId } from "../company/org.js";

export type TaskStatus = "todo" | "in_progress" | "review" | "awaiting_approval" | "blocked" | "done";
export type TaskKind = "plan" | "doc" | "code" | "review";
export type GateKind = "spec" | "release" | "outbound" | "pricing";

export interface Note {
  at: string;
  by: string;
  text: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  department: DepartmentId;
  assignee: string;
  status: TaskStatus;
  kind: TaskKind;
  /** 1 = sürgős, 3 = ráér */
  priority: 1 | 2 | 3;
  dependsOn: string[];
  /** Átvizsgálási feladatnál az átvizsgált feladat. */
  reviewOf?: string;
  /** Hányadik átvizsgálási kör (kódfeladatnál és annak átvizsgálásainál). */
  reviewRound?: number;
  gateId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  notes: Note[];
}

export interface Gate {
  id: string;
  kind: GateKind;
  title: string;
  summary: string;
  taskId: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  issueNumber?: number;
  createdAt: string;
  decidedAt?: string;
  decisionNote?: string;
  /** A közzétett GitHub Release címkéje, ha a kiadási kapu már kiment. */
  releaseTag?: string;
}

export interface CompanyEvent {
  at: string;
  actor: string;
  department: DepartmentId | "system";
  kind: "info" | "gate" | "warn";
  text: string;
}

export interface LedgerEntry {
  at: string;
  role: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
}

export interface CompanyState {
  version: 1;
  meta: { runs: number; lastRun?: string; nextTask: number; nextGate: number; /** A most futó munkanap kezdete. */ running?: string; /** A tulajdonos által kikapcsolt részlegek: nem dolgoznak, és nem tartják fel a többieket. */ disabledDepartments?: string[]; /** A legutóbbi munkanap modelljei szintenként (a vezérlőteremnek). */ models?: { strategic: string; strategicRoles: string[]; lead: string; worker: string; bulk: string; inbox: string } };
  tasks: Task[];
  gates: Gate[];
  events: CompanyEvent[];
  ledger: LedgerEntry[];
}
