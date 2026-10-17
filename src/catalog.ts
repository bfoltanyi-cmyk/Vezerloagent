// A választható AI-motorok listája árakkal. Ebből számol a költségnyilvántartás, és ebből
// kínál választást a vezérlőterem Beállítások füle. Árak: USD / millió token, 2026. októberi
// hivatalos árlisták szerint; ami nincs a listán, a Beállításokban saját árral megadható.

export type ProviderId = "anthropic" | "openai" | "kimi";
export type CatalogTier = "strategic" | "lead" | "worker" | "bulk";

export interface CatalogModel {
  /** A beállításban használt név: szolgáltató:modell (Anthropicnál előtag nélkül). */
  spec: string;
  provider: ProviderId;
  name: string;
  input: number;
  output: number;
  cacheRead: number;
  /** Mire ajánlott. */
  tiers: CatalogTier[];
  note: string;
}

export const PROVIDER_INFO: Record<ProviderId, { name: string; keyEnv: string; keyUrl: string; personalDataNote: string }> = {
  anthropic: { name: "Anthropic (Claude)", keyEnv: "ANTHROPIC_API_KEY", keyUrl: "https://console.anthropic.com/settings/keys", personalDataNote: "Adatfeldolgozási szerződés (DPA) elérhető; API-adatot nem használ tanításra." },
  openai: { name: "OpenAI", keyEnv: "OPENAI_API_KEY", keyUrl: "https://platform.openai.com/api-keys", personalDataNote: "Adatfeldolgozási szerződés (DPA) elérhető; API-adatot alapból nem használ tanításra." },
  kimi: { name: "Moonshot Kimi", keyEnv: "MOONSHOT_API_KEY", keyUrl: "https://platform.kimi.ai/", personalDataNote: "Kínai szolgáltató: EU-s személyes adat átadásához külön jogi vizsgálat (adattovábbítási hatásvizsgálat) kell." },
};

export const MODEL_CATALOG: CatalogModel[] = [
  { spec: "claude-opus-5-5", provider: "anthropic", name: "Claude Opus 5.5", input: 4, output: 20, cacheRead: 0.2, tiers: ["strategic"], note: "A legerősebb; stratégiai döntésekhez." },
  { spec: "claude-sonnet-5-5", provider: "anthropic", name: "Claude Sonnet 5.5", input: 2, output: 10, cacheRead: 0.2, tiers: ["lead", "worker"], note: "Kiegyensúlyozott; vezetőknek és munkatársaknak." },
  { spec: "claude-haiku-5-5", provider: "anthropic", name: "Claude Haiku 5.5", input: 0.1, output: 0.5, cacheRead: 0.01, tiers: ["bulk"], note: "Gyors és olcsó; tömeges munkára." },
  { spec: "openai:gpt-6-astra", provider: "openai", name: "GPT-6 Astra", input: 10, output: 50, cacheRead: 1, tiers: ["strategic"], note: "Az OpenAI legerősebb modellje; drága." },
  { spec: "openai:gpt-6.1-sol", provider: "openai", name: "GPT-6.1 Sol", input: 2, output: 10, cacheRead: 0.1, tiers: ["lead", "worker"], note: "Közel az Astrához, ötödáron." },
  { spec: "openai:gpt-6-sol", provider: "openai", name: "GPT-6 Sol", input: 2, output: 10, cacheRead: 0.2, tiers: ["worker"], note: "Az előző Sol-változat, azonos áron." },
  { spec: "openai:gpt-6-luna", provider: "openai", name: "GPT-6 Luna", input: 0.1, output: 0.5, cacheRead: 0.01, tiers: ["bulk"], note: "A legolcsóbb OpenAI-modell." },
  { spec: "kimi:kimi-k3", provider: "kimi", name: "Kimi K3", input: 3, output: 15, cacheRead: 0.3, tiers: ["strategic", "lead"], note: "A Kimi zászlóshajója, mindig gondolkodik." },
  { spec: "kimi:kimi-k2.6", provider: "kimi", name: "Kimi K2.6", input: 0.95, output: 4, cacheRead: 0.16, tiers: ["worker", "bulk"], note: "Általános agentmodell, olcsó." },
  { spec: "kimi:kimi-k2.7-code", provider: "kimi", name: "Kimi K2.7 Code", input: 0.95, output: 4, cacheRead: 0.19, tiers: ["worker"], note: "Kódolásra hangolva; fejlesztőknek." },
];

/** Az alapbeállítás szintenként (ha a Beállításokban és GitHub-változóban sincs más). */
export const DEFAULT_MODELS = { strategic: "claude-opus-5-5", lead: "claude-sonnet-5-5", worker: "claude-sonnet-5-5", bulk: "claude-haiku-5-5" } as const;
