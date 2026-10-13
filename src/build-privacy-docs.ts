// A docs/security/adatvedelem/README.md összefoglaló előállítása a tudásbázisból.

import fs from "node:fs";
import path from "node:path";
import {
  AUTHORITIES,
  JURISDICTION_NAMES,
  JURISDICTIONS,
  LAST_REVIEWED,
  RULES,
  TOPIC_NAMES,
  type Topic,
} from "../company/privacy/knowledge.js";

export function renderPrivacyDocs(): string {
  const out: string[] = [
    "# Adatvédelmi tudásbázis",
    "",
    `Utolsó átnézés: ${LAST_REVIEWED}. Ez a fájl a \`company/privacy/knowledge.ts\` alapján készül (\`npm run build:privacy\`), kézzel ne szerkeszd.`,
    "",
    "> Munkasegédlet, nem jogi tanácsadás. A ⚠ jelölésű pontokat kiadás előtt helyi jogásznak ellenőriznie kell.",
    "",
    "## Hatóságok",
    "",
    "| Joghatóság | Hatóság | Honlap |",
    "|---|---|---|",
    ...JURISDICTIONS.map((j) => `| ${JURISDICTION_NAMES[j]} | ${AUTHORITIES[j].name} (${AUTHORITIES[j].short}) | ${AUTHORITIES[j].url} |`),
    "",
  ];
  for (const j of JURISDICTIONS) {
    out.push(`## ${JURISDICTION_NAMES[j]}`, "");
    const topics = [...new Set(RULES.filter((r) => r.jurisdiction === j).map((r) => r.topic))] as Topic[];
    for (const topic of topics) {
      out.push(`### ${TOPIC_NAMES[topic]}`, "");
      for (const r of RULES.filter((x) => x.jurisdiction === j && x.topic === topic)) {
        out.push(`**${r.title}**${r.verify ? " ⚠" : ""}`, "", r.rule, "", `- Forrás: ${r.source}`, `- Teendő nálunk: ${r.impact}`, "");
      }
    }
  }
  return out.join("\n");
}

const target = path.join(process.cwd(), "docs", "security", "adatvedelem", "README.md");
if (process.argv[1]?.endsWith("build-privacy-docs.ts")) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, renderPrivacyDocs());
  console.log(`Kész: ${path.relative(process.cwd(), target)}`);
}
