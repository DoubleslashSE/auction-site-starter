import { Link, NavLink, useParams } from "react-router";
import { LotCardView, outcomeText, PositionBadge } from "../components/lots";
import { ErrorMessage } from "../components/ui";
import { api, call, type Schemas } from "../lib/api";
import { accountUrl, signOut } from "../lib/auth";
import { formatMoney, formatRemaining, formatWhen, isEndingSoon } from "../lib/format";
import { useAsync, useCommand, useNow } from "../lib/hooks";
import { useSite } from "../site";

const TABS = [
  ["bids", "My bids"],
  ["watchlist", "Watchlist"],
  ["lots", "My lots"],
  ["account", "Account"],
] as const;

/** The buyer's and seller's own pages, one tab each. Signed out, they ask to sign in. */
export function MyPages() {
  const { tab = "bids" } = useParams();
  const { signedIn, signIn, me } = useSite();

  if (!signedIn) {
    return (
      <div className="page narrow">
        <h1>My pages</h1>
        <p>Sign in to see your bids, your watchlist and the lots you sell.</p>
        <button type="button" className="button button-dark" onClick={signIn}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="browse-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>My pages</h1>
          {me?.email && <p className="muted" style={{ margin: "4px 0 0" }}>Signed in as {me.email}</p>}
        </div>
        <Link to="/sell" className="button button-dark">
          Sell a lot
        </Link>
      </div>
      <nav aria-label="My pages" className="tabs">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={`/my/${path}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      {tab === "bids" && <MyBids />}
      {tab === "watchlist" && <Watchlist />}
      {tab === "lots" && <MyLots />}
      {tab === "account" && <Account />}
    </div>
  );
}

function MyBids() {
  const { house } = useSite();
  const now = useNow(30_000);
  const bids = useAsync(() => call(api().GET("/api/v1/me/bids")), []);
  const running = (bids.data ?? []).filter((b) => b.status === "Open" || b.status === "Upcoming");
  const ended = (bids.data ?? []).filter((b) => b.status !== "Open" && b.status !== "Upcoming");

  if (bids.loading && !bids.data) return <p className="muted">Loading…</p>;
  return (
    <section aria-label="My bids">
      <ErrorMessage error={bids.error} />
      <h2 style={{ fontSize: 18 }}>Bidding now</h2>
      {running.length === 0 ? (
        <p className="muted">
          You are not bidding on anything right now. <Link to="/">Browse lots</Link>
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Lot</th>
                <th scope="col" className="amount">
                  Your highest bid
                </th>
                <th scope="col" className="amount">
                  Current bid
                </th>
                <th scope="col">Status</th>
                <th scope="col">Ends</th>
              </tr>
            </thead>
            <tbody>
              {running.map((b) => (
                <tr key={b.lotId}>
                  <td>
                    <Link to={`/lots/${b.lotId}`} style={{ fontWeight: 600 }}>
                      {b.title}
                    </Link>
                  </td>
                  <td className="amount">{formatMoney(b.yourBid, house.currency)}</td>
                  <td className="amount">
                    <strong>{formatMoney(b.currentPrice, house.currency)}</strong>
                  </td>
                  <td>
                    <PositionBadge status={b.youLead ? "Leading" : "Outbid"} />
                  </td>
                  <td className={isEndingSoon(b.endsAt, now) ? "urgent" : undefined}>in {formatRemaining(b.endsAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ended.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, marginTop: 32 }}>Ended</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Lot</th>
                  <th scope="col" className="amount">
                    Your highest bid
                  </th>
                  <th scope="col" className="amount">
                    Final bid
                  </th>
                  <th scope="col">Result</th>
                  <th scope="col">Ended</th>
                </tr>
              </thead>
              <tbody>
                {ended.map((b) => (
                  <tr key={b.lotId}>
                    <td>
                      <Link to={`/lots/${b.lotId}`} style={{ fontWeight: 600 }}>
                        {b.title}
                      </Link>
                    </td>
                    <td className="amount">{formatMoney(b.yourBid, house.currency)}</td>
                    <td className="amount">{formatMoney(b.currentPrice, house.currency)}</td>
                    <td>{b.youWon ? <span className="badge">You won</span> : b.status === "Withdrawn" ? "Withdrawn" : "Not won"}</td>
                    <td>{formatWhen(b.endsAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Watchlist() {
  const lots = useAsync(() => call(api().GET("/api/v1/me/watchlist")), []);
  if (lots.loading && !lots.data) return <p className="muted">Loading…</p>;
  return (
    <section aria-label="Watchlist">
      <ErrorMessage error={lots.error} />
      <p className="muted" style={{ marginTop: 0 }}>
        We email you an hour before a lot you watch ends.
      </p>
      {lots.data && lots.data.length > 0 ? (
        <ul className="lot-grid">
          {lots.data.map((lot) => (
            <LotCardView key={lot.id} lot={lot} onWatchChange={(watching) => !watching && lots.set((list) => list?.filter((l) => l.id !== lot.id))} />
          ))}
        </ul>
      ) : (
        <p>
          You are not watching any lots. <Link to="/">Browse lots</Link> and tap the heart on the ones you like.
        </p>
      )}
    </section>
  );
}

function MyLots() {
  const { house } = useSite();
  const lots = useAsync(() => call(api().GET("/api/v1/me/lots")), []);
  const selling = useAsync(() => call(api().GET("/api/v1/me/selling")), []);
  if (lots.loading && !lots.data) return <p className="muted">Loading…</p>;
  return (
    <section aria-label="My lots">
      <ErrorMessage error={lots.error} />
      {selling.data && !selling.data.canSell && <p className="alert">{house.name} has not approved you as a seller yet. Ask them if you want to sell.</p>}
      {lots.data && lots.data.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Lot</th>
                <th scope="col">Status</th>
                <th scope="col" className="amount">
                  Bids
                </th>
                <th scope="col" className="amount">
                  Current bid
                </th>
                <th scope="col">Reserve</th>
                <th scope="col">Ends</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lots.data.map((l) => (
                <MyLotRow key={l.id} lot={l} currency={house.currency} onChanged={lots.reload} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          You have not listed anything yet. <Link to="/sell">Sell a lot</Link>
        </p>
      )}
    </section>
  );
}

function MyLotRow({ lot, currency, onChanged }: { lot: Schemas["MyLotDto"]; currency: string; onChanged: () => void }) {
  const command = useCommand();
  const running = lot.status === "Open" || lot.status === "Upcoming";
  const withdraw = async () => {
    if (!confirm(`Withdraw "${lot.title}"? It leaves the sale and cannot be listed again under this lot.`)) return;
    if (await command.run(() => call(api().POST("/api/v1/lots/{id}/withdraw", { params: { path: { id: lot.id } } })))) onChanged();
  };
  return (
    <tr>
      <td>
        <Link to={`/lots/${lot.id}`} style={{ fontWeight: 600 }}>
          {lot.title}
        </Link>
        <div className="small muted">Lot {lot.number}</div>
      </td>
      <td>{lot.status === "Ended" ? outcomeText(lot.outcome) : lot.status === "Upcoming" ? "Opening soon" : lot.status}</td>
      <td className="amount">{lot.bidCount}</td>
      <td className="amount">{lot.currentPrice == null ? <span className="muted">Starts at {formatMoney(lot.startingPrice, currency)}</span> : formatMoney(lot.currentPrice, currency)}</td>
      <td>{lot.reserve === null ? "None" : lot.reserve === "Met" ? "Met" : "Not met"}</td>
      <td>{formatWhen(lot.endsAt)}</td>
      <td>
        {running && (
          <div className="actions">
            <Link to={`/lots/${lot.id}/edit`}>Edit</Link>
            {lot.bidCount === 0 && (
              <button type="button" className="link-button danger" onClick={withdraw} disabled={command.pending}>
                Withdraw
              </button>
            )}
          </div>
        )}
        <ErrorMessage error={command.error} />
      </td>
    </tr>
  );
}

function Account() {
  const { me, house } = useSite();
  return (
    <section aria-label="Account" className="narrow" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <dl className="facts" style={{ fontSize: 15 }}>
        <dt>Email</dt>
        <dd>{me?.email ?? "—"}</dd>
        <dt>Account at</dt>
        <dd>{house.name}</dd>
      </dl>
      <div className="actions">
        <a href={accountUrl()} className="button">
          Password and email
        </a>
        <button type="button" className="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    </section>
  );
}
