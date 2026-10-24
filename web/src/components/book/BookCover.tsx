interface BookCoverProps {
  title: string;
  author: string;
}

/**
 * The hardcover front board — dark bookcloth, gold foil frame, centred
 * emblem, and the selected title and author, matching the MELO identity.
 */
export function BookCover({ title, author }: BookCoverProps) {
  return (
    <div className="ab-cover">
      <div className="ab-cover-frame" aria-hidden="true" />
      <div className="ab-cover-content">
        <span className="ab-cover-edition">MELO Audio Edition</span>
        <span className="ab-cover-emblem" aria-hidden="true">
          <span className="ab-cover-emblem-ring" />
          <span className="ab-cover-emblem-gem" />
        </span>
        <p className="ab-cover-title">{title}</p>
        <span className="ab-cover-divider" aria-hidden="true" />
        <p className="ab-cover-author">{author.toUpperCase()}</p>
      </div>
      <span className="ab-cover-foot">Private Inference · Temporal Horizon</span>
    </div>
  );
}
