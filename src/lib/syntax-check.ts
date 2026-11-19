import type { CodeFinding } from "./code-review";

/**
 * A small, dependency-free syntax pre-check. It looks for the mistakes that stop code from
 * running in almost every language: brackets that don't match and strings that never close.
 * It is deliberately conservative: when it isn't sure, it stays quiet and leaves the deeper
 * analysis to the LLM.
 */

const OPEN = { "(": ")", "[": "]", "{": "}" } as const;
const CLOSE = new Set([")", "]", "}"]);

const HASH_COMMENT = new Set(["python", "ruby", "php"]);
const SLASH_COMMENT = new Set(["javascript", "typescript", "java", "c", "c++", "c#", "go", "php"]);
const BACKTICK_STRING = new Set(["javascript", "typescript", "go"]);
const SUPPORTED = new Set([...HASH_COMMENT, ...SLASH_COMMENT]);

const MAX_FINDINGS = 3;

function make(
  id: string,
  line: number,
  title: string,
  explanation: string,
  suggestion: string,
): CodeFinding {
  return {
    id,
    key: `${id}-${line}`,
    title,
    severity: "critical",
    category: "Syntax",
    line,
    explanation,
    suggestion,
    replacement: "",
    source: "rules",
  };
}

export function checkSyntax(source: string, language: string): CodeFinding[] {
  const lang = language.trim().toLowerCase();
  if (!SUPPORTED.has(lang)) return [];

  const hashComments = HASH_COMMENT.has(lang);
  const slashComments = SLASH_COMMENT.has(lang);
  const backticks = BACKTICK_STRING.has(lang);
  const isPython = lang === "python";
  // JSX text can hold apostrophes ("don't"), which would look like an unclosed string.
  const mayHaveJsx =
    (lang === "javascript" || lang === "typescript") && /<\/?[A-Za-z][^>]*>/.test(source);

  const findings: CodeFinding[] = [];
  const stack: { ch: string; line: number }[] = [];
  const text = source.replace(/\r\n/g, "\n");

  let line = 1;
  let i = 0;
  let mode: "code" | "line-comment" | "block-comment" | "string" | "template" | "triple" = "code";
  let quote = "";
  let modeStartLine = 1;

  const add = (finding: CodeFinding) => {
    if (findings.length < MAX_FINDINGS && !findings.some((f) => f.key === finding.key)) {
      findings.push(finding);
    }
  };

  while (i < text.length) {
    const ch = text[i]!;
    const next = text[i + 1];

    if (ch === "\n") {
      if (mode === "string") {
        // A normal string can't run past the end of its line.
        if (!mayHaveJsx && lang !== "php") {
          add(
            make(
              "syntax-unclosed-string",
              modeStartLine,
              `A string starting with ${quote} is never closed`,
              "Every opening quote needs a matching closing quote on the same line. The program can't run until it is closed.",
              `Add the missing ${quote} where the text should end.`,
            ),
          );
        }
        mode = "code";
      } else if (mode === "line-comment") {
        mode = "code";
      }
      line++;
      i++;
      continue;
    }

    if (mode === "line-comment") {
      i++;
      continue;
    }

    if (mode === "block-comment") {
      if (ch === "*" && next === "/") {
        mode = "code";
        i += 2;
      } else i++;
      continue;
    }

    if (mode === "template") {
      if (ch === "\\") {
        if (next === "\n") line++;
        i += 2;
      } else {
        if (ch === "`") mode = "code";
        i++;
      }
      continue;
    }

    if (mode === "triple") {
      if (text.startsWith(quote.repeat(3), i)) {
        mode = "code";
        i += 3;
      } else i++;
      continue;
    }

    if (mode === "string") {
      if (ch === "\\") {
        if (next === "\n") line++;
        i += 2;
      } else {
        if (ch === quote) mode = "code";
        i++;
      }
      continue;
    }

    // mode === "code"
    if (slashComments && ch === "/" && next === "/") {
      mode = "line-comment";
      i += 2;
      continue;
    }
    if (slashComments && ch === "/" && next === "*") {
      mode = "block-comment";
      modeStartLine = line;
      i += 2;
      continue;
    }
    if (hashComments && ch === "#") {
      mode = "line-comment";
      i++;
      continue;
    }
    if (isPython && (ch === '"' || ch === "'") && text.startsWith(ch.repeat(3), i)) {
      mode = "triple";
      quote = ch;
      modeStartLine = line;
      i += 3;
      continue;
    }
    if (ch === '"' || ch === "'") {
      mode = "string";
      quote = ch;
      modeStartLine = line;
      i++;
      continue;
    }
    if (backticks && ch === "`") {
      mode = "template";
      modeStartLine = line;
      i++;
      continue;
    }

    if (ch in OPEN) {
      stack.push({ ch, line });
    } else if (CLOSE.has(ch)) {
      const top = stack.pop();
      if (!top) {
        add(
          make(
            "syntax-unexpected-closer",
            line,
            `Unexpected closing "${ch}"`,
            `This "${ch}" doesn't match any opening bracket before it, so the code can't be understood.`,
            `Remove this "${ch}", or add the missing opening bracket earlier in the code.`,
          ),
        );
      } else if (OPEN[top.ch as keyof typeof OPEN] !== ch) {
        const wanted = OPEN[top.ch as keyof typeof OPEN];
        add(
          make(
            "syntax-mismatched-bracket",
            line,
            `Found "${ch}" but expected "${wanted}"`,
            `The "${top.ch}" on line ${top.line} was never closed with "${wanted}", so this "${ch}" is in the wrong place.`,
            `Close the "${top.ch}" from line ${top.line} with "${wanted}" first.`,
          ),
        );
      }
    }
    i++;
  }

  if (mode === "block-comment") {
    add(
      make(
        "syntax-unclosed-comment",
        modeStartLine,
        "A comment is never closed",
        "This /* comment has no closing */, so everything after it is treated as a comment.",
        "Add */ where the comment should end.",
      ),
    );
  } else if (mode === "template" || mode === "triple") {
    add(
      make(
        "syntax-unclosed-string",
        modeStartLine,
        "A multi-line string is never closed",
        "This string opens but never closes, so the rest of the file becomes part of it.",
        "Add the matching closing quote where the string should end.",
      ),
    );
  } else if (mode === "string" && !mayHaveJsx && lang !== "php") {
    add(
      make(
        "syntax-unclosed-string",
        modeStartLine,
        `A string starting with ${quote} is never closed`,
        "Every opening quote needs a matching closing quote. The program can't run until it is closed.",
        `Add the missing ${quote} where the text should end.`,
      ),
    );
  }

  // Anything still open when the file ends was never closed.
  for (const open of stack.slice(-MAX_FINDINGS)) {
    const wanted = OPEN[open.ch as keyof typeof OPEN];
    add(
      make(
        "syntax-unclosed-bracket",
        open.line,
        `Missing closing "${wanted}"`,
        `The "${open.ch}" on this line is never closed. The code can't run until every opening bracket has a match.`,
        `Add a "${wanted}" where this block or group should end.`,
      ),
    );
  }

  return findings.sort((a, b) => a.line - b.line);
}
