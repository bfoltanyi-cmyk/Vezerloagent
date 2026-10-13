// Kézi döntés egy kapun GitHub nélkül: npm run gate -- G-001 approve "megjegyzés"

import { decideGate } from "./board.js";
import { loadState, saveState } from "./state.js";

const [gateId, verdict, ...rest] = process.argv.slice(2);
if (!gateId || (verdict !== "approve" && verdict !== "reject")) {
  console.error('Használat: npm run gate -- <G-001> <approve|reject> ["megjegyzés"]');
  process.exit(1);
}
const root = process.cwd();
const s = loadState(root);
decideGate(s, gateId, verdict === "approve" ? "approved" : "rejected", rest.join(" "));
saveState(root, s);
console.log(`${gateId}: ${verdict === "approve" ? "jóváhagyva" : "elutasítva"}`);
