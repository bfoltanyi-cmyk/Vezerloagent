// Az agentek fájlhozzáférése. Kódszerepek a product/ és docs/ alá írhatnak,
// a többiek csak a docs/ alá. Semmi nem léphet ki ezekből a könyvtárakból.

import fs from "node:fs";
import path from "node:path";
import type { Access } from "../company/org.js";

const MAX_FILE_BYTES = 200_000;
const MAX_LIST = 400;

export class Workspace {
  constructor(readonly root: string) {}

  private allowedRoots(access: Access, mode: "read" | "write"): string[] {
    if (mode === "read") return ["docs", "product", "branding"];
    if (access === "code") return ["docs", "product"];
    if (access === "design") return ["docs", "branding"];
    if (access === "docs") return ["docs"];
    return [];
  }

  /** Feloldja és ellenőrzi az agent által megadott relatív utat. */
  resolve(rel: string, access: Access, mode: "read" | "write"): string {
    if (path.isAbsolute(rel) || rel.includes("\0")) throw new Error("Csak relatív út adható meg.");
    const norm = path.posix.normalize(rel.replaceAll("\\", "/"));
    if (norm.startsWith("..")) throw new Error("Az út nem léphet ki a munkaterületről.");
    const top = norm.split("/")[0] ?? "";
    const allowed = this.allowedRoots(access, mode);
    if (!allowed.includes(top)) {
      throw new Error(`Ehhez nincs jogod: ${mode === "write" ? "írni" : "olvasni"} csak ide lehet: ${allowed.join(", ") || "sehova"}.`);
    }
    if (norm.split("/").some((seg) => seg === ".git" || seg === "node_modules" || seg.startsWith(".env"))) {
      throw new Error("Ez az út tiltott.");
    }
    const abs = path.resolve(this.root, norm);
    const base = path.resolve(this.root, top);
    if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error("Az út nem léphet ki a munkaterületről.");
    // Szimbolikus link se vezessen ki: a legközelebbi létező ős valódi útját ellenőrizzük.
    let probe = abs;
    while (!fs.existsSync(probe)) probe = path.dirname(probe);
    const realRoot = fs.realpathSync(this.root);
    const realProbe = fs.realpathSync(probe);
    if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) {
      throw new Error("Az út nem léphet ki a munkaterületről.");
    }
    return abs;
  }

  read(rel: string, access: Access): string {
    const abs = this.resolve(rel, access, "read");
    if (!fs.existsSync(abs)) throw new Error(`Nincs ilyen fájl: ${rel}`);
    const buf = fs.readFileSync(abs);
    if (buf.length > MAX_FILE_BYTES) return buf.subarray(0, MAX_FILE_BYTES).toString("utf8") + "\n…[levágva]";
    return buf.toString("utf8");
  }

  write(rel: string, content: string, access: Access): void {
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error("A fájl túl nagy (max. 200 kB).");
    const abs = this.resolve(rel, access, "write");
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  list(rel: string, access: Access): string[] {
    const abs = this.resolve(rel || "docs", access, "read");
    if (!fs.existsSync(abs)) return [];
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (out.length >= MAX_LIST) return;
        if (e.name === "node_modules" || e.name === ".git") continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else out.push(path.relative(this.root, p).split(path.sep).join("/"));
      }
    };
    if (fs.statSync(abs).isDirectory()) walk(abs);
    else out.push(rel);
    return out;
  }
}
