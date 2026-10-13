// Munka közbeni mentés: a vezérlőterem így élőben látja, hol tart a munkanap.

import { execFileSync } from "node:child_process";

export type Checkpoint = (message: string) => void;

/** A munkaágra menti és feltölti az állapotot meg az elkészült fájlokat. Hiba esetén csak figyelmeztet. */
export function gitCheckpoint(root: string, branch: string): Checkpoint {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  return (message) => {
    try {
      git("add", "state", "docs", "product");
      try {
        git("diff", "--cached", "--quiet");
        return;
      } catch {
        // Van mit menteni.
      }
      git("commit", "-q", "-m", message);
      git("push", "-q", "origin", `HEAD:${branch}`);
    } catch (e) {
      console.warn(`::warning::A köztes mentés nem sikerült: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
    }
  };
}
