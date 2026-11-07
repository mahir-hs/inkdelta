// The data we remember about the reviewer's comments, and how it is saved.
//
// Saved as JSON in <project>/.inkdelta/review.json (so it can be committed and shared).
// Without a project folder it falls back to the browser's localStorage.

export type ReviewStatus = "open" | "progress" | "done" | "skipped";

export interface ItemState {
  status: ReviewStatus;
  note: string;
  /** Short excerpts of the changes linked to this comment. */
  links: string[];
}

export interface ReviewState {
  version: 1;
  /** Repo-relative path (or absolute path outside a repo) of the document with the reviewer's comments. */
  reviewerFile: string | null;
  items: Record<string, ItemState>;
}

export const emptyReviewState = (): ReviewState => ({ version: 1, reviewerFile: null, items: {} });

export const emptyItem = (): ItemState => ({ status: "open", note: "", links: [] });

export function parseReviewState(json: string | null): ReviewState {
  if (!json) return emptyReviewState();
  try {
    const raw = JSON.parse(json);
    return {
      version: 1,
      reviewerFile: typeof raw.reviewerFile === "string" ? raw.reviewerFile : null,
      items: typeof raw.items === "object" && raw.items ? raw.items : {},
    };
  } catch {
    return emptyReviewState(); // damaged file: start fresh rather than crash
  }
}

/** A comment counts as "addressed" when it is done or deliberately skipped. */
export const isAddressed = (item: ItemState | undefined): boolean =>
  item?.status === "done" || item?.status === "skipped";
