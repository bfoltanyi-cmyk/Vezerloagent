import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Workspace } from "../src/workspace.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nexus-"));

describe("munkaterület", () => {
  it("nem enged kilépni a munkaterületről", () => {
    const ws = new Workspace(tmp());
    expect(() => ws.write("../x.txt", "a", "code")).toThrow();
    expect(() => ws.write("product/../../x.txt", "a", "code")).toThrow();
    expect(() => ws.write("/etc/passwd", "a", "code")).toThrow();
    expect(() => ws.write(".github/workflows/x.yml", "a", "code")).toThrow();
    expect(() => ws.write("product/.env", "a", "code")).toThrow();
  });

  it("nem kódszerep csak a docs alá írhat", () => {
    const ws = new Workspace(tmp());
    expect(() => ws.write("product/src/a.ts", "x", "docs")).toThrow(/nincs jogod/);
    ws.write("docs/sales/pricing.md", "# Árak", "docs");
    expect(ws.read("docs/sales/pricing.md", "docs")).toBe("# Árak");
  });

  it("szimbolikus linken át sem lehet kilépni", () => {
    const root = tmp();
    const outside = tmp();
    fs.mkdirSync(path.join(root, "docs"));
    fs.symlinkSync(outside, path.join(root, "docs", "kint"));
    const ws = new Workspace(root);
    expect(() => ws.write("docs/kint/x.md", "a", "docs")).toThrow();
  });

  it("listáz", () => {
    const ws = new Workspace(tmp());
    ws.write("product/src/a.ts", "x", "code");
    ws.write("product/src/b/c.ts", "x", "code");
    expect(ws.list("product", "code").sort()).toEqual(["product/src/a.ts", "product/src/b/c.ts"]);
  });
});
