import type { Role, Tier } from "../company/org.js";
import { registerPrices } from "./budget.js";
import { DEFAULT_MODELS } from "./catalog.js";
import { parseModel, PROVIDERS, providerKey, type ProviderId } from "./providers.js";
import { readSettings } from "./settings.js";

type Effort = "low" | "medium" | "high";

export interface Config {
  models: Record<Tier, string>;
  /** Ezek a szerepek a legerősebb modellt kapják (stratégia és architektúra); mindenki más a szintje szerintit. */
  strategic: { model: string; roles: string[] };
  /** Agentenkénti egyedi modell (Beállítások); erősebb a szint szerintinél. */
  roleModels: Record<string, string>;
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
  /** Kódfeladaton több lépés és keret kell: olvasás, írás, ellenőrzés, javítás. */
  maxTurnsPerCodeTask: number;
  codeTaskBudgetUsd: number;
  /** Egy vezérigazgatói chatválasz kerete USD-ben. */
  chatBudgetUsd: number;
  /** Szünet: az ütemezett munka és a levélfeldolgozás áll. */
  paused: boolean;
  /** Fusson-e a levélfeldolgozás, és legyen-e a levelekből feladat. */
  inbox: { enabled: boolean; createTasks: boolean };
  /** A beérkező levelek feldolgozása (személyes adat): csak megengedett szolgáltatónál futhat. Üres, ha nincs ilyen modell. */
  inboxModel: string;
  /** Ezek a szolgáltatók kaphatnak személyes adatot (ügyféllevelek). */
  personalDataProviders: ProviderId[];
  /** Belső verseny (Aréna): a kihívó ugyanazt a feladatot árnyékban megoldja, egy bíró összeveti. */
  arena: { enabled: boolean; duelsPerRun: number; monthlyUsd: number; contestants: string[]; judge?: string; disabledLessons: string[]; approvedLessons: string[] };
  /** Tanulás a saját munkából (napi visszatekintés) és a kikapcsolt tanulságok. */
  learning: { enabled: boolean; disabled: string[] };
  /** Önfejlesztés: motorfejlesztési feladatok és pull requestek a main ágra. */
  selfdev: { enabled: boolean };
  /** Mely szolgáltatókhoz van kulcs (a belső verseny csak ezek modelljeit hívja). */
  availableProviders: ProviderId[];
  /** Hiányzó API-kulcsok az agentek modelljeihez; ha van ilyen, a cég nem dolgozik (dryRun). */
  missingKeys: string[];
  /** Hiányzó kulcs a levélfeldolgozás modelljéhez; csak a Postát állítja meg. */
  inboxMissingKeys: string[];
  rootDir: string;
  dryRun: boolean;
}

const DEFAULT_BULK = DEFAULT_MODELS.bulk;

const num = (v: string | undefined, d: number): number => {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/** Érvényes modellnév, vagy undefined (egy kézzel elrontott beállítás ne állítsa le a céget). */
const valid = (m: string | undefined): string | undefined => {
  const v = m?.trim();
  if (!v) return undefined;
  try {
    parseModel(v);
    return v;
  } catch {
    console.warn(`::warning::Érvénytelen modellbeállítás, kihagyva: ${v}`);
    return undefined;
  }
};

/** Sorrend: a vezérlőterem Beállítások füle (state/settings.json), aztán GitHub-változó, végül az alapérték. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, rootDir = process.cwd()): Config {
  const st = readSettings(rootDir);
  const models: Record<Tier, string> = {
    // A költség nagy része a vezetőkön ment el; Sonnet-tel ugyanaz a munka kb. fele annyiba kerül.
    lead: valid(st.models?.lead) ?? valid(env.MODEL_LEAD) ?? DEFAULT_MODELS.lead,
    worker: valid(st.models?.worker) ?? valid(env.MODEL_WORKER) ?? DEFAULT_MODELS.worker,
    bulk: valid(st.models?.bulk) ?? valid(env.MODEL_BULK) ?? DEFAULT_BULK,
  };
  const strategic = valid(st.models?.strategic) ?? valid(env.MODEL_STRATEGIC) ?? DEFAULT_MODELS.strategic;
  const roleModels = Object.fromEntries(Object.entries(st.models?.roles ?? {}).flatMap(([r, m]) => (valid(m) ? [[r, valid(m)!]] : [])));
  // Alapból a Kimi (kínai szolgáltató) nem kap ügyféladatot; a Beállításokban vagy PERSONAL_DATA_PROVIDERS-szel felülírható.
  const personalDataProviders = (st.personalDataProviders ?? (env.PERSONAL_DATA_PROVIDERS?.trim() || "anthropic,openai").split(/[\s,]+/))
    .filter(Boolean)
    .flatMap((p) => {
      try {
        return [parseModel(`${p}:x`).provider];
      } catch {
        return [];
      }
    });
  const allowed = (m: string) => personalDataProviders.includes(parseModel(m).provider);
  const inboxWanted = valid(st.models?.inbox) ?? valid(env.MODEL_INBOX) ?? models.bulk;
  // Ha a kért modell nem kaphat személyes adatot, egy olcsó megengedett modell dolgozza fel.
  const hasAnthropic = Boolean(providerKey("anthropic", env));
  // Nem megengedett szolgáltatóra sosem esünk vissza: ha nincs megfelelő modell, a levélfeldolgozás áll.
  const inboxModel = [inboxWanted, models.bulk, hasAnthropic ? DEFAULT_BULK : "", models.worker, models.lead, strategic].filter(Boolean).find(allowed) ?? "";
  const inboxEnabled = st.inbox?.enabled ?? true;
  const keysFor = (specs: string[]) => [...new Set(specs.map((m) => parseModel(m).provider))].filter((p) => !providerKey(p, env)).map((p) => PROVIDERS[p].keyEnv[0]!);
  const missingKeys = keysFor([...Object.values(models), strategic, ...Object.values(roleModels)]);
  const inboxMissingKeys = inboxModel ? keysFor([inboxModel]) : [];
  registerPrices(st.prices ?? {});
  return {
    models,
    strategic: { model: strategic, roles: ["ceo"] },
    roleModels,
    effort: { lead: st.effort?.lead ?? "medium", worker: st.effort?.worker ?? "medium", bulk: st.effort?.bulk ?? "low" },
    inboxModel,
    personalDataProviders,
    missingKeys,
    inboxMissingKeys,
    availableProviders: (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => providerKey(p, env)),
    monthlyBudgetUsd: st.budget?.monthlyUsd ?? num(env.MONTHLY_BUDGET_USD, 50),
    runBudgetUsd: st.budget?.runUsd ?? num(env.RUN_BUDGET_USD, 3),
    maxTasksPerRun: st.budget?.maxTasksPerRun ?? num(env.MAX_TASKS_PER_RUN, 6),
    maxTurnsPerTask: st.budget?.maxTurnsPerTask ?? num(env.MAX_TURNS_PER_TASK, 8),
    taskBudgetUsd: st.budget?.taskUsd ?? num(env.TASK_BUDGET_USD, 0.6),
    maxTurnsPerCodeTask: st.budget?.maxTurnsPerCodeTask ?? num(env.MAX_TURNS_PER_CODE_TASK, 20),
    codeTaskBudgetUsd: st.budget?.codeTaskUsd ?? num(env.CODE_TASK_BUDGET_USD, 1.2),
    chatBudgetUsd: st.budget?.chatUsd ?? num(env.CHAT_BUDGET_USD, 0.5),
    paused: st.paused === true,
    inbox: { enabled: inboxEnabled, createTasks: st.inbox?.createTasks ?? true },
    arena: {
      enabled: st.arena?.enabled ?? true,
      duelsPerRun: st.arena?.duelsPerRun ?? 1,
      monthlyUsd: st.arena?.monthlyUsd ?? 5,
      contestants: (st.arena?.contestants ?? []).flatMap((m) => valid(m) ?? []),
      judge: valid(st.arena?.judge),
      disabledLessons: st.arena?.disabledLessons ?? [],
      approvedLessons: st.arena?.approvedLessons ?? [],
    },
    learning: { enabled: st.learning?.enabled ?? true, disabled: st.learning?.disabled ?? [] },
    selfdev: { enabled: st.selfdev?.enabled ?? true },
    rootDir,
    dryRun: env.DRY_RUN === "1" || missingKeys.length > 0,
  };
}

/** Kaphat-e ez a modell személyes adatot (pl. ügyféllevelet). */
export const personalDataAllowed = (config: Config, model: string): boolean => Boolean(model) && config.personalDataProviders.includes(parseModel(model).provider);

/** Rövid magyar magyarázat, ha hiányzik kulcs. */
export const missingKeysText = (config: Config, keys = config.missingKeys): string =>
  keys.length ? `Nincs beállítva a(z) ${keys.map((k) => `\`${k}\``).join(", ")} titok a repóban` : "";

/** Egy feladat lépés- és költségkerete (a kódfeladaté nagyobb). */
export const taskLimits = (config: Config, kind: string): { turns: number; usd: number } =>
  kind === "code" ? { turns: config.maxTurnsPerCodeTask, usd: config.codeTaskBudgetUsd } : { turns: config.maxTurnsPerTask, usd: config.taskBudgetUsd };

/** Melyik modellen dolgozik egy szerep. */
export function modelFor(config: Config, role: Role): string {
  return config.roleModels[role.id] ?? (config.strategic.roles.includes(role.id) ? config.strategic.model : config.models[role.tier]);
}
