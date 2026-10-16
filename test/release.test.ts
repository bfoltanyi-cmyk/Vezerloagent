import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTask, decideGate, emptyState, requestGate } from "../src/board.js";
import { productOf, publishReleases, tagOf, unreleased } from "../src/release.js";

const t0 = new Date("2026-10-16T08:00:00Z");

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alicya-release-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  fs.mkdirSync(path.join(root, "product"));
  fs.writeFileSync(path.join(root, "product", "README.md"), "termék");
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  return root;
}

describe("kiadás", () => {
  it("felismeri a termékvonalat és a verziót", () => {
    expect(productOf("Praxiskezelő első kiadás").id).toBe("praxis");
    expect(productOf("Számla + Készlet Start").id).toBe("erp");
    const s = emptyState();
    const t = createTask(s, { title: "Kiadás", description: "Kiadásjelölt", department: "dev", assignee: "release-manager" }, "ceo", t0);
    const g = requestGate(s, t.id, "release", "Start v0.1.0 kiadásjelölt", "Számla + készlet.", "release-manager", t0);
    expect(tagOf(g, t0)).toBe("erp-v0.1.0");
  });

  it("jóváhagyott kiadásból GitHub Release lesz csomaggal, egyszer", () => {
    const root = repo();
    const s = emptyState();
    const t = createTask(s, { title: "Kiadás", description: "Kiadásjelölt", department: "dev", assignee: "release-manager" }, "ceo", t0);
    const g = requestGate(s, t.id, "release", "Start v0.1.0 kiadásjelölt", "Számla + készlet.", "release-manager", t0);
    expect(unreleased(s)).toHaveLength(0);
    decideGate(s, g.id, "approved", "", t0);
    const calls: string[][] = [];
    const gh = (a: string[]) => {
      calls.push(a);
      expect(fs.existsSync(a[3]!)).toBe(true);
      return "";
    };
    expect(publishReleases(s, root, gh, "alicya/munka", t0)).toEqual(["Alicya ERP 0.1.0 kiadva (erp-v0.1.0)."]);
    expect(calls[0]!.slice(0, 3)).toEqual(["release", "create", "erp-v0.1.0"]);
    expect(g.releaseTag).toBe("erp-v0.1.0");
    expect(publishReleases(s, root, gh, "alicya/munka", t0)).toEqual([]);
  });
});
