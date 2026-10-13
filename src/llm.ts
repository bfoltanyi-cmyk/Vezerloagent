import Anthropic from "@anthropic-ai/sdk";

export type Effort = "low" | "medium" | "high";

export interface ModelRequest {
  model: string;
  effort: Effort;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
}

/** A motor ezen az interfészen át hívja a modellt; a tesztekben ezt helyettesítjük. */
export interface ModelClient {
  create(req: ModelRequest): Promise<Anthropic.Beta.BetaMessage>;
}

// A szerveroldali tartalék (fallback) az Opus és Sonnet modelleken érhető el a Claude API-n.
const supportsServerFallback = (model: string) => model.startsWith("claude-opus-") || model.startsWith("claude-sonnet-");

export class ClaudeClient implements ModelClient {
  private readonly client = new Anthropic();

  async create(req: ModelRequest): Promise<Anthropic.Beta.BetaMessage> {
    const fallback = supportsServerFallback(req.model);
    return this.client.beta.messages.create({
      model: req.model,
      max_tokens: 16000,
      output_config: { effort: req.effort },
      // A stabil rendszerprompt és eszközlista gyorsítótárazva olcsóbb.
      cache_control: { type: "ephemeral" },
      system: req.system,
      tools: req.tools,
      tool_choice: { type: "auto" },
      messages: req.messages,
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
  }
}
