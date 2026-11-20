import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyLineFix,
  buildReviewPrompt,
  numberLines,
  parseAiFindings,
} from "@/lib/ai-review";
import { runAiReview } from "@/lib/ai-review.server";

const source = "function run(input) {\n  return input.trim();\n}";

describe("prompt building", () => {
  it("numbers lines and lists findings the rules already caught", () => {
    expect(numberLines("a\nb")).toBe("1| a\n2| b");
    const prompt = buildReviewPrompt(source, "JavaScript", [{ line: 2, title: "Known issue" }]);
    expect(prompt).toContain("- line 2: Known issue");
    expect(prompt).toContain("2|   return input.trim();");
  });
});

describe("parsing model output", () => {
  const good = {
    title: "Missing input check",
    severity: "medium",
    category: "Quality",
    line: 2,
    explanation: "input may be undefined.",
    suggestion: "Check first.",
    replacement: "  return input ? input.trim() : \"\";",
  };

  it("turns valid JSON into AI findings", () => {
    const [finding] = parseAiFindings(JSON.stringify([good]), source);
    expect(finding).toMatchObject({ source: "ai", line: 2, severity: "medium", id: "ai-review" });
    expect(finding!.key).toBe("ai-0-2");
  });

  it("accepts JSON wrapped in a markdown fence", () => {
    expect(parseAiFindings("```json\n" + JSON.stringify([good]) + "\n```", source)).toHaveLength(1);
  });

  it("returns nothing for garbage instead of throwing", () => {
    expect(parseAiFindings("not json", source)).toEqual([]);
    expect(parseAiFindings('{"a":1}', source)).toEqual([]);
  });

  it("clamps out-of-range lines, repairs bad enums and skips invalid items", () => {
    const findings = parseAiFindings(
      JSON.stringify([{ ...good, line: 99, severity: "scary", category: "Other" }, { nope: true }]),
      source,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 3, severity: "medium", category: "Quality" });
  });

  it("drops a replacement that equals the current line, and strips a leaked line prefix", () => {
    const [same] = parseAiFindings(JSON.stringify([{ ...good, replacement: "  return input.trim();" }]), source);
    expect(same!.replacement).toBe("");
    const [prefixed] = parseAiFindings(JSON.stringify([{ ...good, replacement: "2| fixed" }]), source);
    expect(prefixed!.replacement).toBe("fixed");
  });
});

describe("applying a line fix", () => {
  it("replaces one line and reports added lines for multi-line fixes", () => {
    expect(applyLineFix("a\nb\nc", 2, "B")).toEqual({ source: "a\nB\nc", delta: 0 });
    expect(applyLineFix("a\nb\nc", 2, "x\ny")).toEqual({ source: "a\nx\ny\nc", delta: 1 });
    expect(applyLineFix("a", 5, "x")).toBeNull();
  });
});

describe("runAiReview", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("explains setup when no key is configured, without calling the network", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await runAiReview(source, "JavaScript");
    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the key as a header, never in the URL, and returns parsed findings", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const reply = [{ title: "T", severity: "low", category: "Quality", line: 1, explanation: "e", suggestion: "s", replacement: "" }];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAiReview(source, "JavaScript");

    expect(result.ok && result.findings).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain("test-key");
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "test-key" });
  });

  it("maps upstream failures to friendly errors that do not leak details", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret upstream body", { status: 403 })));
    const result = await runAiReview(source, "JavaScript");
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret upstream body");
  });

  it("retries once on a temporary 503 and reports the status if it keeps failing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runAiReview(source, "JavaScript");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("503");
  });
});
