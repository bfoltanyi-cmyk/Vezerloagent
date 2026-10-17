import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gitCheckpoint } from "../src/checkpoint.js";

describe("köztes mentés", () => {
  it("akkor is ment, ha valamelyik mappa (pl. branding/) még nem létezik", () => {
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-remote-"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-cp-"));
    const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, stdio: "pipe" }).toString().trim();
    git(remote, "init", "-q", "--bare");
    git(root, "init", "-q");
    git(root, "config", "user.email", "t@example.com");
    git(root, "config", "user.name", "t");
    git(root, "remote", "add", "origin", remote);
    fs.mkdirSync(path.join(root, "docs"));
    fs.writeFileSync(path.join(root, "docs/a.md"), "x");
    expect(gitCheckpoint(root, "alicya/munka")("első")).toBe(true);
    expect(git(remote, "log", "--format=%s", "alicya/munka")).toBe("első");
  });
});
