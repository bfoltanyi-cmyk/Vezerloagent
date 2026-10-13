// A vezérlőterem statikus oldalának összeállítása a GitHub Pages számára (_site/).

import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { saveState, loadState } from "./state.js";

const root = process.cwd();
const out = path.join(root, "_site");
const data = path.join(out, "data");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(data, { recursive: true });

// Az org.json mindig friss legyen, akkor is, ha még nem volt munkanap.
saveState(root, loadState(root));

fs.copyFileSync(path.join(root, "dashboard", "index.html"), path.join(out, "index.html"));
fs.copyFileSync(path.join(root, "state", "company.json"), path.join(data, "company.json"));
fs.copyFileSync(path.join(root, "state", "org.json"), path.join(data, "org.json"));

const reportsDir = path.join(root, "state", "reports");
const latest = fs.existsSync(reportsDir) ? fs.readdirSync(reportsDir).filter((f) => f.endsWith(".md")).sort().at(-1) : undefined;
if (latest) fs.copyFileSync(path.join(reportsDir, latest), path.join(data, "report.md"));

const repo = process.env.GITHUB_REPOSITORY;
const meta = {
  builtAt: new Date().toISOString(),
  monthlyBudgetUsd: loadConfig().monthlyBudgetUsd,
  repoUrl: repo ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}` : undefined,
};
fs.writeFileSync(path.join(data, "meta.json"), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log(`Vezérlőterem kész: ${out}`);
