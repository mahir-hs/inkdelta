// Connects the review panels (which only take props) to the stores.

import { useMemo } from "react";
import { excerptOfChange, findChangeByExcerpt } from "../../lib/diffUtils";
import { fileName } from "../../lib/format";
import { ChangesList } from "../sidebar/ChangesList";
import { WordComments } from "../sidebar/WordComments";
import { useReview } from "../../store/review";
import { useUi } from "../../store/ui";
import { useWorkspace } from "../../store/workspace";
import { ReviewerPanel } from "./ReviewerPanel";

export function ReviewerHost() {
  const { repo, file, diff, selectedChange } = useWorkspace();
  const { state, setReviewerFile, updateItem } = useReview();

  // Until the user picks one, suggest the file that looks like reviewer comments (not saved to disk).
  const guess = useMemo(
    () => repo?.docxFiles.find((f) => f !== file && /comment|review|referee/i.test(fileName(f))) ?? null,
    [repo, file],
  );
  const view = useMemo(() => ({ ...state, reviewerFile: state.reviewerFile ?? guess }), [state, guess]);

  const selectedExcerpt = useMemo(
    () => (diff && selectedChange ? excerptOfChange(diff, selectedChange) : null),
    [diff, selectedChange],
  );

  const jump = (excerpt: string) => {
    const change = diff ? findChangeByExcerpt(diff, excerpt) : null;
    if (change) useWorkspace.getState().jumpToChange(change);
    else useUi.getState().toast("info", "That change is not part of the current comparison.");
  };

  return (
    <ReviewerPanel
      repo={repo}
      currentFile={file}
      state={view}
      onReviewerFile={setReviewerFile}
      onUpdateItem={updateItem}
      selectedExcerpt={selectedExcerpt}
      onJumpToExcerpt={jump}
    />
  );
}

export function ChangesHost() {
  const { diff, selectedChange } = useWorkspace();
  if (!diff) return <div className="empty-panel"><p className="muted">Compare two versions to list the changes.</p></div>;
  return <div className="panel-scroll"><ChangesList diff={diff} selectedChange={selectedChange} onSelect={(c) => useWorkspace.getState().jumpToChange(c)} /></div>;
}

export function WordCommentsHost() {
  const diff = useWorkspace((s) => s.diff);
  if (!diff) return <div className="empty-panel"><p className="muted">Compare two versions to see Word comments.</p></div>;
  return <div className="panel-scroll"><WordComments comments={diff.comments} /></div>;
}
