// Comments written inside Word (Review > New Comment) in the newer version.

import type { WordComment } from "../../api/types";
import { S } from "../../strings";

export function WordComments({ comments }: { comments: WordComment[] }) {
  if (comments.length === 0) return <p className="muted">{S.noWordComments}</p>;

  return (
    <ul className="word-comments">
      {comments.map((c) => (
        <li key={c.id}>
          <header>
            <strong>{c.author || "Unknown"}</strong>
            {c.date && <time>{new Date(c.date).toLocaleDateString()}</time>}
          </header>
          {c.anchorText && <blockquote>{c.anchorText}</blockquote>}
          <p>{c.text}</p>
        </li>
      ))}
    </ul>
  );
}
