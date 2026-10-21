import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { outcomeText, PhotoPlaceholder, WatchButton } from "../components/lots";
import { ErrorMessage, fieldError, TextField } from "../components/ui";
import { api, ApiError, call, imageUrl, newId, type Lot, type Schemas } from "../lib/api";
import { bidsText, formatMoney, formatRemaining, formatWhen, isEndingSoon } from "../lib/format";
import { useAsync, useCommand, useNow } from "../lib/hooks";
import { useLotEvents } from "../lib/live";
import { useSite } from "../site";

type Bid = Schemas["BidDto"];

/** One lot: photos, the bid box (live), the description and the bid history. */
export function LotPage() {
  const { id = "" } = useParams();
  const { signedIn, categories } = useSite();
  const lot = useAsync(() => call(api().GET("/api/v1/lots/{id}", { params: { path: { id } } })), [id, signedIn]);
  const [extended, setExtended] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [freshBid, setFreshBid] = useState<string>();

  // Someone else bid, the end moved, or the lot closed: read it again (that also updates the caller's own position).
  useLotEvents((event) => {
    if (event.lotId !== id) return;
    if (event.extended) setExtended(true);
    const before = lot.data;
    lot.reload();
    if (before && event.bidCount > before.bidCount && event.currentPrice != null) {
      setFreshBid(`${event.currentPrice}`);
      setAnnouncement(`New bid on this lot. ${event.extended ? "Bidding was extended by 2 minutes." : ""}`);
    }
  });

  if (lot.error instanceof ApiError && lot.error.status === 404) {
    return (
      <div className="page">
        <h1>Lot not found</h1>
        <p>
          It may have been removed. <Link to="/">See all lots</Link>
        </p>
      </div>
    );
  }

  if (!lot.data) {
    return (
      <div className="page" aria-busy={lot.loading}>
        <ErrorMessage error={lot.error} />
        {lot.loading && <p className="muted">Loading…</p>}
      </div>
    );
  }

  const data = lot.data;
  const category = categories.find((c) => c.id === data.categoryId);
  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/">All lots</Link>
        {category && (
          <>
            {" / "}
            <Link to={`/?category=${category.id}`}>{category.name}</Link>
          </>
        )}
      </nav>
      <div className="lot-layout">
        <div className="lot-main">
          <Gallery lot={data} />
          <section aria-labelledby="about">
            <h2 id="about">About this lot</h2>
            <p className="description">{data.description || "No description."}</p>
            <Facts lot={data} />
          </section>
          <BidHistory lotId={data.id} bidCount={data.bidCount} freshAmount={freshBid} />
        </div>
        <BidPanel lot={data} extended={extended} onBid={lot.reload} />
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function Gallery({ lot }: { lot: Lot }) {
  const [index, setIndex] = useState(0);
  const current = lot.imageIds[Math.min(index, lot.imageIds.length - 1)];
  return (
    <section aria-label="Photos">
      <div className="gallery-main">{current ? <img src={imageUrl(lot.id, current)} alt={`${lot.title}, photo ${index + 1} of ${lot.imageIds.length}`} /> : <PhotoPlaceholder />}</div>
      {lot.imageIds.length > 1 && (
        <ul className="thumbs">
          {lot.imageIds.map((imageId, i) => (
            <li key={imageId}>
              <button type="button" aria-pressed={i === index} aria-label={`Show photo ${i + 1}`} onClick={() => setIndex(i)}>
                <img src={imageUrl(lot.id, imageId)} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Facts({ lot }: { lot: Lot }) {
  const { house } = useSite();
  return (
    <dl className="facts">
      <dt>Starting price</dt>
      <dd>{formatMoney(lot.startingPrice, house.currency)}</dd>
      <dt>Minimum increment</dt>
      <dd>{formatMoney(lot.minimumIncrement, house.currency)}</dd>
      <dt>{lot.status === "Upcoming" ? "Opens" : "Opened"}</dt>
      <dd>{formatWhen(lot.startsAt)}</dd>
      <dt>{lot.status === "Ended" ? "Ended" : "Ends"}</dt>
      <dd>{formatWhen(lot.endsAt)}</dd>
      {lot.categoryName && (
        <>
          <dt>Category</dt>
          <dd>{lot.categoryName}</dd>
        </>
      )}
    </dl>
  );
}

function BidPanel({ lot, extended, onBid }: { lot: Lot; extended: boolean; onBid: () => void }) {
  const { house, signedIn, signIn, info } = useSite();
  const now = useNow(1000);
  const ending = lot.status === "Open" && isEndingSoon(lot.endsAt, now);
  return (
    <aside aria-label="Bidding" className="bid-panel">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <StatusBadge status={lot.status} />
        <span className="small muted">Lot {lot.number}</span>
      </div>
      <h1>{lot.title}</h1>
      <div className="bid-figures">
        <div>
          <div className="small muted">{lot.currentPrice == null ? "Starting price" : lot.status === "Ended" ? "Final bid" : "Current bid"}</div>
          <div className="big-figure" data-testid="current-price">
            {formatMoney(lot.currentPrice ?? lot.startingPrice, house.currency)}
          </div>
          <div className="small muted">
            {bidsText(lot.bidCount)}
            {lot.reserve && (lot.reserve === "Met" ? " · reserve met" : " · reserve not met")}
          </div>
        </div>
        {lot.status === "Open" && (
          <div>
            <div className="small muted">Time left</div>
            <div className={`big-figure${ending ? " urgent" : ""}`} role="timer" aria-live="off">
              {formatRemaining(lot.endsAt, now)}
            </div>
            <div className="small muted">Ends {formatWhen(lot.endsAt)}</div>
          </div>
        )}
      </div>

      {extended && lot.status === "Open" && <p className="alert alert-notice">A late bid extended bidding by 2 minutes.</p>}
      {lot.youAreSeller && <SellerBox lot={lot} />}
      {!lot.youAreSeller && lot.youAreLeading && lot.status === "Open" && <p className="alert alert-success">✓ You are the highest bidder</p>}
      {!lot.youAreSeller && !lot.youAreLeading && lot.yourHighestBid != null && lot.status === "Open" && (
        <p className="alert alert-error">! You have been outbid. Your last bid: {formatMoney(lot.yourHighestBid, house.currency)}</p>
      )}

      {lot.status === "Ended" ? (
        <p data-testid="lot-result" className="alert">
          {lot.youWon ? `You won this lot for ${formatMoney(lot.currentPrice, house.currency)}. ${house.name} will contact you.` : outcomeText(lot.outcome)}
        </p>
      ) : lot.status === "Withdrawn" ? (
        <p data-testid="lot-result" className="alert">
          This lot has been withdrawn and takes no bids.
        </p>
      ) : lot.status === "Upcoming" ? (
        <p className="alert">Bidding opens {formatWhen(lot.startsAt)}.</p>
      ) : !signedIn ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0 }}>Sign in to bid on this lot or to watch it.</p>
          <button type="button" className="button button-accent button-large" onClick={signIn}>
            Sign in to bid
          </button>
          {info?.signUpOpen && (
            <Link to="/sign-up" className="button">
              Create an account
            </Link>
          )}
        </div>
      ) : lot.youAreSeller ? null : lot.youAreLeading ? null : (
        <BidForm lot={lot} onBid={onBid} />
      )}

      {!lot.youAreSeller && <WatchButton lotId={lot.id} title={lot.title} watching={lot.watching} wide />}
      {lot.status === "Open" && <p className="small muted" style={{ margin: 0 }}>A bid in the last 2 minutes extends bidding by 2 minutes. Bidders are shown by number, never by name.</p>}
    </aside>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "Open" ? "badge badge-good" : "badge";
  const label = status === "Upcoming" ? "Opening soon" : status;
  return <span className={tone}>{label}</span>;
}

/** Amount, quick picks, then a confirmation: a bid is binding. */
function BidForm({ lot, onBid }: { lot: Lot; onBid: () => void }) {
  const { house } = useSite();
  const command = useCommand();
  const [amount, setAmount] = useState(String(lot.minimumNextBid));
  const [confirming, setConfirming] = useState(false);
  const [minimum, setMinimum] = useState(lot.minimumNextBid);
  if (lot.minimumNextBid !== minimum) {
    // Someone bid meanwhile: suggest the new minimum.
    setMinimum(lot.minimumNextBid);
    if (Number(amount) < lot.minimumNextBid) setAmount(String(lot.minimumNextBid));
  }

  const value = Number(amount.replace(",", "."));
  const quick = [lot.minimumNextBid, lot.minimumNextBid + lot.minimumIncrement, lot.minimumNextBid + lot.minimumIncrement * 3];

  const ask = (event: FormEvent) => {
    event.preventDefault();
    command.clear();
    setConfirming(true);
  };

  const place = async () => {
    // The bid id makes a retried request (lost answer) a no-op instead of a second bid.
    if (await command.run(() => call(api().POST("/api/v1/lots/{id}/bids", { params: { path: { id: lot.id } }, body: { id: newId(), amount: value } })))) {
      setConfirming(false);
      onBid();
    } else {
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="confirm" role="group" aria-labelledby="confirm-title">
        <p id="confirm-title" style={{ margin: 0, fontWeight: 600 }}>
          Confirm your bid of {formatMoney(value, house.currency)}
        </p>
        <p className="small" style={{ margin: 0 }}>
          A bid is binding. If you win, you buy the lot on {house.name}'s terms of sale.
        </p>
        <div className="actions">
          <button type="button" className="button button-accent" onClick={place} disabled={command.pending} autoFocus>
            Confirm bid
          </button>
          <button type="button" className="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form" style={{ gap: 12 }} onSubmit={ask} noValidate>
      <TextField
        label={`Your bid (${house.currency})`}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint={`At least ${formatMoney(lot.minimumNextBid, house.currency)}`}
        error={fieldError(command.error, "amount")}
      />
      <div className="quick-bids">
        {quick.map((q) => (
          <button key={q} type="button" className="button button-small num" onClick={() => setAmount(String(q))}>
            {formatMoney(q, house.currency)}
          </button>
        ))}
      </div>
      <ErrorMessage error={command.error} fields={["amount"]} />
      <button type="submit" className="button button-accent button-large" disabled={!(value >= lot.minimumNextBid)}>
        Place bid
      </button>
    </form>
  );
}

function SellerBox({ lot }: { lot: Lot }) {
  const canChange = lot.status === "Open" || lot.status === "Upcoming";
  return (
    <div className="alert" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <strong>This is your lot.</strong>
      {canChange && (
        <span className="small">{lot.bidCount === 0 ? "You can still change everything or withdraw it." : "It has bids: you can change the title, description, category and photos."}</span>
      )}
      {canChange && (
        <div>
          <Link to={`/lots/${lot.id}/edit`} className="button button-small">
            Edit lot
          </Link>
        </div>
      )}
    </div>
  );
}

function BidHistory({ lotId, bidCount, freshAmount }: { lotId: string; bidCount: number; freshAmount: string | undefined }) {
  const { house, signedIn } = useSite();
  const first = useAsync(() => call(api().GET("/api/v1/lots/{id}/bids", { params: { path: { id: lotId }, query: { limit: 10 } } })), [lotId, bidCount, signedIn]);
  const [older, setOlder] = useState<{ items: Bid[]; cursor: string | null }>({ items: [], cursor: null });
  const items = [...(first.data?.items ?? []), ...older.items];
  const cursor = older.cursor ?? first.data?.nextCursor ?? null;

  const loadOlder = async () => {
    if (!cursor) return;
    const page = await call(api().GET("/api/v1/lots/{id}/bids", { params: { path: { id: lotId }, query: { limit: 50, cursor } } }));
    setOlder({ items: [...older.items, ...page.items], cursor: page.nextCursor ?? null });
  };

  return (
    <section aria-labelledby="history">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 id="history">Bid history</h2>
        <span className="live-dot">Live</span>
      </div>
      {items.length === 0 ? (
        <p className="muted">No bids yet.</p>
      ) : (
        <ol className="bid-history" aria-label="Bids, newest first" data-testid="bids">
          {items.map((bid, i) => (
            <li key={`${bid.placedAt}-${i}`} className={i === 0 && freshAmount === String(bid.amount) ? "fresh" : bid.isYours ? "yours" : undefined}>
              <strong className="num">{formatMoney(bid.amount, house.currency)}</strong>
              <span>{bid.isYours ? `You (${bid.bidder})` : bid.bidder}</span>
              <span className="when num">{formatWhen(bid.placedAt)}</span>
            </li>
          ))}
        </ol>
      )}
      {cursor && (
        <button type="button" className="button button-small" style={{ marginTop: 12 }} onClick={loadOlder}>
          Show older bids
        </button>
      )}
    </section>
  );
}
