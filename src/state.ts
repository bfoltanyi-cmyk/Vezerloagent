import fs from "node:fs";
import path from "node:path";
import { DEPARTMENTS, ROLES } from "../company/org.js";
import { emptyState } from "./board.js";
import type { CompanyState } from "./types.js";

export const statePath = (root: string) => path.join(root, "state", "company.json");

export function loadState(root: string): CompanyState {
  const p = statePath(root);
  if (!fs.existsSync(p)) return emptyState();
  const s = JSON.parse(fs.readFileSync(p, "utf8")) as CompanyState;
  if (s.version !== 1) throw new Error(`Ismeretlen állapotverzió: ${String(s.version)}`);
  return s;
}

export function saveState(root: string, s: CompanyState): void {
  const p = statePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  // A szervezet pillanatképe a vezérlőteremnek.
  fs.writeFileSync(path.join(root, "state", "org.json"), JSON.stringify({ departments: DEPARTMENTS, roles: ROLES }, null, 2) + "\n");
}
