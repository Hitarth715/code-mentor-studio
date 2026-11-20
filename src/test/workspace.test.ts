import { beforeEach, describe, expect, it } from "vitest";

import { analyzeCode } from "@/lib/code-review";
import {
  addReviewRecord,
  createFile,
  createSampleFiles,
  loadWorkspace,
  makeReviewRecord,
  nextUntitledName,
  relativeTime,
  renameForLanguage,
  saveWorkspace,
} from "@/lib/workspace";

describe("file naming", () => {
  it("swaps the extension when the language changes", () => {
    expect(renameForLanguage("user-auth.js", "Python")).toBe("user-auth.py");
    expect(renameForLanguage("notes", "TypeScript")).toBe("notes.ts");
  });

  it("picks the first free untitled name", () => {
    const files = [{ name: "untitled-1.js" }, { name: "untitled-2.js" }];
    expect(nextUntitledName(files, "JavaScript")).toBe("untitled-3.js");
    expect(nextUntitledName(files, "Python")).toBe("untitled-1.py");
  });

  it("creates empty files with unique ids", () => {
    const a = createFile([], "JavaScript");
    const b = createFile([a], "JavaScript");
    expect(a.id).not.toBe(b.id);
    expect(a.code).toBe("");
    expect(b.name).toBe("untitled-2.js");
  });
});

describe("relativeTime", () => {
  const now = 1_000_000_000_000;
  it("buckets times the way people say them", () => {
    expect(relativeTime(now - 5_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(relativeTime(now - 3_600_000, now)).toBe("1 hour ago");
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe("2 hours ago");
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe("yesterday");
    expect(relativeTime(now - 72 * 3_600_000, now)).toBe("3 days ago");
  });
});

describe("sample files", () => {
  it("gives the JS and TS samples real findings to look at", () => {
    const [auth, , routes] = createSampleFiles(Date.now());
    expect(analyzeCode(auth!.code).length).toBeGreaterThan(0);
    expect(analyzeCode(routes!.code).length).toBeGreaterThan(2);
  });
});

describe("review history", () => {
  it("records the score and keeps only the latest 30", () => {
    const [file] = createSampleFiles(Date.now());
    const record = makeReviewRecord(file!, analyzeCode(file!.code), "quick");
    expect(record).toMatchObject({ fileName: "user-auth.js", kind: "quick", code: file!.code });
    expect(record.score).toBeLessThan(100);

    let history = [] as ReturnType<typeof addReviewRecord>;
    for (let i = 0; i < 35; i++) history = addReviewRecord(history, { ...record, id: `r${i}` });
    expect(history).toHaveLength(30);
    expect(history[0]!.id).toBe("r34");
  });
});

describe("persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips the workspace", () => {
    const files = createSampleFiles(Date.now());
    expect(saveWorkspace({ files, currentId: "sample-parser", history: [] })).toBe(true);
    const loaded = loadWorkspace();
    expect(loaded?.currentId).toBe("sample-parser");
    expect(loaded?.files).toHaveLength(3);
  });

  it("falls back safely on missing, corrupt or empty data", () => {
    expect(loadWorkspace()).toBeNull();
    window.localStorage.setItem("reviewlab:workspace:v1", "{not json");
    expect(loadWorkspace()).toBeNull();
    window.localStorage.setItem("reviewlab:workspace:v1", JSON.stringify({ files: [] }));
    expect(loadWorkspace()).toBeNull();
  });

  it("repairs a current id that points at a deleted file", () => {
    const files = createSampleFiles(Date.now());
    saveWorkspace({ files, currentId: "gone", history: [] });
    expect(loadWorkspace()?.currentId).toBe("sample-auth");
  });
});
