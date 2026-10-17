// Munka közbeni mentés: a vezérlőterem így élőben látja, hol tart a munkanap.

import { execFileSync } from "node:child_process";

/** Igazat ad, ha a változás felkerült a GitHubra (vagy nem volt mit menteni). */
export type Checkpoint = (message: string) => boolean;

/** A munkaágra menti és feltölti az állapotot meg az elkészült fájlokat. Hiba esetén csak figyelmeztet. */
export function gitCheckpoint(root: string, branch: string): Checkpoint {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  return (message) => {
    try {
      git("add", "-A", "state", "docs", "product", "branding");
      try {
        git("diff", "--cached", "--quiet");
        return true;
      } catch {
        // Van mit menteni.
      }
      git("commit", "-q", "-m", message);
      git("push", "-q", "origin", `HEAD:${branch}`);
      return true;
    } catch (e) {
      console.warn(`::warning::A köztes mentés nem sikerült: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
      return false;
    }
  };
}
