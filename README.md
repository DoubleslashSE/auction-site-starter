# Auction site starter

An auction house's site for its buyers and sellers, built on the [Doubleslash Auctions](https://auction.rootkit.nu) API
(`/api/v1`). Fork it, give it your look, and host it anywhere: it is static files.

It covers what bidders and sellers need:
- **Browse:** search, categories, sorting, filters (price, no bids yet, ending within 24 hours, lots I bid on) and paging.
- **Lot page:** photos, the current bid and countdown, bidding with a confirmation step, the bid history, and live
  updates (other people's bids, late bids that extend the end).
- **Watchlist:** follow lots and get an email an hour before they end.
- **My pages:** your bids (leading or outbid, won), watchlist, your lots, account.
- **Selling:** list a lot with photos, a category, prices, a hidden reserve and times; edit or withdraw it.
- **Accounts:** sign in at the house, ask for an account (with your terms of sale, if you set them).

React, TypeScript and Vite, with no UI kit. The API client is typed from the published OpenAPI document. Every page
works with a keyboard and a screen reader and fits a phone.

## Run it

```sh
pnpm install
pnpm dev            # http://localhost:5190, using public/config.js
```

`public/config.js` points at a local Doubleslash Auctions stack by default. To try the site without one, run the fake
API used by the tests and point the site at it:

```sh
node e2e/fake-auctions.mjs          # http://localhost:5191: API and sign-in (buyer@example.com / Passw0rd!Dev)
```

and in `public/config.js` set `authority: "http://localhost:5191/realms/acme"` and `api: "http://localhost:5191/api/v1"`.

## Configure

The site reads its settings from `/config.js` at start-up (`window.SITE_CONFIG`), so one build serves every
environment:

| Setting | What |
|---|---|
| `authority` | Your house's sign-in, e.g. `https://id.auction.rootkit.nu/realms/<house>` |
| `clientId` | `headless` (the public client for houses' own sites) |
| `api` | `https://api.auction.rootkit.nu/api/v1` |
| `tenant` | Your house's slug, sent as `X-Tenant` |
| `termsUrl` | Optional: your terms of sale. Signing up then asks to accept them |

Register the address your site runs on (for example `https://auctions.your-house.com`) in the Auctions admin, under
**Settings › Your own sites**. Sign-in and the API accept only registered addresses. Set the same address under
**Catalogue › Your own site's address**, so links in emails lead to your site. Categories and the currency are set
under **Catalogue** too.

## Make it yours

- **Look:** `src/theme.css` holds the colours, fonts and corners as CSS variables; the rest of the styles in
  `src/styles.css` follow them. Keep text contrast at 4.5:1 or more.
- **Name and logo:** the header (`src/components/Layout.tsx`) shows the house's name from the API; put your logo there.
- **Pages:** everything is in `src/pages` and `src/components`, plain React. The API calls are typed: `api().GET("/api/v1/…")`.

## Deploy

`pnpm build` writes the site to `dist/`. Serve it from any static host, answering unknown paths with `index.html`
(the site routes in the browser), and serve your own `config.js` next to it.

Or use the container image (`Dockerfile`): nginx with `config.js` and a strict Content-Security-Policy written from
environment variables:

```sh
docker build -t auction-site .
docker run -p 8080:80 \
  -e SITE_AUTHORITY=https://id.auction.rootkit.nu/realms/acme \
  -e SITE_API=https://api.auction.rootkit.nu/api/v1 \
  -e SITE_TENANT=acme \
  auction-site
```

One container can serve many houses at `{slug}.<base domain>`: set `SITE_TENANT_FROM_HOST=<base domain>` instead of
`SITE_TENANT`, and put `{tenant}` in `SITE_AUTHORITY`.

### Security

Signing in happens in the browser (OpenID Connect code flow with PKCE, no secret). The access token lives in memory
only; the refresh token is kept for the tab in `sessionStorage` and works once. The image's Content-Security-Policy
allows only the site's own scripts and calls to your sign-in and the API. Keep that policy if you host it yourself,
and do not add third-party scripts: anything running on the page could act as the signed-in person.

## Testing

```sh
pnpm lint && pnpm typecheck && pnpm test   # static checks and unit tests
pnpm e2e                                   # Playwright: the whole journey against e2e/fake-auctions.mjs
```

The same Playwright tests run against a real Doubleslash Auctions stack with `E2E_TARGET=stack` (plus `SITE_AUTHORITY`,
`SITE_API`, `SITE_TENANT` and the test accounts in `E2E_BUYER`, `E2E_SELLER`, `E2E_RIVAL`, `E2E_PASSWORD`). The
platform runs them in its own CI for every release of this starter.

## The API

`openapi/auctions-v1.json` is the API version this site is built against. `/api/v1` only grows, so a newer platform
keeps working. To use something new, copy the current document from `https://api.auction.rootkit.nu/api/v1/openapi.json`
over it and run `pnpm gen:api`.

## Licence

MIT, see [LICENSE](LICENSE).
