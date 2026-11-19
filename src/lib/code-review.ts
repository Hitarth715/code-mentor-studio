export type FindingSeverity = "critical" | "high" | "medium" | "low";

export interface CodeFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  category: "Security" | "Quality";
  line: number;
  explanation: string;
  suggestion: string;
  replacement: string;
}

export function analyzeCode(source: string): CodeFinding[] {
  const findings: CodeFinding[] = [];

  source.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;

    if (/\b(?:password|secret|api[_-]?key|token)\s*=\s*["'`][^"'`]{4,}["'`]/i.test(line)) {
      findings.push({
        id: "hardcoded-secret",
        title: "A password is written directly in the code",
        severity: "high",
        category: "Security",
        line: lineNumber,
        explanation:
          "Anyone who can read or share this file can see the password. Even a test password can accidentally get reused.",
        suggestion:
          "Keep credentials out of source files. Read a secret from your server’s environment and change this exposed value.",
        replacement: "  const password = process.env.DB_PASSWORD;",
      });
    }

    const containsSql = /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(line);
    if (containsSql && /\$\{[^}]+\}/.test(line)) {
      findings.push({
        id: "sql-interpolation",
        title: "User input is inserted directly into a database query",
        severity: "critical",
        category: "Security",
        line: lineNumber,
        explanation:
          "A specially written user ID could change what this SQL query does. This is a common way attackers access data they should not see.",
        suggestion:
          "Use a parameterized query. The database treats the user ID as a value instead of executable SQL.",
        replacement: '  const query = "SELECT * FROM users WHERE id = ?";',
      });
    }

    if (/\beval\s*\(/.test(line)) {
      findings.push({
        id: "dynamic-eval",
        title: "This code runs text as a program",
        severity: "high",
        category: "Security",
        line: lineNumber,
        explanation:
          "If that text comes from a user, they may be able to make your app run unexpected commands.",
        suggestion:
          "Avoid eval. Use a specific, safe parser or a small set of allowed actions instead.",
        replacement: "  // Replace eval with a safe parser for the expected input.",
      });
    }
  });

  return findings;
}

export function scoreCode(findings: CodeFinding[]): number {
  const deductions: Record<FindingSeverity, number> = {
    critical: 28,
    high: 19,
    medium: 12,
    low: 5,
  };

  return Math.max(
    100 - findings.reduce((score, finding) => score + deductions[finding.severity], 0),
    0,
  );
}