// Munkarend: az óránként induló munkanap-ütemező ezzel dönti el, hogy most dolgozzon-e a cég.
// Függőség nélküli, hogy a GitHub-futtatón telepítés nélkül, másodpercek alatt lefusson.
// Használat: node scripts/schedule.mjs <settings.json> [company.json]  → run=true|false a GITHUB_OUTPUT-ba.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_SCHEDULE = { days: [1, 2, 3, 4, 5], hours: [8, 16] };
export const TIME_ZONE = "Europe/Budapest";
/** A GitHub ütemezője gyakran késik; egy munkaóra ennyi ideig még elindulhat. */
export const LATE_TOLERANCE_MS = 90 * 60_000;

/** Budapesti idő szerinti nap (1 = hétfő … 7 = vasárnap) és óra. */
export function localDayHour(now, timeZone = TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return { day, hour: Number(parts.hour) };
}

/**
 * Indulhat-e most az ütemezett munkanap a beállítások szerint.
 * Egy munkaóra (pl. 8:00) a kezdetétől 90 percig indíthat munkanapot, de csak egyszer:
 * ha a legutóbbi munkanap már ebben az órában vagy utána indult, kimarad.
 */
export function shouldRunNow(settings, now = new Date(), lastRun) {
  const s = settings && typeof settings === "object" ? settings : {};
  if (s.paused === true) return { run: false, reason: "A cég szünetel (Beállítások → Munkarend)." };
  const days = Array.isArray(s.schedule?.days) ? s.schedule.days : DEFAULT_SCHEDULE.days;
  const hours = Array.isArray(s.schedule?.hours) ? s.schedule.hours : DEFAULT_SCHEDULE.hours;
  // Budapest egész órás eltolással jár, így az UTC óra eleje a helyi óra eleje is.
  const top = new Date(now);
  top.setUTCMinutes(0, 0, 0);
  for (const start of [top, new Date(top.getTime() - 3_600_000)]) {
    if (now.getTime() - start.getTime() >= LATE_TOLERANCE_MS) continue;
    const { day, hour } = localDayHour(start);
    if (!days.includes(day) || !hours.includes(hour)) continue;
    const last = lastRun ? Date.parse(lastRun) : NaN;
    if (Number.isFinite(last) && last >= start.getTime()) return { run: false, reason: `A ${hour} órás munkanap már lefutott.` };
    return { run: true, reason: `Munkanap: ${day}. nap, ${hour} óra.` };
  }
  const { day, hour } = localDayHour(now);
  if (!days.includes(day)) return { run: false, reason: `Ma (${day}. nap) nincs munkanap.` };
  return { run: false, reason: `${hour} órakor nincs munkanap (munkaórák: ${hours.join(", ") || "nincs"}).` };
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // Nincs még beállítás: alap munkarend.
  const settings = readJson(process.argv[2] ?? "settings.json")?.settings ?? {};
  const meta = process.argv[3] ? readJson(process.argv[3])?.meta ?? {} : {};
  // A futó munkanap is számít, hogy egy késve induló második ütemezés ne indítson még egyet.
  const lastRun = [meta.running, meta.lastRun].filter((x) => typeof x === "string").sort().at(-1);
  const r = shouldRunNow(settings, new Date(), lastRun);
  console.log(r.reason);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${r.run}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${r.reason}\n`);
}
