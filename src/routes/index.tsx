import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Code2,
  FileCode2,
  FileText,
  FlaskConical,
  Github,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  Menu,
  PanelLeftClose,
  Play,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";

import { HistoryView, ProjectsView } from "@/components/workspace-views";
import { Button } from "@/components/ui/button";
import { AI_MAX_CHARS, applyLineFix } from "@/lib/ai-review";
import { reviewWithAi } from "@/lib/ai-review.functions";
import { analyzeCode, fileInfoFor, scoreCode, supportsBuiltInRules, type CodeFinding } from "@/lib/code-review";
import {
  LANGUAGES,
  addReviewRecord,
  createFile,
  createSampleFiles,
  loadWorkspace,
  makeReviewRecord,
  newId,
  relativeTime,
  renameForLanguage,
  saveWorkspace,
  type ReviewRecord,
  type WorkspaceFile,
} from "@/lib/workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ReviewLab — Student Code Review" },
      {
        name: "description",
        content: "A friendly workspace for understanding code quality and common security mistakes.",
      },
      { property: "og:title", content: "ReviewLab — Student Code Review" },
      {
        property: "og:description",
        content: "Explore clear, beginner-friendly explanations of code issues and fixes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: ReviewWorkspace,
});

function ReviewWorkspace() {
  const [files, setFiles] = useState<WorkspaceFile[]>(() => createSampleFiles(Date.now()));
  const [currentId, setCurrentId] = useState("sample-auth");
  const [history, setHistory] = useState<ReviewRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [filter, setFilter] = useState("All findings");
  const [copied, setCopied] = useState(false);
  const [justReviewed, setJustReviewed] = useState(false);
  const [activeNav, setActiveNav] = useState("Code review");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const current = files.find((item) => item.id === currentId) ?? files[0]!;
  const source = current.code;
  const language = current.language;
  const [aiFindings, setAiFindings] = useState<CodeFinding[]>([]);
  const [aiSnapshot, setAiSnapshot] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [aiError, setAiError] = useState("");

  // Load saved work after the first render so server and browser markup match.
  useEffect(() => {
    const saved = loadWorkspace();
    if (saved) {
      setFiles(saved.files);
      setCurrentId(saved.currentId);
      setHistory(saved.history);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveWorkspace({ files, currentId: current.id, history });
  }, [hydrated, files, current.id, history]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function setSource(code: string) {
    setFiles((list) => list.map((item) => (item.id === current.id ? { ...item, code, updatedAt: Date.now() } : item)));
  }

  function resetReviewState() {
    setSelectedFinding(null);
    setFilter("All findings");
    setJustReviewed(false);
    setAiFindings([]);
    setAiSnapshot(null);
    setAiStatus("idle");
    setAiError("");
  }

  function goTo(view: string) {
    setActiveNav(view);
    setMobileNavOpen(false);
  }

  function openFile(id: string) {
    if (id !== current.id) resetReviewState();
    setCurrentId(id);
    goTo("Code review");
  }

  function startNewReview() {
    const created = createFile(files, "JavaScript");
    setFiles((list) => [created, ...list]);
    resetReviewState();
    setCurrentId(created.id);
    goTo("Code review");
    window.setTimeout(() => editorRef.current?.focus(), 0);
  }

  function deleteFile(id: string) {
    if (files.length <= 1) return;
    const target = files.find((item) => item.id === id);
    if (!target || !window.confirm(`Delete ${target.name}? This can’t be undone.`)) return;
    const remaining = files.filter((item) => item.id !== id);
    setFiles(remaining);
    if (id === current.id) {
      resetReviewState();
      setCurrentId(remaining[0]!.id);
    }
  }

  function changeLanguage(next: string) {
    if (next === current.language) return;
    setFiles((list) => list.map((item) => (item.id === current.id ? { ...item, language: next, name: renameForLanguage(item.name, next) } : item)));
    resetReviewState();
  }

  function restoreReview(record: ReviewRecord) {
    const exists = files.some((item) => item.id === record.fileId);
    resetReviewState();
    if (exists) {
      setFiles((list) => list.map((item) => (item.id === record.fileId ? { ...item, code: record.code, language: record.language, updatedAt: Date.now() } : item)));
      setCurrentId(record.fileId);
    } else {
      const restored: WorkspaceFile = { id: newId("file"), name: record.fileName, language: record.language, code: record.code, updatedAt: Date.now() };
      setFiles((list) => [restored, ...list]);
      setCurrentId(restored.id);
    }
    goTo("Code review");
  }

  function runQuickReview() {
    setJustReviewed(true);
    setFilter("All findings");
    setHistory((list) => addReviewRecord(list, makeReviewRecord(current, findings, "quick")));
  }
  const lastReview = history.find((record) => record.fileId === current.id);
  const rulesSupported = supportsBuiltInRules(language);
  const file = fileInfoFor(language);
  const ruleFindings = useMemo(() => (rulesSupported ? analyzeCode(source) : []), [source, rulesSupported]);
  const isEmpty = source.trim().length === 0;
  const awaitingAi = isEmpty || (!rulesSupported && aiStatus !== "done");
  // AI line numbers only match the exact text that was reviewed.
  const aiStale = aiSnapshot !== null && aiSnapshot !== source;
  const findings = useMemo(
    () => [...ruleFindings, ...aiFindings].sort((a, b) => a.line - b.line),
    [ruleFindings, aiFindings],
  );
  const score = scoreCode(findings);
  const visibleFindings = findings.filter((finding) => {
    if (filter === "Critical") return finding.severity === "critical";
    if (filter === "Security") return finding.category === "Security";
    if (filter === "Quality") return finding.category === "Quality";
    return true;
  });
  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const highCount = findings.filter((finding) => finding.severity === "high").length;

  async function runAiReview() {
    setAiStatus("loading");
    setAiError("");
    setSelectedFinding(null);
    const reviewed = source;
    try {
      const result = await reviewWithAi({ data: { source: reviewed, language } });
      if (!result.ok) {
        setAiStatus("error");
        setAiError(result.error);
        return;
      }
      setAiFindings(result.findings);
      setHistory((list) => addReviewRecord(list, makeReviewRecord({ ...current, code: reviewed }, [...ruleFindings, ...result.findings], "ai")));
      setAiSnapshot(reviewed);
      setAiStatus("done");
      setJustReviewed(true);
      setFilter("All findings");
    } catch {
      setAiStatus("error");
      setAiError("Couldn’t reach the AI review service. Check your connection and try again.");
    }
  }

  function applyAiFix(finding: CodeFinding) {
    const result = applyLineFix(source, finding.line, finding.replacement);
    if (!result) return;
    setSource(result.source);
    // Keep the remaining AI findings pointing at the right lines after this edit.
    setAiFindings((current) =>
      current
        .filter((item) => item.key !== finding.key)
        .map((item) => (item.line > finding.line ? { ...item, line: item.line + result.delta } : item)),
    );
    setAiSnapshot(result.source);
    setSelectedFinding(null);
  }

  function applyFix(finding: CodeFinding) {
    if (finding.source === "ai") {
      applyAiFix(finding);
      return;
    }
    const rows = source.split("\n");
    if (finding.id === "hardcoded-secret" && rows[finding.line - 1] !== undefined) {
      rows[finding.line - 1] = finding.replacement;
    } else if (finding.id === "sql-interpolation" && rows[finding.line - 1] !== undefined) {
      rows[finding.line - 1] = finding.replacement;
      const queryCall = rows.findIndex((row) => /db\.query\(query\)/.test(row));
      if (queryCall !== -1) rows[queryCall] = "  return db.query(query, [userId]);";
    } else if (rows[finding.line - 1] !== undefined) {
      rows[finding.line - 1] = finding.replacement;
    }
    setSource(rows.join("\n"));
    setSelectedFinding(null);
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function selectFinding(finding: CodeFinding) {
    setSelectedFinding(selectedFinding === finding.key ? null : finding.key);
    const editor = editorRef.current;
    if (!editor) return;
    const position = source
      .split("\n")
      .slice(0, finding.line - 1)
      .reduce((offset, row) => offset + row.length + 1, 0);
    editor.focus();
    editor.setSelectionRange(position, position);
  }

  return (
    <div className="review-app">
      <aside className={`workspace-sidebar ${mobileNavOpen ? "workspace-sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <span className="brand-mark"><Code2 size={21} strokeWidth={2.3} /></span>
          <span className="brand-word">Review<span>Lab</span></span>
          <Button aria-label="Close navigation" variant="ghost" size="icon" className="sidebar-close md:hidden" onClick={() => setMobileNavOpen(false)}><PanelLeftClose size={17} /></Button>
        </div>

        <Button className="new-review-button" onClick={startNewReview}>
          <Plus size={17} /> New review
        </Button>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          <button className={`sidebar-link ${activeNav === "Code review" ? "sidebar-link-active" : ""}`} onClick={() => goTo("Code review")}><Search size={17} /> Code review</button>
          <button className={`sidebar-link ${activeNav === "Projects" ? "sidebar-link-active" : ""}`} onClick={() => goTo("Projects")}><FileCode2 size={17} /> Projects <span className="sidebar-link-count">{files.length}</span></button>
          <button className={`sidebar-link ${activeNav === "Review history" ? "sidebar-link-active" : ""}`} onClick={() => goTo("Review history")}><Clock3 size={17} /> Review history</button>
        </nav>

        <div className="sidebar-section-label recent-label">RECENT FILES <button aria-label="Show all files" onClick={() => goTo("Projects")}><ArrowRight size={14} /></button></div>
        <div className="recent-file-list">
          {[...files].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3).map((item) => {
            const info = fileInfoFor(item.language);
            const isCurrent = item.id === current.id && activeNav === "Code review";
            return (
              <button key={item.id} className={`recent-file ${isCurrent ? "recent-file-current" : ""}`} onClick={() => openFile(item.id)}>
                <span className={`file-type-icon ${info.tone}`}>{info.badge}</span>
                <span><strong>{item.name}</strong><small>{relativeTime(item.updatedAt, now)}</small></span>
                {item.id === current.id && findings.length > 0 && <span className="file-status status-warn" />}
              </button>
            );
          })}
        </div>

        <div className="sidebar-bottom">
          <div className="weekly-card">
            <div className="weekly-icon"><Activity size={16} /></div>
            <div><strong>You're on a roll</strong><p>4 reviews this week</p></div>
            <span className="weekly-spark">↗</span>
          </div>
          <button className="profile-button" onClick={() => goTo("My profile")}>
            <span className="avatar-initials">AS</span>
            <span className="profile-copy"><strong>Alex Student</strong><small>Computer science</small></span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

      <main className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb"><Button className="mobile-menu-button md:hidden" variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></Button><span>My workspace</span><span className="breadcrumb-slash">/</span><strong>{activeNav}</strong></div>
          <div className="topbar-right"><span className="saved-indicator"><span /> All changes saved</span><Button variant="outline" className="share-button" onClick={copySource}>{copied ? <Check size={15} /> : <Github size={15} />}{copied ? "Copied" : "Share code"}</Button></div>
        </header>

        <div className="workspace-content">
          <section className="page-heading">
            <div className="heading-copy">
              <div className="eyebrow"><span className="eyebrow-pip" /> YOUR LEARNING WORKSPACE</div>
              <h1>{activeNav === "Code review" ? "Let’s make this code better." : activeNav === "Projects" ? "Your projects" : activeNav}</h1>
              <p>A safe place to learn what your code is doing — and how to improve it.</p>
            </div>
            <div className="heading-side"><span className="last-review"><Clock3 size={14} /> {lastReview ? `Last reviewed ${relativeTime(lastReview.at, now)}` : "Not reviewed yet"}</span></div>
          </section>

          {activeNav === "Projects" ? (
            <ProjectsView files={files} currentId={current.id} now={now} onOpen={openFile} onNew={startNewReview} onDelete={deleteFile} />
          ) : activeNav === "Review history" ? (
            <HistoryView history={history} now={now} onRestore={restoreReview} onClear={() => { if (window.confirm("Clear all saved reviews?")) setHistory([]); }} />
          ) : (
            <>
          <section className="review-toolbar" aria-label="Current code file">
            <div className="file-tab"><span className={`file-type-icon ${file.tone}`}>{file.badge}</span><strong>{current.name}</strong><span className="unsaved-dot" title="Saved in this browser" /></div>
            <div className="toolbar-controls">
              <label className="language-select"><span className="sr-only">Code language</span><select value={language} onChange={(event) => changeLanguage(event.target.value)}>{LANGUAGES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>
              <span className="toolbar-divider" />
              <Button variant="ghost" size="sm" className="toolbar-copy" onClick={copySource}>{copied ? <Check size={14} /> : <ArrowDownToLine size={14} />}{copied ? "Copied" : "Copy"}</Button>
            </div>
          </section>

          <div className="review-grid">
            <section className="editor-panel" aria-label="Code editor">
              <div className="editor-header">
                <div className="editor-title"><Terminal size={16} /><strong>Source code</strong><span className="editor-file-chip">{current.name}</span></div>
                <span className="editor-readonly"><LockKeyhole size={12} /> Local until AI review</span>
              </div>
              <div className="editor-body">
                <div className="line-number-rail" aria-hidden="true">{source.split("\n").map((_, index) => {
                  const highlighted = findings.some((finding) => finding.line === index + 1);
                  return <span key={index} className={highlighted ? "line-number line-number-flagged" : "line-number"}>{String(index + 1).padStart(2, "0")}{highlighted && <i />}</span>;
                })}</div>
                <textarea
                  ref={editorRef}
                  aria-label="Source code"
                  spellCheck={false}
          placeholder="Paste or type your code here…"
                  value={source}
                  onChange={(event) => { setSource(event.target.value); setJustReviewed(false); }}
                  className="code-textarea"
                  rows={Math.max(source.split("\n").length, 9)}
                />
              </div>
              <div className="editor-footer"><span><span className="footer-live-dot" /> {source.split("\n").length} lines</span><span>{language} · UTF-8</span></div>
              <div className="analyze-footer">
                <div className="analyze-note"><Sparkles size={15} /><span>Quick checks run in your browser. AI review sends this code to an AI service.</span></div>
                <div className="analyze-actions">
                  <Button variant="outline" className="ai-review-button" disabled={aiStatus === "loading" || source.trim().length === 0 || source.length > AI_MAX_CHARS} onClick={runAiReview}>{aiStatus === "loading" ? <LoaderCircle size={15} className="ai-spinner" /> : <Sparkles size={15} />}{aiStatus === "loading" ? "Reviewing…" : "Review with AI"}</Button>
                  <Button className="analyze-button" disabled={!rulesSupported || isEmpty} title={rulesSupported ? undefined : "Built-in checks cover JavaScript and TypeScript. Use Review with AI."} onClick={runQuickReview}><Play size={15} fill="currentColor" /> Review my code <span className="button-arrow">→</span></Button>
                </div>
              </div>
            </section>

            <section className="findings-panel" aria-label="Code review findings">
              <div className="findings-heading">
                <div><div className="findings-title-row"><span className="findings-icon"><ShieldCheck size={17} /></span><h2>Review findings</h2><span className="finding-count">{findings.length}</span></div><p>{aiStatus === "loading" ? "The AI mentor is reading your code…" : justReviewed ? "Review complete — here’s what I found." : "A few things to look at together."}</p></div>
                <Button className="findings-more" size="icon" variant="ghost" aria-label="More review options"><Plus size={18} /></Button>
              </div>

              {awaitingAi && <div className="ai-banner" role="status"><Sparkles size={14} /><span>{isEmpty ? "Paste or type some code in the editor to get started." : <>The built-in checks only cover JavaScript and TypeScript. Click <strong>Review with AI</strong> to review this {language} code.</>}</span></div>}
              {aiStatus === "error" && <div className="ai-banner ai-banner-error" role="alert"><CircleAlert size={14} /><span>{aiError}</span></div>}
              {aiStatus === "done" && aiStale && <div className="ai-banner" role="status"><Sparkles size={14} /><span>You changed the code after the AI review. Run it again before applying AI fixes.</span></div>}
              {aiStatus === "done" && !aiStale && <div className="ai-banner" role="status"><Sparkles size={14} /><span>{aiFindings.length === 0 ? "The AI mentor found nothing else to flag." : `The AI mentor added ${aiFindings.length} finding${aiFindings.length === 1 ? "" : "s"}.`}</span></div>}

              <div className="score-panel">
                <div className="score-ring" style={{ "--score-progress": `${score}%` } as React.CSSProperties}><div><strong>{score}</strong><span>/100</span></div></div>
                <div className="score-copy"><strong>{isEmpty ? "Nothing to review yet" : awaitingAi ? "Not reviewed yet" : findings.length === 0 ? "Looking good!" : score < 60 ? "Let’s work on this" : "Good start"}</strong><span>{isEmpty ? "Add some code to see a score." : awaitingAi ? "Run the AI review to get a score." : findings.length === 0 ? "No common issues found." : "A few small fixes can make this safer."}</span><div className="score-breakdown"><span className="severity-dot dot-critical" />{criticalCount} critical<span className="breakdown-divider" /><span className="severity-dot dot-high" />{highCount} high</div></div>
              </div>

              <div className="findings-filter-bar" role="group" aria-label="Filter review findings">
                {["All findings", "Critical", "Security", "Quality"].map((item) => <button key={item} onClick={() => setFilter(item)} className={`filter-chip ${filter === item ? "filter-chip-active" : ""}`}>{item}<span>{item === "All findings" ? findings.length : item === "Critical" ? criticalCount : findings.filter((finding) => finding.category === item).length}</span></button>)}
              </div>

              <div className="finding-list">
                {visibleFindings.map((finding) => <FindingCard key={finding.key} finding={finding} selected={selectedFinding === finding.key} onSelect={() => selectFinding(finding)} onFix={() => applyFix(finding)} fileName={current.name} fixDisabled={finding.source === "ai" && aiStale} />)}
                {visibleFindings.length === 0 && !awaitingAi && <div className="empty-findings"><span><ShieldCheck size={24} /></span><strong>No issues in this filter</strong><p>Try another filter or update your code.</p></div>}
                {findings.length === 0 && !awaitingAi && <div className="empty-findings all-clear"><span><ShieldCheck size={24} /></span><strong>Nothing to flag here</strong><p>No common issues matched this code. Keep practicing!</p></div>}
              </div>

              <div className="learning-note"><div className="learning-icon"><Lightbulb size={16} /></div><div><strong>Learn as you go</strong><p>Every finding includes a plain-language explanation and a suggested fix.</p><button onClick={() => setActiveNav("Learning resources")}>Explore learning resources <ArrowRight size={13} /></button></div></div>
            </section>
          </div>

            </>
          )}

          <footer className="workspace-footer"><span><Shield size={13} /> Your code is saved only in this browser; AI review shares it with an AI service.</span><span>Built for learning, not just linting.</span><button onClick={() => setActiveNav("Documentation")}><BookOpen size={13} /> Help center</button></footer>
        </div>
      </main>
    </div>
  );
}

function FindingCard({ finding, selected, onSelect, onFix, fileName, fixDisabled = false }: {
  finding: CodeFinding;
  selected: boolean;
  onSelect: () => void;
  onFix: () => void;
  fileName: string;
  fixDisabled?: boolean;
}) {
  const severityLabel: Record<CodeFinding["severity"], string> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  };

  return (
    <article className={`finding-card ${selected ? "finding-card-selected" : ""}`}>
      <button className="finding-card-toggle" onClick={onSelect} aria-expanded={selected}>
        <span className={`severity-icon severity-icon-${finding.severity}`}>{finding.severity === "critical" ? <CircleAlert size={15} /> : <Shield size={14} />}</span>
        <span className="finding-card-content"><span className="finding-meta"><span className={`severity-pill severity-${finding.severity}`}>{severityLabel[finding.severity]}</span><span>{finding.category}</span>{finding.source === "ai" && <span className="ai-badge"><Sparkles size={9} /> AI</span>}</span><strong>{finding.title}</strong><span className="finding-location"><FileText size={12} /> {fileName} <b>·</b> line {finding.line}</span></span>
        <ChevronDown size={16} className={`finding-chevron ${selected ? "finding-chevron-open" : ""}`} />
      </button>
      {selected && <div className="finding-detail"><p>{finding.explanation}</p><div className="suggestion-block"><span><Lightbulb size={13} /> A safer approach</span><p>{finding.suggestion}</p>{finding.replacement ? <><code>{finding.replacement}</code><Button className="apply-fix-button" size="sm" onClick={onFix} disabled={fixDisabled}><Check size={13} /> {fixDisabled ? "Re-run AI review to apply" : "Apply this fix"}</Button></> : <small className="no-auto-fix">This one needs a change in more than one place, so fix it by hand.</small>}</div></div>}
    </article>
  );
}
