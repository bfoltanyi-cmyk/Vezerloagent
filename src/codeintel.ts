// Kódolvasás az agenteknek: keresés a forrásban és a kódtérkép (fájlok, sorok száma, exportok, osztályok,
// függvények, táblák, npm-szkriptek). Csak olvas, a munkaterület jogosultságain keresztül.

import path from "node:path";
import type { Access } from "../company/org.js";
import type { Workspace } from "./workspace.js";

const MAX_SCAN_FILES = 3000;
const MAX_MATCHES = 60;
const MAX_MAP_CHARS = 12_000;
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|sql|py|ya?ml|css|scss|html|sh|toml|txt|env\.example|example|prisma|graphql|dockerfile)$|(^|\/)(Dockerfile|Makefile|README)[^/]*$/i;

const isText = (rel: string, content: string) => (TEXT_EXT.test(rel) || !path.posix.extname(rel)) && !content.includes("\0");

export interface SearchOptions {
  query: string;
  path?: string;
  regex?: boolean;
  caseSensitive?: boolean;
}

/** Szöveg vagy reguláris kifejezés keresése; „fájl:sor: szöveg” találatok. */
export function searchCode(ws: Workspace, access: Access, o: SearchOptions): string {
  const root = o.path?.trim() || "product";
  let re: RegExp;
  try {
    re = o.regex ? new RegExp(o.query, o.caseSensitive ? "" : "i") : new RegExp(o.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), o.caseSensitive ? "" : "i");
  } catch (e) {
    throw new Error(`Hibás reguláris kifejezés: ${e instanceof Error ? e.message : String(e)}`);
  }
  const files = ws.list(root, access, MAX_SCAN_FILES);
  const hits: string[] = [];
  let total = 0;
  let filesHit = 0;
  for (const f of files) {
    let content: string;
    try {
      content = ws.read(f, access);
    } catch {
      continue;
    }
    if (!isText(f, content)) continue;
    let inFile = 0;
    content.split("\n").forEach((line, i) => {
      if (!re.test(line.length > 2000 ? line.slice(0, 2000) : line)) return;
      total++;
      inFile++;
      if (hits.length < MAX_MATCHES) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 200)}`);
    });
    if (inFile) filesHit++;
  }
  if (!total) return `Nincs találat (${files.length} fájlt néztem át a(z) ${root} alatt).`;
  const more = total > hits.length ? `\n…és még ${total - hits.length} találat; szűkítsd a keresést (path vagy pontosabb minta).` : "";
  return `${total} találat ${filesHit} fájlban:\n${hits.join("\n")}${more}`;
}

/** A fájl fontos elemei egy-egy sorban (a teljes fájl olvasása nélkül). */
export function outline(rel: string, content: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  const lines = content.split("\n");
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel)) {
    lines.forEach((l, i) => {
      let m = /^export\s+(default\s+)?(abstract\s+)?(async\s+)?(function\*?|class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(l);
      if (m) return add(`${m[4]!.replace("*", "")} ${m[5]}${m[1] ? " (default)" : ""} :${i + 1}`);
      m = /^(abstract\s+)?(async\s+)?(function\*?|class)\s+([A-Za-z_$][\w$]*)/.exec(l);
      if (m) return add(`${m[3]!.replace("*", "")} ${m[4]} :${i + 1}`);
      m = /^export\s+(\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/.exec(l);
      if (m) return add(`re-export ${m[1]!.replace(/\s+/g, " ")} from ${m[2]}`);
      m = /^@(Controller|Module|Injectable|Entity|Resolver)\(([^)]*)\)/.exec(l.trim());
      if (m) return add(`@${m[1]}(${m[2]!.slice(0, 60)})`);
      m = /^\s+(?:@(Get|Post|Put|Patch|Delete)\(([^)]*)\))/.exec(l);
      if (m) return add(`  ${m[1]!.toUpperCase()} ${m[2] || "''"} :${i + 1}`);
      m = /^\s*describe\(\s*["'`]([^"'`]{1,80})/.exec(l);
      if (m) add(`describe "${m[1]}"`);
    });
  } else if (rel.endsWith(".py")) {
    lines.forEach((l, i) => {
      const m = /^(class|def|async def)\s+([A-Za-z_]\w*)/.exec(l);
      if (m) add(`${m[1]} ${m[2]} :${i + 1}`);
    });
  } else if (rel.endsWith(".sql")) {
    lines.forEach((l, i) => {
      const m = /^\s*create\s+(or\s+replace\s+)?(unique\s+)?(table|index|view|type|function|schema|trigger)\s+(if\s+not\s+exists\s+)?([\w."]+)/i.exec(l);
      if (m) add(`${m[3]!.toLowerCase()} ${m[5]} :${i + 1}`);
    });
  } else if (rel.endsWith("package.json")) {
    try {
      const p = JSON.parse(content) as { name?: string; scripts?: Record<string, string>; dependencies?: object; devDependencies?: object };
      if (p.name) add(`name ${p.name}`);
      for (const [k, v] of Object.entries(p.scripts ?? {})) add(`script ${k}: ${String(v).slice(0, 80)}`);
      const deps = [...Object.keys(p.dependencies ?? {}), ...Object.keys(p.devDependencies ?? {})];
      if (deps.length) add(`deps ${deps.join(", ").slice(0, 300)}`);
    } catch {
      add("(hibás JSON)");
    }
  } else if (rel.endsWith(".md")) {
    const h = lines.find((l) => /^#{1,2}\s/.test(l));
    if (h) add(h.trim().slice(0, 100));
  }
  return out;
}

/** Kódtérkép: a könyvtár fájljai sorszámmal és a fontos elemekkel. */
export function codeMap(ws: Workspace, access: Access, rel?: string): string {
  const root = rel?.trim() || "product";
  const files = ws.list(root, access, MAX_SCAN_FILES);
  if (!files.length) return `Üres: ${root}`;
  const parts: string[] = [];
  let size = 0;
  let shown = 0;
  for (const f of files) {
    let content: string;
    try {
      content = ws.read(f, access);
    } catch {
      continue;
    }
    if (!isText(f, content)) continue;
    const lines = content.split("\n").length;
    const items = outline(f, content);
    const block = `${f} (${lines} sor)${items.length ? `\n${items.slice(0, 25).map((x) => `  ${x}`).join("\n")}${items.length > 25 ? `\n  …+${items.length - 25}` : ""}` : ""}`;
    if (size + block.length > MAX_MAP_CHARS) {
      parts.push(`…a térkép itt levágva (${files.length - shown} fájl hiányzik); kérj szűkebb könyvtárat, pl. ${path.posix.dirname(f)}.`);
      break;
    }
    parts.push(block);
    size += block.length + 1;
    shown++;
  }
  return `Kódtérkép: ${root} (${files.length} fájl${files.length >= MAX_SCAN_FILES ? "+" : ""})\n${parts.join("\n")}`;
}
