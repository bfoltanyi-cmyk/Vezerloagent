import type { Role, Tier } from "../company/org.js";

type Effort = "low" | "medium" | "high";

export interface Config {
  models: Record<Tier, string>;
  /** Ezek a szerepek a legerősebb modellt kapják (stratégia és architektúra); mindenki más a szintje szerintit. */
  strategic: { model: string; roles: string[] };
  effort: Record<Tier, Effort>;
  /** Havi költségkeret USD-ben; elérésekor a cég leáll a hónap végéig. */
  monthlyBudgetUsd: number;
  /** Egy munkanap (futás) költségkerete USD-ben. */
  runBudgetUsd: number;
  /** Hány feladatot dolgozhat fel egy munkanap. */
  maxTasksPerRun: number;
  /** Egy agent legfeljebb ennyi modellhívást tehet egy feladaton. */
  maxTurnsPerTask: number;
  /** Egy feladatra szánt keret USD-ben; elérésekor az agent lezárásra kap utasítást. */
  taskBudgetUsd: number;
  rootDir: string;
  dryRun: boolean;
}

const num = (v: string | undefined, d: number): number => {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env, rootDir = process.cwd()): Config {
  return {
    models: {
      // A költség nagy része a vezetőkön ment el; Sonnet-tel ugyanaz a munka kb. fele annyiba kerül.
      lead: env.MODEL_LEAD || "claude-sonnet-5-5",
      worker: env.MODEL_WORKER || "claude-sonnet-5-5",
      bulk: env.MODEL_BULK || "claude-haiku-5-5",
    },
    strategic: { model: env.MODEL_STRATEGIC || "claude-opus-5-5", roles: ["ceo"] },
    effort: { lead: "medium", worker: "medium", bulk: "low" },
    monthlyBudgetUsd: num(env.MONTHLY_BUDGET_USD, 50),
    runBudgetUsd: num(env.RUN_BUDGET_USD, 3),
    maxTasksPerRun: num(env.MAX_TASKS_PER_RUN, 6),
    maxTurnsPerTask: num(env.MAX_TURNS_PER_TASK, 8),
    taskBudgetUsd: num(env.TASK_BUDGET_USD, 0.6),
    rootDir,
    dryRun: env.DRY_RUN === "1" || !(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
  };
}

/** Melyik modellen dolgozik egy szerep. */
export function modelFor(config: Config, role: Role): string {
  return config.strategic.roles.includes(role.id) ? config.strategic.model : config.models[role.tier];
}
