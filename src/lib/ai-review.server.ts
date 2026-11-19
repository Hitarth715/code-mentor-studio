import {
  AI_RESPONSE_SCHEMA,
  AI_SYSTEM_PROMPT,
  buildReviewPrompt,
  parseAiFindings,
  type AiReviewResult,
} from "@/lib/ai-review";
import { analyzeCode } from "@/lib/code-review";

const DEFAULT_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 30_000;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Server-only. Reads GEMINI_API_KEY (and optionally GEMINI_MODEL) from the environment.
 * The key never leaves the server and is never included in an error message.
 */
export async function runAiReview(source: string, language: string): Promise<AiReviewResult> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    return {
      ok: false,
      error: "AI review isn’t set up yet. Add GEMINI_API_KEY on the server and try again.",
    };
  }

  const model = process.env["GEMINI_MODEL"] || DEFAULT_MODEL;
  const prompt = buildReviewPrompt(source, language, analyzeCode(source));

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: AI_RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch (error) {
    console.error("AI review request failed:", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "The AI service didn’t respond in time. Please try again." };
  }

  if (!response.ok) {
    console.error("AI review upstream error, status", response.status);
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error: "The AI service rejected the request. Check that GEMINI_API_KEY is valid.",
      };
    }
    if (response.status === 429) {
      return { ok: false, error: "The AI service is busy or over its limit. Try again shortly." };
    }
    return { ok: false, error: "The AI service had a problem. Please try again." };
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    return { ok: false, error: "The AI service returned an empty answer. Please try again." };
  }

  return { ok: true, findings: parseAiFindings(text, source) };
}
