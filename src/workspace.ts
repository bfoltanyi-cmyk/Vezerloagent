// Az agentek fájlhozzáférése. Kódszerepek a product/ és docs/ alá írhatnak,
// a többiek csak a docs/ alá. Semmi nem léphet ki ezekből a könyvtárakból.

import fs from "node:fs";
import path from "node:path";
import type { Access } from "../company/org.js";

const MAX_FILE_BYTES = 200_000;
const MAX_LIST = 400;
const MAX_SOURCES = 5000;

export class Workspace {
  constructor(readonly root: string) {}

  protected allowedRoots(access: Access, mode: "read" | "write"): string[] {
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

  list(rel: string, access: Access, max = MAX_LIST): string[] {
    const abs = this.resolve(rel || "docs", access, "read");
    if (!fs.existsSync(abs)) return [];
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (out.length >= max) return;
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

  /**
   * Egy könyvtár összes fájlja a forrásukkal együtt (a kódellenőrzés ebből másolja ki a projektet).
   * A node_modules, a .git, az .env* fájlok és a szimbolikus linkek kimaradnak.
   */
  sources(rel: string, access: Access): { rel: string; abs: string }[] {
    const abs = this.resolve(rel, access, "read");
    const out: { rel: string; abs: string }[] = [];
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return out;
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (out.length >= MAX_SOURCES) throw new Error(`Túl sok fájl a(z) ${rel} alatt (max. ${MAX_SOURCES}).`);
        if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".env") || e.name.startsWith(".alicya")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile()) out.push({ rel: path.relative(abs, p).split(path.sep).join("/"), abs: p });
      }
    };
    walk(abs);
    return out;
  }
}

/**
 * Árnyék-munkaterület a belső versenyhez: a kihívó a valódi fájlokat olvassa, de amit ír,
 * az egy külön könyvtárba kerül, így a cég valódi munkáját nem írja felül.
 */
export class ShadowWorkspace extends Workspace {
  constructor(root: string, readonly overlay: string) {
    super(root);
  }

  private shadowOf(abs: string): string {
    return path.join(this.overlay, path.relative(this.root, abs));
  }

  override read(rel: string, access: Access): string {
    const o = this.shadowOf(this.resolve(rel, access, "read"));
    if (!fs.existsSync(o)) return super.read(rel, access);
    const buf = fs.readFileSync(o);
    return buf.length > MAX_FILE_BYTES ? buf.subarray(0, MAX_FILE_BYTES).toString("utf8") + "\n…[levágva]" : buf.toString("utf8");
  }

  override write(rel: string, content: string, access: Access): void {
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error("A fájl túl nagy (max. 200 kB).");
    const abs = this.resolve(rel, access, "write");
    // Ugyanaz a korlát, mint a valódinál: könyvtár helyére vagy fájl alá nem írhat.
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) throw new Error(`Ez egy könyvtár: ${rel}`);
    for (let p = path.dirname(abs); p.startsWith(this.root) && p !== this.root; p = path.dirname(p)) {
      if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) throw new Error(`Nem írható: ${rel}`);
    }
    const o = this.shadowOf(abs);
    fs.mkdirSync(path.dirname(o), { recursive: true });
    fs.writeFileSync(o, content);
  }

  override list(rel: string, access: Access, max = MAX_LIST): string[] {
    const real = super.list(rel, access, max);
    const abs = this.resolve(rel || "docs", access, "read");
    const o = this.shadowOf(abs);
    const extra: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else extra.push(path.relative(this.overlay, p).split(path.sep).join("/"));
      }
    };
    if (fs.existsSync(o) && fs.statSync(o).isDirectory()) walk(o);
    else if (fs.existsSync(o)) extra.push(path.relative(this.overlay, o).split(path.sep).join("/"));
    return [...new Set([...real, ...extra])].sort().slice(0, max);
  }

  /** A valódi fájlok, a kihívó által írtakkal felülírva. */
  override sources(rel: string, access: Access): { rel: string; abs: string }[] {
    const base = this.resolve(rel, access, "read");
    const merged = new Map(super.sources(rel, access).map((f) => [f.rel, f.abs]));
    const o = this.shadowOf(base);
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile()) merged.set(path.relative(o, p).split(path.sep).join("/"), p);
      }
    };
    if (fs.existsSync(o) && fs.statSync(o).isDirectory()) walk(o);
    return [...merged].map(([r, abs]) => ({ rel: r, abs }));
  }

  /** A kihívó által írt fájl tartalma (nem a valódi). */
  shadowRead(rel: string): string | undefined {
    // Ugyanúgy képezzük az utat, mint íráskor (pl. a „docs//a.md/” is ugyanaz a fájl).
    const o = this.shadowOf(path.resolve(this.root, path.posix.normalize(rel.replaceAll("\\", "/"))));
    if (!o.startsWith(this.overlay + path.sep) || !fs.existsSync(o) || fs.statSync(o).isDirectory()) return undefined;
    return fs.readFileSync(o, "utf8");
  }
}
