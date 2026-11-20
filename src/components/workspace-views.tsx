import { Clock3, FileCode2, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fileInfoFor } from "@/lib/code-review";
import { relativeTime, type ReviewRecord, type WorkspaceFile } from "@/lib/workspace";

export function ProjectsView({ files, currentId, now, onOpen, onNew, onDelete }: {
  files: WorkspaceFile[];
  currentId: string;
  now: number;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="view-panel" aria-label="Projects">
      <div className="view-panel-head">
        <div>
          <h2>{files.length} {files.length === 1 ? "project" : "projects"}</h2>
          <p>Open a file to keep working on it. Changes are saved in this browser.</p>
        </div>
        <Button className="analyze-button" onClick={onNew}><Plus size={15} /> New project</Button>
      </div>
      <ul className="view-list">
        {files.map((file) => {
          const info = fileInfoFor(file.language);
          const lines = file.code ? file.code.split("\n").length : 0;
          return (
            <li key={file.id} className={`view-row ${file.id === currentId ? "view-row-current" : ""}`}>
              <button className="view-row-main" onClick={() => onOpen(file.id)} aria-label={`Open ${file.name}`}>
                <span className={`file-type-icon ${info.tone}`}>{info.badge}</span>
                <span className="view-row-copy">
                  <strong>{file.name}</strong>
                  <small>{file.language} · {lines} {lines === 1 ? "line" : "lines"} · edited {relativeTime(file.updatedAt, now)}</small>
                </span>
                {file.id === currentId && <span className="view-pill">Open now</span>}
              </button>
              <Button variant="ghost" size="icon" className="view-row-action" aria-label={`Delete ${file.name}`} disabled={files.length <= 1} title={files.length <= 1 ? "Keep at least one project" : "Delete project"} onClick={() => onDelete(file.id)}><Trash2 size={15} /></Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HistoryView({ history, now, onRestore, onClear }: {
  history: ReviewRecord[];
  now: number;
  onRestore: (record: ReviewRecord) => void;
  onClear: () => void;
}) {
  return (
    <section className="view-panel" aria-label="Review history">
      <div className="view-panel-head">
        <div>
          <h2>{history.length} {history.length === 1 ? "review" : "reviews"}</h2>
          <p>Every time you run a review it is saved here, newest first.</p>
        </div>
        {history.length > 0 && <Button variant="outline" className="ai-review-button" onClick={onClear}><Trash2 size={14} /> Clear history</Button>}
      </div>
      {history.length === 0 ? (
        <div className="empty-findings"><span><Clock3 size={24} /></span><strong>No reviews yet</strong><p>Run “Review my code” or “Review with AI” and it will show up here.</p></div>
      ) : (
        <ul className="view-list">
          {history.map((record) => {
            const info = fileInfoFor(record.language);
            return (
              <li key={record.id} className="view-row">
                <div className="view-row-main view-row-static">
                  <span className={`file-type-icon ${info.tone}`}>{info.badge}</span>
                  <span className="view-row-copy">
                    <strong>{record.fileName}</strong>
                    <small>{relativeTime(record.at, now)} · {record.findingCount} {record.findingCount === 1 ? "finding" : "findings"}{record.criticalCount > 0 ? ` (${record.criticalCount} critical)` : ""}</small>
                  </span>
                  <span className="ai-badge">{record.kind === "ai" ? <><Sparkles size={9} /> AI review</> : <><FileCode2 size={9} /> Quick check</>}</span>
                  <span className="view-score" title="Score out of 100">{record.score}<small>/100</small></span>
                </div>
                <Button variant="outline" size="sm" className="view-restore" onClick={() => onRestore(record)}><RotateCcw size={13} /> Restore</Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
