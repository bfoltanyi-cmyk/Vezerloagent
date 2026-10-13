import { describe, expect, it } from "vitest";
import { completeTask, createTask, decideGate, emptyState, getTask, requestGate, runnableTasks, seedBacklog, submitReview } from "../src/board.js";

const t0 = new Date("2026-10-13T08:00:00Z");
const later = (min: number) => new Date(t0.getTime() + min * 60_000);

describe("feladattábla", () => {
  it("a függőségek teljesüléséig nem indít feladatot", () => {
    const s = emptyState();
    seedBacklog(s, t0);
    const ids = runnableTasks(s, 10).map((t) => t.title);
    expect(ids).toContain("Piaci rés: magyar KKV számlázás + készlet");
    expect(ids).not.toContain("PRD: első termékszelet (számlázás + készlet)");
  });

  it("szerepet csak a saját részlegébe lehet kiosztani", () => {
    const s = emptyState();
    expect(() => createTask(s, { title: "Teszt", description: "Valami munka", department: "sales", assignee: "architect" }, "ceo")).toThrow(/nem a\(z\) sales/);
  });

  it("a kódfeladat csak kódellenőr és biztonsági jóváhagyás után kész", () => {
    const s = emptyState();
    const t = createTask(s, { title: "Számla API", description: "REST végpontok", department: "dev", assignee: "backend-invoicing" }, "architect", t0);
    completeTask(s, t.id, "backend-invoicing", "Kész a számla API tesztekkel.", later(1));
    expect(getTask(s, t.id).status).toBe("review");
    const reviews = s.tasks.filter((x) => x.reviewOf === t.id);
    expect(reviews.map((r) => r.assignee).sort()).toEqual(["appsec", "code-reviewer"]);

    submitReview(s, reviews[0]!.id, reviews[0]!.assignee, "approve", "Rendben.", later(2));
    expect(getTask(s, t.id).status).toBe("review");
    submitReview(s, reviews[1]!.id, reviews[1]!.assignee, "approve", "Rendben.", later(3));
    expect(getTask(s, t.id).status).toBe("done");
  });

  it("javítási kérés visszaküldi a feladatot, és új kör indul", () => {
    const s = emptyState();
    const t = createTask(s, { title: "Készletfoglalás", description: "Foglalás logika", department: "dev", assignee: "backend-inventory" }, "architect", t0);
    completeTask(s, t.id, "backend-inventory", "Első változat kész.", later(1));
    const [a, b] = s.tasks.filter((x) => x.reviewOf === t.id);
    submitReview(s, b!.id, "appsec", "changes", "SQL injekció a keresőben.", later(2));
    expect(getTask(s, t.id).status).toBe("todo");
    expect(getTask(s, a!.id).status).toBe("done");

    completeTask(s, t.id, "backend-inventory", "Javítva, paraméterezett lekérdezés.", later(3));
    const round2 = s.tasks.filter((x) => x.reviewOf === t.id && x.reviewRound === 2);
    expect(round2).toHaveLength(2);
    for (const r of round2) submitReview(s, r.id, r.assignee, "approve", "Rendben.", later(4));
    expect(getTask(s, t.id).status).toBe("done");
  });

  it("a kapu jóváhagyása lezárja, elutasítása visszanyitja a feladatot", () => {
    const s = emptyState();
    const t = createTask(s, { title: "PRD", description: "Termékleírás", department: "product" }, "ceo", t0);
    const g = requestGate(s, t.id, "spec", "PRD v1", "Kérlek nézd át a PRD-t.", "product-manager", later(1));
    expect(getTask(s, t.id).status).toBe("awaiting_approval");
    decideGate(s, g.id, "rejected", "Legyen benne a NAV is.", later(2));
    expect(getTask(s, t.id).status).toBe("todo");
    expect(getTask(s, t.id).notes.at(-1)?.text).toContain("NAV");

    const g2 = requestGate(s, t.id, "spec", "PRD v2", "Javított PRD a NAV-val.", "product-manager", later(3));
    decideGate(s, g2.id, "approved", "", later(4));
    expect(getTask(s, t.id).status).toBe("done");
  });
});
