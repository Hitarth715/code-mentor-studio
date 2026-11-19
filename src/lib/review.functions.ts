import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { analyzeCode, type CodeFinding } from "./code-review";
import { MAX_SOURCE_CHARS, readLlmConfig, reviewWithLlm } from "./llm-review";
import { checkSyntax } from "./syntax-check";

const inputSchema = z.object({
  source: z.string().max(MAX_SOURCE_CHARS),
  language: z.string().trim().min(1).max(30),
});

export interface ReviewResult {
  /** "ai" when the LLM produced the findings, "rules" when the built-in checks were used. */
  engine: "ai" | "rules";
  findings: CodeFinding[];
  model?: string;
  /** The complete corrected program, when the AI reviewer produced one. */
  correctedCode?: string;
  /** Plain-language description of what was changed. */
  summary?: string;
  /** Shown to the student when the AI reviewer could not be used. */
  notice?: string;
}

/**
 * Reviews and corrects code with the LLM on the server (the API key never reaches the browser).
 * If the key is missing or the call fails, it falls back to the built-in syntax and rule checks.
 */
export const reviewCode = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ReviewResult> => {
    const syntaxFindings = checkSyntax(data.source, data.language);

    const fallback = (notice: string): ReviewResult => ({
      engine: "rules",
      findings: [...syntaxFindings, ...analyzeCode(data.source)],
      notice,
    });

    if (!data.source.trim()) return fallback("Add some code first, then press Review.");

    const config = readLlmConfig(process.env);
    if (!config) {
      return fallback("The AI reviewer isn't set up yet, so the built-in checks were used.");
    }

    try {
      const hints = syntaxFindings.map((finding) => `line ${finding.line}: ${finding.title}`);
      const review = await reviewWithLlm(config, data.source, data.language, hints);
      const result: ReviewResult = { engine: "ai", findings: review.findings, model: config.model };
      if (review.correctedCode) result.correctedCode = review.correctedCode;
      if (review.summary) result.summary = review.summary;
      return result;
    } catch (error) {
      console.error("[review] LLM review failed:", error);
      return fallback("The AI reviewer couldn't be reached, so the built-in checks were used.");
    }
  });
