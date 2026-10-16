// Munkarend: az óránként induló munkanap-ütemező ezzel dönti el, hogy most dolgozzon-e a cég.
// Függőség nélküli, hogy a GitHub-futtatón telepítés nélkül, másodpercek alatt lefusson.
// Használat: node scripts/schedule.mjs <settings.json>  → run=true|false a GITHUB_OUTPUT-ba.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_SCHEDULE = { days: [1, 2, 3, 4, 5], hours: [8, 16] };
export const TIME_ZONE = "Europe/Budapest";

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

/** Indulhat-e most az ütemezett munkanap a beállítások szerint. */
export function shouldRunNow(settings, now = new Date()) {
  const s = settings && typeof settings === "object" ? settings : {};
  if (s.paused === true) return { run: false, reason: "A cég szünetel (Beállítások → Működés)." };
  const days = Array.isArray(s.schedule?.days) ? s.schedule.days : DEFAULT_SCHEDULE.days;
  const hours = Array.isArray(s.schedule?.hours) ? s.schedule.hours : DEFAULT_SCHEDULE.hours;
  const { day, hour } = localDayHour(now);
  if (!days.includes(day)) return { run: false, reason: `Ma (${day}. nap) nincs munkanap.` };
  if (!hours.includes(hour)) return { run: false, reason: `${hour} órakor nincs munkanap (munkaórák: ${hours.join(", ") || "nincs"}).` };
  return { run: true, reason: `Munkanap: ${day}. nap, ${hour} óra.` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let settings = {};
  try {
    const f = JSON.parse(fs.readFileSync(process.argv[2] ?? "settings.json", "utf8"));
    settings = f?.settings ?? {};
  } catch {
    // Nincs még beállítás: alap munkarend.
  }
  const r = shouldRunNow(settings);
  console.log(r.reason);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${r.run}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${r.reason}\n`);
}
