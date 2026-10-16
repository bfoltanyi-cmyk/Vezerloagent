import type { Role, Tier } from "../company/org.js";
import { parseModel, PROVIDERS, providerKey, type ProviderId } from "./providers.js";

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
  /** A beérkező levelek feldolgozása (személyes adat): csak megengedett szolgáltatónál futhat. */
  inboxModel: string;
  /** Ezek a szolgáltatók kaphatnak személyes adatot (ügyféllevelek). */
  personalDataProviders: ProviderId[];
  /** Hiányzó API-kulcsok a beállított modellekhez; ha van ilyen, a cég nem dolgozik (dryRun). */
  missingKeys: string[];
  rootDir: string;
  dryRun: boolean;
}

const DEFAULT_BULK = "claude-haiku-5-5";

const num = (v: string | undefined, d: number): number => {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env, rootDir = process.cwd()): Config {
  const models: Record<Tier, string> = {
    // A költség nagy része a vezetőkön ment el; Sonnet-tel ugyanaz a munka kb. fele annyiba kerül.
    lead: env.MODEL_LEAD?.trim() || "claude-sonnet-5-5",
    worker: env.MODEL_WORKER?.trim() || "claude-sonnet-5-5",
    bulk: env.MODEL_BULK?.trim() || DEFAULT_BULK,
  };
  const strategic = env.MODEL_STRATEGIC?.trim() || "claude-opus-5-5";
  // Alapból a Kimi (kínai szolgáltató) nem kap ügyféladatot; PERSONAL_DATA_PROVIDERS-szel felülírható.
  const personalDataProviders = (env.PERSONAL_DATA_PROVIDERS?.trim() || "anthropic,openai")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((p) => parseModel(`${p}:x`).provider);
  const allowed = (m: string) => personalDataProviders.includes(parseModel(m).provider);
  const inboxWanted = env.MODEL_INBOX?.trim() || models.bulk;
  // Ha a kért modell nem kaphat személyes adatot, egy olcsó megengedett modell dolgozza fel.
  const hasAnthropic = Boolean(providerKey("anthropic", env));
  const inboxModel = [inboxWanted, models.bulk, hasAnthropic ? DEFAULT_BULK : "", models.worker, models.lead, strategic].filter(Boolean).find(allowed) ?? DEFAULT_BULK;
  const used = new Set([...Object.values(models), strategic, inboxModel].map((m) => parseModel(m).provider));
  const missingKeys = [...used].filter((p) => !providerKey(p, env)).map((p) => PROVIDERS[p].keyEnv[0]!);
  return {
    models,
    strategic: { model: strategic, roles: ["ceo"] },
    effort: { lead: "medium", worker: "medium", bulk: "low" },
    inboxModel,
    personalDataProviders,
    missingKeys,
    monthlyBudgetUsd: num(env.MONTHLY_BUDGET_USD, 50),
    runBudgetUsd: num(env.RUN_BUDGET_USD, 3),
    maxTasksPerRun: num(env.MAX_TASKS_PER_RUN, 6),
    maxTurnsPerTask: num(env.MAX_TURNS_PER_TASK, 8),
    taskBudgetUsd: num(env.TASK_BUDGET_USD, 0.6),
    rootDir,
    dryRun: env.DRY_RUN === "1" || missingKeys.length > 0,
  };
}

/** Kaphat-e ez a modell személyes adatot (pl. ügyféllevelet). */
export const personalDataAllowed = (config: Config, model: string): boolean => config.personalDataProviders.includes(parseModel(model).provider);

/** Rövid magyar magyarázat, ha hiányzik kulcs. */
export const missingKeysText = (config: Config): string =>
  config.missingKeys.length ? `Nincs beállítva a(z) ${config.missingKeys.map((k) => `\`${k}\``).join(", ")} titok a repóban` : "";

/** Melyik modellen dolgozik egy szerep. */
export function modelFor(config: Config, role: Role): string {
  return config.strategic.roles.includes(role.id) ? config.strategic.model : config.models[role.tier];
}
