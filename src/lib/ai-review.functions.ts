import { createServerFn } from "@tanstack/react-start";

import { aiReviewInputSchema, type AiReviewResult } from "@/lib/ai-review";

/** Callable from the browser; the handler body (and the API key) only ever runs on the server. */
export const reviewWithAi = createServerFn({ method: "POST" })
  .validator((input: unknown) => aiReviewInputSchema.parse(input))
  .handler(async ({ data }): Promise<AiReviewResult> => {
    const { runAiReview } = await import("@/lib/ai-review.server");
    return runAiReview(data.source, data.language);
  });
