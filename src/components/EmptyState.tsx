"use client";

import Image from "next/image";

export type EmptyArt = "lifting-dumbbell" | "holding-water" | "streaming" | "sleeping";

// Illustrated empty state: art, a short title, optional body and one primary action (never an apology).
// No art = compact text + action (lists inside a grouped section).
export function EmptyState({ art, title, body, action, compact }: {
  art?: EmptyArt; title: string; body?: string; action?: { label: string; onClick: () => void }; compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "compact" : ""} ${art ? "" : "empty--text"}`}>
      {art && (
        <div className="empty-art">
          <Image src={`/art/empty-${art}-${compact ? 400 : 800}.webp`} width={compact ? 96 : 200} height={compact ? 72 : 150} loading="lazy" alt="" unoptimized />
        </div>
      )}
      <div className="empty-text">
        <div className="empty-title">{title}</div>
        {body && <p className="empty-body">{body}</p>}
        {action && <button type="button" className="btn empty-btn" onClick={action.onClick}>{action.label}</button>}
      </div>
    </div>
  );
}
