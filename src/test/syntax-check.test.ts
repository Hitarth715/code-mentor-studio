import { describe, expect, it } from "vitest";

import { diffLines } from "@/lib/diff";
import { checkSyntax } from "@/lib/syntax-check";

describe("checkSyntax", () => {
  it("accepts valid code", () => {
    expect(checkSyntax('function f(a) {\n  return [a, "x"];\n}', "JavaScript")).toEqual([]);
  });

  it("finds a missing closing brace and points at the opener", () => {
    const [finding] = checkSyntax("function f() {\n  return 1;\n", "JavaScript");
    expect(finding).toMatchObject({ id: "syntax-unclosed-bracket", line: 1, category: "Syntax" });
  });

  it("finds an unexpected closing bracket", () => {
    const [finding] = checkSyntax("const a = 1;\n}\n", "TypeScript");
    expect(finding).toMatchObject({ id: "syntax-unexpected-closer", line: 2 });
  });

  it("finds mismatched brackets", () => {
    const [finding] = checkSyntax("const a = (1 + 2];", "JavaScript");
    expect(finding).toMatchObject({ id: "syntax-mismatched-bracket", line: 1 });
  });

  it("finds a string that is never closed", () => {
    const [finding] = checkSyntax('print("hello)\nx = 1\n', "Python");
    expect(finding).toMatchObject({ id: "syntax-unclosed-string", line: 1 });
  });

  it("ignores brackets and quotes inside strings and comments", () => {
    const code = '// don\'t worry (\nconst s = "(";\n/* { */\nconst t = `${1}\n(`;';
    expect(checkSyntax(code, "JavaScript")).toEqual([]);
  });

  it("handles Python comments and docstrings", () => {
    const code = '# it\'s fine (\ndef f():\n    """Doesn\'t (break)"""\n    return 1\n';
    expect(checkSyntax(code, "Python")).toEqual([]);
  });

  it("stays quiet for apostrophes in JSX text", () => {
    expect(checkSyntax("const a = <p>don't stop</p>;", "TypeScript")).toEqual([]);
  });

  it("skips languages it does not know", () => {
    expect(checkSyntax("fn main( {", "Rust")).toEqual([]);
    expect(checkSyntax("((", "Auto-detect")).toEqual([]);
  });

  it("keeps line numbers right across escaped line breaks", () => {
    const [finding] = checkSyntax('const a = "x \\\ny";\nfoo(\n', "JavaScript");
    expect(finding).toMatchObject({ id: "syntax-unclosed-bracket", line: 3 });
  });
});

describe("diffLines", () => {
  it("marks added, removed and unchanged lines", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
  });

  it("reports no changes for identical code", () => {
    expect(diffLines("x\ny", "x\ny").every((line) => line.type === "same")).toBe(true);
  });
});
