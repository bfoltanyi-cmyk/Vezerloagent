// Kiadás: amikor a tulajdonos jóváhagy egy "release" kaput, a kész szoftver GitHub Release-ként
// letölthetővé válik. A csomag a munkaág aktuális állapotából készül: a termék kódja, a telepítő
// (ha már van), a kiadási jegyzet és a felhasználói dokumentáció.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logEvent } from "./board.js";
import { gitCheckpoint } from "./checkpoint.js";
import { loadConfig } from "./config.js";
import { realGh, type Gh } from "./gates.js";
import { loadState, saveState } from "./state.js";
import type { CompanyState, Gate } from "./types.js";

export interface ProductLine {
  id: string;
  name: string;
  match: RegExp;
}

/** A cég termékvonalai. Ami egyikre sem illik, az az ERP-hez tartozik. */
export const PRODUCTS: ProductLine[] = [
  { id: "praxis", name: "Alicya Praxis", match: /praxis|rendel[őo]|eeszt/i },
  { id: "erp", name: "Alicya ERP", match: /.*/ },
];

export const productOf = (text: string): ProductLine => PRODUCTS.find((p) => p.match.test(text))!;

/** Verziószám a kapu címéből vagy összefoglalójából (pl. "v0.1.0", "0.2"), különben dátum alapú. */
export function versionOf(g: Gate, now = new Date()): string {
  const m = /\bv?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)\b/.exec(`${g.title} ${g.summary}`);
  return m ? m[1]! : `${now.toISOString().slice(0, 10).replace(/-/g, ".")}`;
}

export function tagOf(g: Gate, now = new Date()): string {
  return `${productOf(`${g.title} ${g.summary}`).id}-v${versionOf(g, now)}`;
}

export function releaseNotes(root: string, g: Gate, version: string): string {
  const dir = path.join(root, "docs", "dev", "release");
  const candidates = [`${version}.md`, `v${version}.md`];
  for (const c of candidates) {
    const f = path.join(dir, c);
    if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  }
  return `${g.summary}\n\n---\nJóváhagyta a tulajdonos (${g.id}${g.decidedAt ? `, ${g.decidedAt.slice(0, 10)}` : ""}).${g.decisionNote ? `\n\n${g.decisionNote}` : ""}`;
}

/** A jóváhagyott, még ki nem adott kiadások. */
export const unreleased = (s: CompanyState) => s.gates.filter((g) => g.kind === "release" && g.status === "approved" && !g.releaseTag);

export function publishReleases(s: CompanyState, root: string, gh: Gh, branch: string, now = new Date()): string[] {
  const out: string[] = [];
  for (const g of unreleased(s)) {
    const product = productOf(`${g.title} ${g.summary}`);
    const version = versionOf(g, now);
    const tag = tagOf(g, now);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alicya-release-"));
    try {
      const notes = path.join(tmp, "notes.md");
      fs.writeFileSync(notes, releaseNotes(root, g, version));
      const paths = ["product", "docs/dev/release", "docs/support", "docs/product"].filter((p) => fs.existsSync(path.join(root, p)));
      const zip = path.join(tmp, `${product.id}-${version}.zip`);
      execFileSync("git", ["archive", "--format=zip", `--prefix=${product.id}-${version}/`, "-o", zip, "HEAD", ...paths], { cwd: root, stdio: "pipe" });
      gh(["release", "create", tag, zip, "--target", branch, "--title", `${product.name} ${version}`, "--notes-file", notes]);
      g.releaseTag = tag;
      logEvent(s, { actor: "release-manager", department: "dev", kind: "info", text: `Kiadva: ${product.name} ${version} (${tag}), letölthető a Kész szoftverek lapon.` }, now);
      out.push(`${product.name} ${version} kiadva (${tag}).`);
    } catch (e) {
      logEvent(s, { actor: "system", department: "system", kind: "warn", text: `A(z) ${g.id} kiadást nem sikerült közzétenni: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` }, now);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = loadConfig().rootDir;
  const branch = process.env.WORK_BRANCH || "alicya/munka";
  const s = loadState(root);
  if (unreleased(s).length === 0) {
    console.log("Nincs kiadásra váró jóváhagyott verzió.");
  } else {
    const done = publishReleases(s, root, realGh, branch);
    saveState(root, s);
    gitCheckpoint(root, branch)("Kiadás közzétéve");
    console.log(done.join("\n") || "A kiadás nem sikerült, részletek a naplóban.");
    if (process.env.GITHUB_STEP_SUMMARY && done.length) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${done.join("\n")}\n`);
  }
}
