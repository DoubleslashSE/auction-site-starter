import { Link, NavLink, Outlet, useLocation, useSearchParams } from "react-router";
import { useSite } from "../site";
import { HeartIcon, UserIcon } from "./ui";

/** Every page: the house's header with its categories, the page, and the footer. */
export function Layout() {
  const { house, info, categories, signedIn, signIn } = useSite();
  const location = useLocation();
  const [params] = useSearchParams();
  const onBrowse = location.pathname === "/";
  const category = params.get("category");

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-bar">
          <Link to="/" className="brand">
            {house.name}
          </Link>
          <nav aria-label="Main" className="main-nav">
            <NavLink to="/" end>
              Browse
            </NavLink>
            <NavLink to="/sell">Sell a lot</NavLink>
          </nav>
          <nav aria-label="Your account" className="account-nav">
            {signedIn ? (
              <>
                <NavLink to="/my/watchlist" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <HeartIcon size={18} />
                  Watchlist
                </NavLink>
                <NavLink to="/my/bids" className="button button-small" style={{ fontWeight: 600 }}>
                  <UserIcon />
                  My pages
                </NavLink>
              </>
            ) : (
              <>
                {info?.signUpOpen && <Link to="/sign-up">Create an account</Link>}
                <button type="button" className="button button-dark button-small" onClick={signIn}>
                  Sign in
                </button>
              </>
            )}
          </nav>
        </div>
        {categories.length > 0 && (
          <nav aria-label="Categories" className="categories">
            <ul>
              <li>
                <Link to="/" aria-current={onBrowse && !category ? "page" : undefined}>
                  All lots
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link to={`/?category=${c.id}`} aria-current={onBrowse && category === c.id ? "page" : undefined}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer-bar">
          <div>
            <strong style={{ color: "var(--ink)" }}>{house.name}</strong>
            {info?.supportEmail && (
              <div>
                Questions? <a href={`mailto:${info.supportEmail}`}>{info.supportEmail}</a>
              </div>
            )}
          </div>
          <nav aria-label="About" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <Link to="/how-it-works">How bidding works</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
