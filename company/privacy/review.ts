// Mikor kell adatvédelmi átvizsgálás egy kódfeladatra.

import type { Task } from "../../src/types.js";

/** Szerepek, amelyek munkája szinte mindig személyes adatot érint. */
export const PERSONAL_DATA_ROLES = new Set([
  "backend-invoicing",
  "backend-hr",
  "backend-accounting",
  "integration-dev",
  "api-dev",
  "db-engineer",
  "frontend-core",
  "access-manager",
]);

const PERSONAL_DATA_PATTERN =
  /személyes|szemelyes|gdpr|érintett|munkavállaló|dolgozó|ügyfél|vevő|kapcsolattartó|bér|jelenlét|personal|employee|customer|contact|payroll|email|e-mail|telefonszám|lakcím|adóazonosító|taj/i;

export function touchesPersonalData(task: Pick<Task, "assignee" | "title" | "description">, summary = ""): boolean {
  return PERSONAL_DATA_ROLES.has(task.assignee) || PERSONAL_DATA_PATTERN.test(`${task.title} ${task.description} ${summary}`);
}
