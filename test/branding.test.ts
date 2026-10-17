import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyState } from "../src/board.js";
import { BRANDING_MARKER, parseBrandingIssue, slugify, sweepBrandingIssues } from "../src/branding.js";

const body = `${BRANDING_MARKER}
Cégnév: Kovács és Társa Kft.
Termék: Alicya ERP
Színek: #0A3D62, #F6B93B
Megjegyzés: A számlán is legyen rajta.

![logo](https://github.com/user-attachments/assets/abc-123)
![kulso](https://example.com/rossz.png)`;

describe("márkázási kérés", () => {
  it("kiolvassa a cég adatait, és csak a GitHubra feltöltött képet fogadja el", () => {
    const r = parseBrandingIssue(body)!;
    expect(r.company).toBe("Kovács és Társa Kft.");
    expect(r.colors).toBe("#0A3D62, #F6B93B");
    expect(r.images).toEqual(["https://github.com/user-attachments/assets/abc-123"]);
    expect(parseBrandingIssue("sima issue")).toBeNull();
    expect(slugify("Kovács és Társa Kft.")).toBe("kovacs-es-tarsa-kft");
  });

  it("elmenti a logót és a brand.json-t, és feladatot ad a márkázási dizájnernek", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "alicya-brand-"));
    const s = emptyState();
    const calls: string[][] = [];
    const gh = (a: string[]) => (calls.push(a), a[1] === "list" ? JSON.stringify([{ number: 7, body }]) : "");
    const png = new Uint8Array([137, 80, 78, 71]);
    const fetchImpl = async () => ({ ok: true, headers: { get: () => "image/png" }, arrayBuffer: async () => png.buffer });
    const out = await sweepBrandingIssues(s, root, gh, "folti", fetchImpl);
    expect(out[0]).toMatch(/Kovács és Társa Kft\./);
    expect(fs.existsSync(path.join(root, "branding/kovacs-es-tarsa-kft/logo.png"))).toBe(true);
    const brand = JSON.parse(fs.readFileSync(path.join(root, "branding/kovacs-es-tarsa-kft/brand.json"), "utf8"));
    expect(brand.logos).toEqual(["logo.png"]);
    expect(s.tasks.at(-1)!.assignee).toBe("brand-designer");
    expect(calls.some((c) => c[1] === "close" && c[2] === "7")).toBe(true);
  });
});
