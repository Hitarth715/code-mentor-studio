import { scoreCode, type CodeFinding } from "@/lib/code-review";

export interface WorkspaceFile {
  id: string;
  name: string;
  language: string;
  code: string;
  updatedAt: number;
}

export interface ReviewRecord {
  id: string;
  fileId: string;
  fileName: string;
  language: string;
  kind: "quick" | "ai";
  score: number;
  findingCount: number;
  criticalCount: number;
  at: number;
  /** The exact code that was reviewed, so it can be restored later. */
  code: string;
}

export interface WorkspaceState {
  files: WorkspaceFile[];
  currentId: string;
  history: ReviewRecord[];
}

const STORAGE_KEY = "reviewlab:workspace:v1";
const MAX_HISTORY = 30;

export const LANGUAGES = ["JavaScript", "TypeScript", "Python", "Java", "C++"] as const;

const EXTENSIONS: Record<string, string> = {
  JavaScript: "js",
  TypeScript: "ts",
  Python: "py",
  Java: "java",
  "C++": "cpp",
};

export const STARTER_CODE = `function getUser(userId) {
  const username = "alex";
  const password = "welcome123";
  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;
  return db.query(query);
}`;

const PARSER_CODE = `def parse_scores(path):
    f = open(path)
    scores = []
    for line in f:
        try:
            scores.append(int(line))
        except:
            pass
    return sum(scores) / len(scores)`;

const ROUTES_CODE = `const apiKey = "sk_live_51HxExample";

export function runUserFilter(input: string) {
  return eval(input);
}

export function showName(el: HTMLElement, name: string) {
  el.innerHTML = name;
  if (name == "admin") {
    var isAdmin = true;
  }
}`;

export function extensionFor(language: string): string {
  return EXTENSIONS[language] ?? "txt";
}

/** Swap a file name's extension to match a language, keeping the base name. */
export function renameForLanguage(name: string, language: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "untitled";
  return `${base}.${extensionFor(language)}`;
}

export function createSampleFiles(now: number): WorkspaceFile[] {
  const hour = 3_600_000;
  return [
    { id: "sample-auth", name: "user-auth.js", language: "JavaScript", code: STARTER_CODE, updatedAt: now },
    { id: "sample-parser", name: "data_parser.py", language: "Python", code: PARSER_CODE, updatedAt: now - 2 * hour },
    { id: "sample-routes", name: "api_routes.ts", language: "TypeScript", code: ROUTES_CODE, updatedAt: now - 26 * hour },
  ];
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** "untitled-1.js", "untitled-2.js", ... first one not already taken. */
export function nextUntitledName(files: Pick<WorkspaceFile, "name">[], language: string): string {
  const taken = new Set(files.map((file) => file.name));
  for (let n = 1; ; n++) {
    const name = `untitled-${n}.${extensionFor(language)}`;
    if (!taken.has(name)) return name;
  }
}

export function createFile(
  files: WorkspaceFile[],
  language: string,
  code = "",
  now = Date.now(),
): WorkspaceFile {
  return { id: newId("file"), name: nextUntitledName(files, language), language, code, updatedAt: now };
}

export function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(Math.floor((now - timestamp) / 1000), 0);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function makeReviewRecord(
  file: WorkspaceFile,
  findings: CodeFinding[],
  kind: ReviewRecord["kind"],
  now = Date.now(),
): ReviewRecord {
  return {
    id: newId("review"),
    fileId: file.id,
    fileName: file.name,
    language: file.language,
    kind,
    score: scoreCode(findings),
    findingCount: findings.length,
    criticalCount: findings.filter((finding) => finding.severity === "critical").length,
    at: now,
    code: file.code,
  };
}

export function addReviewRecord(history: ReviewRecord[], record: ReviewRecord): ReviewRecord[] {
  return [record, ...history].slice(0, MAX_HISTORY);
}

function isFile(value: unknown): value is WorkspaceFile {
  const v = value as WorkspaceFile;
  return (
    !!v &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.language === "string" &&
    typeof v.code === "string" &&
    typeof v.updatedAt === "number"
  );
}

function isRecord(value: unknown): value is ReviewRecord {
  const v = value as ReviewRecord;
  return (
    !!v &&
    typeof v.id === "string" &&
    typeof v.fileName === "string" &&
    typeof v.code === "string" &&
    typeof v.score === "number" &&
    typeof v.at === "number"
  );
}

/** Returns null when nothing usable is stored. Never throws. */
export function loadWorkspace(): WorkspaceState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<WorkspaceState>;
    const files = Array.isArray(data.files) ? data.files.filter(isFile) : [];
    if (files.length === 0) return null;
    const history = Array.isArray(data.history) ? data.history.filter(isRecord) : [];
    const currentId = files.some((file) => file.id === data.currentId) ? (data.currentId as string) : files[0]!.id;
    return { files, currentId, history };
  } catch {
    return null;
  }
}

/** Returns false if the browser refused to store it (private mode, quota). */
export function saveWorkspace(state: WorkspaceState): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
