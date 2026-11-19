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