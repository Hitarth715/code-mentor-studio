import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { analyzeCode, type CodeFinding } from "./code-review";
import { MAX_SOURCE_CHARS, readLlmConfig, reviewWithLlm } from "./llm-review";

const inputSchema = z.object({
  source: z.string().max(MAX_SOURCE_CHARS),
  language: z.string().trim().min(1).max(30),
});

export interface ReviewResult {
  /** "ai" when the LLM produced the findings, "rules" when the built-in checks were used. */
  engine: "ai" | "rules";
  findings: CodeFinding[];
  model?: string;
  /** Shown to the student when the AI reviewer could not be used. */
  notice?: string;
}

/**
 * Reviews code with the LLM on the server (the API key never reaches the browser).
 * If the key is missing or the call fails, it falls back to the built-in rules.
 */
export const reviewCode = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ReviewResult> => {
    const fallback = (notice: string): ReviewResult => ({
      engine: "rules",
      findings: analyzeCode(data.source),
      notice,
    });

    if (!data.source.trim()) return fallback("Add some code first, then press Review.");

    const config = readLlmConfig(process.env);
    if (!config) {
      return fallback("The AI reviewer isn't set up yet, so the built-in checks were used.");
    }

    try {
      const findings = await reviewWithLlm(config, data.source, data.language);
      return { engine: "ai", findings, model: config.model };
    } catch (error) {
      console.error("[review] LLM review failed:", error);
      return fallback("The AI reviewer couldn't be reached, so the built-in checks were used.");
    }
  });
