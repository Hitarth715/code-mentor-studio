import { describe, expect, it, vi } from "vitest";

import { buildMessages, parseLlmFindings, readLlmConfig, reviewWithLlm } from "@/lib/llm-review";

const code = 'const password = "welcome123";\nel.innerHTML = name;\nconsole.log("ok");';

describe("readLlmConfig", () => {
  it("returns null without a key", () => {
    expect(readLlmConfig({})).toBeNull();
  });

  it("uses the Lovable gateway defaults when only LOVABLE_API_KEY is set", () => {
    const config = readLlmConfig({ LOVABLE_API_KEY: "k" });
    expect(config?.apiUrl).toContain("ai.gateway.lovable.dev");
    expect(config?.model).toBeTruthy();
  });

  it("lets LLM_* variables override the defaults", () => {
    expect(
      readLlmConfig({
        LLM_API_KEY: "k",
        LLM_API_URL: "https://x.test/v1/chat/completions",
        LLM_MODEL: "m",
      }),
    ).toEqual({ apiKey: "k", apiUrl: "https://x.test/v1/chat/completions", model: "m" });
  });
});

describe("buildMessages", () => {
  it("numbers lines and fences the code as untrusted data", () => {
    const user = buildMessages("a\nb", "Python")[1]!.content;
    expect(user).toContain("1: a");
    expect(user).toContain("2: b");
    expect(user).toContain("<student_code>");
    expect(user).toContain("Language: Python");
  });
});

describe("parseLlmFindings", () => {
  const good = {
    id: "Hardcoded Secret",
    title: "Password in code",
    severity: "HIGH",
    category: "Security",
    line: 1,
    explanation: "Anyone can read it.",
    suggestion: "Use an env var.",
    replacement: "const password = process.env.DB_PASSWORD;",
  };

  it("parses a clean JSON reply into validated findings", () => {
    const [finding] = parseLlmFindings(JSON.stringify({ findings: [good] }), code);
    expect(finding).toMatchObject({
      id: "hardcoded-secret",
      key: "hardcoded-secret-1",
      severity: "high",
      category: "Security",
      line: 1,
      source: "ai",
    });
  });

  it("tolerates code fences and chatter around the JSON", () => {
    const raw =
      "Sure! Here you go:\n```json\n" +
      JSON.stringify({ findings: [good] }) +
      "\n```\nHope that helps.";
    expect(parseLlmFindings(raw, code)).toHaveLength(1);
  });

  it("accepts a bare array", () => {
    expect(parseLlmFindings(JSON.stringify([good]), code)).toHaveLength(1);
  });

  it("clamps out-of-range line numbers and normalizes odd severities/categories", () => {
    const [finding] = parseLlmFindings(
      JSON.stringify({ findings: [{ ...good, line: 999, severity: "info", category: "Bug" }] }),
      code,
    );
    expect(finding).toMatchObject({ line: 3, severity: "low", category: "Quality" });
  });

  it("drops malformed items instead of throwing, and de-duplicates", () => {
    const raw = JSON.stringify({ findings: [good, good, { title: "no line or text" }, "junk"] });
    expect(parseLlmFindings(raw, code)).toHaveLength(1);
  });

  it("clears a replacement that does not change the line", () => {
    const [finding] = parseLlmFindings(
      JSON.stringify({ findings: [{ ...good, line: 3, replacement: 'console.log("ok");' }] }),
      code,
    );
    expect(finding!.replacement).toBe("");
  });

  it("sorts the most severe findings first", () => {
    const raw = JSON.stringify({
      findings: [
        { ...good, id: "a", severity: "low", line: 1 },
        { ...good, id: "b", severity: "critical", line: 2 },
      ],
    });
    expect(parseLlmFindings(raw, code).map((f) => f.severity)).toEqual(["critical", "low"]);
  });

  it("throws on replies with no usable JSON so the caller can fall back", () => {
    expect(() => parseLlmFindings("I cannot help with that.", code)).toThrow();
    expect(() => parseLlmFindings('{"oops": 1}', code)).toThrow();
  });
});

describe("reviewWithLlm", () => {
  const config = {
    apiKey: "secret",
    apiUrl: "https://llm.test/v1/chat/completions",
    model: "test-model",
  };

  it("sends an authorized request and returns parsed findings", async () => {
    const reply = JSON.stringify({
      findings: [
        {
          title: "Raw HTML",
          severity: "high",
          category: "Security",
          line: 2,
          explanation: "XSS.",
          suggestion: "Use textContent.",
        },
      ],
    });
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: reply } }] })),
    );

    const findings = await reviewWithLlm(
      config,
      code,
      "JavaScript",
      fetchMock as unknown as typeof fetch,
    );

    expect(findings).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(config.apiUrl);
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer secret");
    expect(JSON.parse(init.body as string).model).toBe("test-model");
  });

  it("rejects on HTTP errors", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 429 }));
    await expect(
      reviewWithLlm(config, code, "JavaScript", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/429/);
  });

  it("rejects on an empty model reply", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] })),
    );
    await expect(
      reviewWithLlm(config, code, "JavaScript", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow();
  });
});
