import { describe, expect, it } from "vitest";

import { analyzeCode, scoreCode } from "@/lib/code-review";

describe("student code review", () => {
  it("flags a literal password on its source line", () => {
    const findings = analyzeCode('const password = "welcome123";');

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: "hardcoded-secret", severity: "high", line: 1 });
  });

  it("flags SQL statements containing interpolated input", () => {
    const findings = analyzeCode("const query = `SELECT * FROM users WHERE id = '${userId}'`;");

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: "sql-interpolation", severity: "critical", line: 1 });
  });

  it("scores code with no detected issues at 100", () => {
    expect(scoreCode(analyzeCode("const answer = 42;"))).toBe(100);
  });
});

describe("additional rules", () => {
  it("flags innerHTML assignment and suggests textContent", () => {
    const finding = analyzeCode("  el.innerHTML = userInput;")[0]!;

    expect(finding).toMatchObject({ id: "inner-html", severity: "high", category: "Security" });
    expect(finding.replacement).toBe("  el.textContent = userInput;");
  });

  it("flags an empty catch block and keeps the error name in the fix", () => {
    const finding = analyzeCode("try { run(); } catch (err) {}")[0]!;

    expect(finding).toMatchObject({ id: "empty-catch", category: "Quality" });
    expect(finding.replacement).toBe("try { run(); } catch (err) { console.error(err); }");
  });

  it("flags loose equality but not strict equality", () => {
    expect(analyzeCode("if (a == b) {}")[0]).toMatchObject({ id: "loose-equality" });
    expect(analyzeCode("if (a != b) {}")[0]?.replacement).toBe("if (a !== b) {}");
    expect(analyzeCode("if (a === b && c !== d) {}")).toHaveLength(0);
  });

  it("flags var and keeps indentation in the fix", () => {
    const finding = analyzeCode("  var count = 0;")[0]!;

    expect(finding).toMatchObject({ id: "var-keyword", severity: "low" });
    expect(finding.replacement).toBe("  let count = 0;");
  });
});

describe("finding keys", () => {
  it("gives repeated rules on different lines distinct keys", () => {
    const findings = analyzeCode("var a = 1;\nvar b = 2;");

    expect(findings.map((f) => f.key)).toEqual(["var-keyword-1", "var-keyword-2"]);
  });

  it("subtracts severity weights from the score", () => {
    expect(scoreCode(analyzeCode("var a = 1;"))).toBe(95);
  });
});

describe("language support", () => {
  it("runs built-in rules only for JavaScript and TypeScript", async () => {
    const { supportsBuiltInRules, fileInfoFor } = await import("@/lib/code-review");
    expect(supportsBuiltInRules("JavaScript")).toBe(true);
    expect(supportsBuiltInRules("TypeScript")).toBe(true);
    expect(supportsBuiltInRules("Python")).toBe(false);
    expect(fileInfoFor("Python")).toMatchObject({ name: "user-auth.py", badge: "PY" });
  });
});
