import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { LotCardView } from "../components/lots";
import { ErrorMessage, SelectField, TextField } from "../components/ui";
import { api, call, type LotCard } from "../lib/api";
import { useAsync } from "../lib/hooks";
import { useLotEvents, type LotEvent } from "../lib/live";
import { useSite } from "../site";

const SORTS = [
  ["ending", "Ending soonest"],
  ["newest", "Newly listed"],
  ["price-asc", "Price: low to high"],
  ["price-desc", "Price: high to low"],
  ["bids", "Most bids"],
] as const;

const STATUSES = [
  ["current", "Open now and opening soon"],
  ["open", "Open now"],
  ["upcoming", "Opening soon"],
  ["ended", "Ended"],
] as const;

type Sort = (typeof SORTS)[number][0];
type Status = (typeof STATUSES)[number][0];

/** The house's lots: search, categories, filters and sorting live in the address, so every view can be shared. */
export function BrowsePage() {
  const { categories, signedIn } = useSite();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category");
  const status = (params.get("status") as Status | null) ?? "current";
  const sort = (params.get("sort") as Sort | null) ?? "ending";
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  const noBids = params.get("noBids") === "true";
  const endingSoon = params.get("endingWithinHours") === "24";
  const bidding = params.get("bidding") === "true";

  const query = {
    ...(q ? { q } : {}),
    ...(category ? { category } : {}),
    status,
    sort,
    ...(minPrice ? { minPrice: Number(minPrice) } : {}),
    ...(maxPrice ? { maxPrice: Number(maxPrice) } : {}),
    ...(noBids ? { noBids: true } : {}),
    ...(endingSoon ? { endingWithinHours: 24 } : {}),
    ...(bidding ? { bidding: true } : {}),
  };
  const key = JSON.stringify(query);
  const [more, setMore] = useState<{ key: string; items: LotCard[]; cursor: string | null | undefined }>({ key, items: [], cursor: undefined });
  const first = useAsync(() => call(api().GET("/api/v1/lots/search", { params: { query } })), [key, signedIn]);
  const extra = more.key === key ? more : { key, items: [], cursor: undefined };
  const lots = [...(first.data?.items ?? []), ...extra.items];
  const nextCursor = extra.cursor === undefined ? first.data?.nextCursor : extra.cursor;
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>();

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const page = await call(api().GET("/api/v1/lots/search", { params: { query: { ...query, cursor: nextCursor } } }));
      setMore({ key, items: [...extra.items, ...page.items], cursor: page.nextCursor ?? null });
    } catch (e) {
      setMoreError(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Prices, bid counts and ends follow the auction as it happens.
  useLotEvents((event) => {
    first.set((page) => (page ? { ...page, items: page.items.map((l) => apply(l, event)) } : page));
    setMore((m) => ({ ...m, items: m.items.map((l) => apply(l, event)) }));
  });

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(name);
      else next.set(name, value);
    }

    setParams(next);
  };

  const heading = q ? `Results for “${q}”` : (categories.find((c) => c.id === category)?.name ?? "All lots");

  return (
    <div className="page">
      <div className="browse-head">
        <div>
          <h1>{heading}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }} aria-live="polite">
            {first.loading && !first.data ? "Loading lots…" : `${lots.length}${nextCursor ? "+" : ""} ${lots.length === 1 ? "lot" : "lots"}`}
          </p>
        </div>
        <SearchForm initial={q} onSearch={(value) => set({ q: value })} />
      </div>

      <div className="browse">
        <aside aria-label="Filters" className="filters">
          <fieldset>
            <legend>Status</legend>
            {STATUSES.map(([value, label]) => (
              <label key={value} className="check">
                <input type="radio" name="status" checked={status === value} onChange={() => set({ status: value === "current" ? null : value })} />
                {label}
              </label>
            ))}
          </fieldset>
          <PriceFilter key={`${minPrice}-${maxPrice}`} min={minPrice ?? ""} max={maxPrice ?? ""} onApply={(min, max) => set({ minPrice: min, maxPrice: max })} />
          <fieldset>
            <legend>Show only</legend>
            <label className="check">
              <input type="checkbox" checked={noBids} onChange={(e) => set({ noBids: e.target.checked ? "true" : null })} /> No bids yet
            </label>
            <label className="check">
              <input type="checkbox" checked={endingSoon} onChange={(e) => set({ endingWithinHours: e.target.checked ? "24" : null })} /> Ending within 24 hours
            </label>
            {signedIn && (
              <label className="check">
                <input type="checkbox" checked={bidding} onChange={(e) => set({ bidding: e.target.checked ? "true" : null })} /> Lots I am bidding on
              </label>
            )}
          </fieldset>
        </aside>

        <section aria-label="Lots" className="results">
          <div className="results-bar">
            <span />
            <SelectField label="Sort by" value={sort} onChange={(e) => set({ sort: e.target.value === "ending" ? null : e.target.value })}>
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>
          <ErrorMessage error={first.error} />
          {lots.length > 0 ? (
            <ul className="lot-grid">
              {lots.map((lot) => (
                <LotCardView key={lot.id} lot={lot} />
              ))}
            </ul>
          ) : (
            !first.loading && <p className="empty">No lots match. Try fewer filters or another search.</p>
          )}
          <ErrorMessage error={moreError} />
          {nextCursor && (
            <div className="more">
              <button type="button" className="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Show more lots"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SearchForm({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(value.trim());
  };
  return (
    <form role="search" className="search" onSubmit={submit}>
      <TextField label="Search lots" type="search" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className="button button-dark">
        Search
      </button>
    </form>
  );
}

function PriceFilter({ min, max, onApply }: { min: string; max: string; onApply: (min: string | null, max: string | null) => void }) {
  const { house } = useSite();
  const [from, setFrom] = useState(min);
  const [to, setTo] = useState(max);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onApply(from.trim() || null, to.trim() || null);
  };
  return (
    <form onSubmit={submit}>
      <fieldset>
        <legend>Price ({house.currency})</legend>
        <div className="price-range">
          <TextField label="From" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/[^\d]/g, ""))} />
          <TextField label="To" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/[^\d]/g, ""))} />
        </div>
        <div>
          <button type="submit" className="button button-small">
            Apply price
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/** A card with a live event's numbers. The caller's own position is not in events: it stays until the next read. */
function apply(lot: LotCard, event: LotEvent): LotCard {
  if (lot.id !== event.lotId) return lot;
  return { ...lot, status: event.status, currentPrice: event.currentPrice, bidCount: event.bidCount, endsAt: event.endsAt, reserve: event.reserve, outcome: event.outcome };
}
