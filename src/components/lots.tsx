import { useState } from "react";
import { Link } from "react-router";
import { api, call, imageUrl, type LotCard } from "../lib/api";
import { bidsText, formatMoney, formatRemaining, isEndingSoon } from "../lib/format";
import { useNow } from "../lib/hooks";
import { useSite } from "../site";
import { HeartIcon, PhotoIcon } from "./ui";

/** A lot in a grid: photo, category, the caller's position, title, price and time left. */
export function LotCardView({ lot, onWatchChange }: { lot: LotCard; onWatchChange?: (watching: boolean) => void }) {
  const { house } = useSite();
  const now = useNow(lot.status === "Open" && isEndingSoon(lot.endsAt) ? 1000 : 30_000);
  const price = lot.currentPrice ?? lot.startingPrice;
  return (
    <li className="lot-card" data-testid={`lot-${lot.id}`}>
      <Link to={`/lots/${lot.id}`} className="lot-card-photo" tabIndex={-1} aria-hidden="true">
        {lot.coverImageId ? <img src={imageUrl(lot.id, lot.coverImageId)} alt="" loading="lazy" /> : <PhotoPlaceholder />}
      </Link>
      <WatchButton lotId={lot.id} title={lot.title} watching={lot.watching} onChange={onWatchChange} />
      <div className="lot-card-meta">
        <span>Lot {lot.number}</span>
        {lot.categoryName && <span>· {lot.categoryName}</span>}
        <PositionBadge status={lot.yourStatus} />
      </div>
      <Link to={`/lots/${lot.id}`} className="lot-card-title">
        {lot.title}
      </Link>
      <div className="lot-card-numbers">
        <div>
          <div className="small muted">{lot.currentPrice == null ? "Starting price" : "Current bid"}</div>
          <div className="price">{formatMoney(price, house.currency)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="small muted">{bidsText(lot.bidCount)}</div>
          <Timing lot={lot} now={now} />
        </div>
      </div>
      {lot.reserve === "NotMet" && lot.status !== "Ended" && <div className="small muted">Reserve not met</div>}
    </li>
  );
}

/** "Ends in 2 h 14 min", "Opens 22 Oct, 18:00", "Sold", … */
export function Timing({ lot, now }: { lot: Pick<LotCard, "status" | "startsAt" | "endsAt" | "outcome">; now: number }) {
  if (lot.status === "Upcoming") return <div className="small">Opens {new Date(lot.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>;
  if (lot.status === "Withdrawn") return <div className="small muted">Withdrawn</div>;
  if (lot.status === "Ended") return <div className="small">{outcomeText(lot.outcome)}</div>;
  return <div className={`small num${isEndingSoon(lot.endsAt, now) ? " urgent" : ""}`}>Ends in {formatRemaining(lot.endsAt, now)}</div>;
}

export function outcomeText(outcome: string | null | undefined): string {
  return outcome === "Sold" ? "Sold" : outcome === "ReserveNotMet" ? "Not sold: reserve not met" : outcome === "NotSold" ? "Not sold" : "Ended";
}

export function PositionBadge({ status }: { status: string | null | undefined }) {
  if (status === "Leading") return <span className="badge badge-good">✓ You are leading</span>;
  if (status === "Outbid") return <span className="badge badge-bad">! Outbid</span>;
  return null;
}

export function PhotoPlaceholder() {
  return (
    <span style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ink-muted)" }}>
      <PhotoIcon />
      <span className="small">No photo</span>
    </span>
  );
}

/** Follow or stop following a lot. Signed out, it asks to sign in first. */
export function WatchButton({ lotId, title, watching, onChange, wide = false }: { lotId: string; title: string; watching: boolean; onChange?: ((watching: boolean) => void) | undefined; wide?: boolean }) {
  const { signedIn, signIn } = useSite();
  const [on, setOn] = useState(watching);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(watching);
  if (watching !== shown) {
    // The lot was read again (live update, reload): follow it.
    setShown(watching);
    setOn(watching);
  }

  const toggle = async () => {
    if (!signedIn) return signIn();
    setBusy(true);
    const next = !on;
    setOn(next);
    try {
      const path = { params: { path: { lotId } } };
      await call(next ? api().PUT("/api/v1/me/watchlist/{lotId}", path) : api().DELETE("/api/v1/me/watchlist/{lotId}", path));
      onChange?.(next);
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  };

  if (wide) {
    return (
      <button type="button" className="button" aria-pressed={on} onClick={toggle} disabled={busy}>
        <span style={{ color: "var(--accent)", display: "inline-flex" }}>
          <HeartIcon filled={on} size={18} />
        </span>
        {on ? "Watching" : "Watch this lot"}
      </button>
    );
  }

  return (
    <button type="button" className="watch" aria-pressed={on} aria-label={`${on ? "Stop watching" : "Watch"} ${title}`} onClick={toggle} disabled={busy}>
      <HeartIcon filled={on} />
    </button>
  );
}
