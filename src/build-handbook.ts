// A docs/core/kezikonyv.md előállítása a company/playbook.ts alapján.

import fs from "node:fs";
import path from "node:path";
import { renderHandbook } from "../company/playbook.js";

const target = path.join(process.cwd(), "docs", "core", "kezikonyv.md");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, renderHandbook());
console.log(`Kész: ${path.relative(process.cwd(), target)}`);
