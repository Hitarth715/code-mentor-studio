export type FindingSeverity = "critical" | "high" | "medium" | "low";

export interface CodeFinding {
  /** Rule identifier. Several findings can share one id. */
  id: string;
  /** Unique per finding (rule id + line). Use this for selection and React keys. */
  key: string;
  title: string;
  severity: FindingSeverity;
  category: "Security" | "Quality" | "Syntax";
  line: number;
  explanation: string;
  suggestion: string;
  /** Full replacement for the flagged line. Empty when there is no safe automatic fix. */
  replacement: string;
  /** Where the finding came from: built-in rules or the LLM reviewer. */
  source: "rules" | "ai";
}

interface Rule {
  id: string;
  title: string;
  severity: FindingSeverity;
  category: CodeFinding["category"];
  explanation: string;
  suggestion: string;
  test: (line: string) => boolean;
  fix: (line: string) => string;
}

const indentOf = (line: string) => line.match(/^\s*/)?.[0] ?? "";

const rules: Rule[] = [
  {
    id: "hardcoded-secret",
    title: "A password is written directly in the code",
    severity: "high",
    category: "Security",
    explanation:
      "Anyone who can read or share this file can see the password. Even a test password can accidentally get reused.",
    suggestion:
      "Keep credentials out of source files. Read a secret from your server’s environment and change this exposed value.",
    test: (line) =>
      /\b(?:password|secret|api[_-]?key|token)\s*=\s*["'`][^"'`]{4,}["'`]/i.test(line),
    fix: () => "  const password = process.env.DB_PASSWORD;",
  },
  {
    id: "sql-interpolation",
    title: "User input is inserted directly into a database query",
    severity: "critical",
    category: "Security",
    explanation:
      "A specially written user ID could change what this SQL query does. This is a common way attackers access data they should not see.",
    suggestion:
      "Use a parameterized query. The database treats the user ID as a value instead of executable SQL.",
    test: (line) => /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(line) && /\$\{[^}]+\}/.test(line),
    fix: () => '  const query = "SELECT * FROM users WHERE id = ?";',
  },
  {
    id: "dynamic-eval",
    title: "This code runs text as a program",
    severity: "high",
    category: "Security",
    explanation:
      "If that text comes from a user, they may be able to make your app run unexpected commands.",
    suggestion:
      "Avoid eval. Use a specific, safe parser or a small set of allowed actions instead.",
    test: (line) => /\beval\s*\(/.test(line),
    fix: () => "  // Replace eval with a safe parser for the expected input.",
  },
  {
    id: "inner-html",
    title: "Text is placed on the page as raw HTML",
    severity: "high",
    category: "Security",
    explanation:
      "If the text contains a <script> tag or similar, the browser will run it. This is called cross-site scripting (XSS).",
    suggestion:
      "Use textContent when you only need to show text. It displays the value as-is and never runs it.",
    test: (line) => /\.innerHTML\s*=(?!=)/.test(line),
    fix: (line) => line.replace(/\.innerHTML\s*=/, ".textContent ="),
  },
  {
    id: "empty-catch",
    title: "An error is caught and silently ignored",
    severity: "medium",
    category: "Quality",
    explanation:
      "When something goes wrong, nothing tells you. The bug is still there, but it becomes much harder to find.",
    suggestion: "At minimum, log the error so you can see what failed.",
    test: (line) => /catch\s*(?:\(\s*\w*\s*\))?\s*\{\s*\}/.test(line),
    fix: (line) =>
      line.replace(
        /catch\s*(?:\(\s*(\w*)\s*\))?\s*\{\s*\}/,
        (_m, name?: string) => `catch (${name || "error"}) { console.error(${name || "error"}); }`,
      ),
  },
  {
    id: "loose-equality",
    title: "Values are compared with == instead of ===",
    severity: "low",
    category: "Quality",
    explanation:
      '== converts types before comparing, so 0 == "" is true. This leads to surprising bugs.',
    suggestion: "Use === (and !==) so values are only equal when type and value both match.",
    test: (line) => /[^=!<>]==(?!=)/.test(line) || /!=(?!=)/.test(line),
    fix: (line) => line.replace(/([^=!<>])==(?!=)/g, "$1===").replace(/!=(?!=)/g, "!=="),
  },
  {
    id: "var-keyword",
    title: "var is used to declare a variable",
    severity: "low",
    category: "Quality",
    explanation:
      "var is function-scoped and can be used before it is defined, which causes confusing bugs.",
    suggestion: "Use const for values that don’t change, and let for values that do.",
    test: (line) => /^\s*var\s+\w+/.test(line),
    fix: (line) => `${indentOf(line)}${line.trim().replace(/^var\b/, "let")}`,
  },
];

export function analyzeCode(source: string): CodeFinding[] {
  const findings: CodeFinding[] = [];

  source.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;

    for (const rule of rules) {
      if (!rule.test(line)) continue;
      findings.push({
        id: rule.id,
        key: `${rule.id}-${lineNumber}`,
        title: rule.title,
        severity: rule.severity,
        category: rule.category,
        line: lineNumber,
        explanation: rule.explanation,
        suggestion: rule.suggestion,
        replacement: rule.fix(line),
        source: "rules",
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
