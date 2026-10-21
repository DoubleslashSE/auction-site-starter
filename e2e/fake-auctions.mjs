// A small stand-in for the Doubleslash Auctions API (/api/v1) and a house's sign-in realm, so this site's end-to-end tests
// run anywhere without the real platform. It keeps the API's shapes (openapi/auctions-v1.json) and its main rules
// (minimum bids, no bidding on your own lot, idempotent ids), not the whole platform. Start: node e2e/fake-auctions.mjs
// The real platform runs the same tests in its own CI (README "Testing").
import { randomUUID } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.FAKE_PORT ?? 5191);
const ORIGIN = `http://localhost:${PORT}`;
const REALM = "/realms/acme/protocol/openid-connect";

const now = () => Date.now();
const iso = (ms) => new Date(ms).toISOString();
const people = { "buyer@example.com": "Anna", "seller@example.com": "Sven", "rival@example.com": "Rita" };
const categories = [
  { id: "0193c000-0000-7000-8000-000000000001", name: "Art", position: 1 },
  { id: "0193c000-0000-7000-8000-000000000002", name: "Watches & jewellery", position: 2 },
];
const lots = new Map();
const watches = new Set(); // `${email}|${lotId}`
const streams = new Set();
let lastNumber = 0;

function addLot({ title, description = "", categoryId = null, startingPrice, minimumIncrement = 100, endsInMinutes, seller = "seller@example.com", reservePrice = null }) {
  const id = randomUUID();
  lots.set(id, {
    id, number: ++lastNumber, title, description, categoryId, startingPrice, minimumIncrement, reservePrice, seller,
    startsAt: iso(now() - 60_000), endsAt: iso(now() + endsInMinutes * 60_000), createdAt: iso(now() - lastNumber * 1000),
    bids: [], images: [], withdrawn: false,
  });
  return id;
}

addLot({ title: "Omega Seamaster, 1968", description: "Steel case, automatic.", categoryId: categories[1].id, startingPrice: 5000, minimumIncrement: 200, endsInMinutes: 30 });
addLot({ title: "Archipelago view, oil on canvas", description: "Signed lower right.", categoryId: categories[0].id, startingPrice: 4000, endsInMinutes: 300, reservePrice: 6000 });
addLot({ title: "Orrefors vase, Edward Hald", description: "Signed.", startingPrice: 1200, endsInMinutes: 2000 });

const status = (l) => (l.withdrawn ? "Withdrawn" : Date.parse(l.startsAt) > now() ? "Upcoming" : Date.parse(l.endsAt) > now() ? "Open" : "Ended");
const current = (l) => (l.bids.length ? l.bids[l.bids.length - 1].amount : null);
const leader = (l) => (l.bids.length ? l.bids[l.bids.length - 1].email : null);
const reserve = (l) => (l.reservePrice == null ? null : (current(l) ?? 0) >= l.reservePrice ? "Met" : "NotMet");
const outcome = (l) => (status(l) !== "Ended" ? null : !l.bids.length ? "NotSold" : reserve(l) === "NotMet" ? "ReserveNotMet" : "Sold");
const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? null;
const numbers = (l) => {
  const map = new Map();
  for (const b of l.bids) if (!map.has(b.email)) map.set(b.email, map.size + 1);
  return map;
};

function card(l, me) {
  const mine = me && l.bids.some((b) => b.email === me);
  return {
    id: l.id, number: l.number, title: l.title, categoryId: l.categoryId, categoryName: categoryName(l.categoryId), status: status(l),
    startingPrice: l.startingPrice, currentPrice: current(l), bidCount: l.bids.length, startsAt: l.startsAt, endsAt: l.endsAt,
    outcome: outcome(l), reserve: reserve(l), coverImageId: l.images[0]?.id ?? null,
    yourStatus: mine ? (leader(l) === me ? "Leading" : "Outbid") : null, watching: Boolean(me && watches.has(`${me}|${l.id}`)),
  };
}

function bidDto(l, b, me) {
  return { bidder: `Bidder ${numbers(l).get(b.email)}`, amount: b.amount, placedAt: b.placedAt, isYours: b.email === me };
}

function lotDto(l, me) {
  const mine = l.bids.filter((b) => b.email === me).map((b) => b.amount);
  return {
    id: l.id, title: l.title, description: l.description, status: status(l), startingPrice: l.startingPrice, minimumIncrement: l.minimumIncrement,
    currentPrice: current(l), minimumNextBid: current(l) == null ? l.startingPrice : current(l) + l.minimumIncrement, bidCount: l.bids.length,
    startsAt: l.startsAt, endsAt: l.endsAt, youAreSeller: l.seller === me, youAreLeading: Boolean(me) && leader(l) === me,
    bids: [...l.bids].reverse().map((b) => bidDto(l, b, me)), outcome: outcome(l), winner: outcome(l) === "Sold" ? `Bidder ${numbers(l).get(leader(l))}` : null,
    youWon: outcome(l) === "Sold" && leader(l) === me, reserve: reserve(l), imageIds: l.images.map((i) => i.id), yourReservePrice: l.seller === me ? l.reservePrice : null,
    number: l.number, categoryId: l.categoryId, categoryName: categoryName(l.categoryId), watching: Boolean(me && watches.has(`${me}|${l.id}`)),
    yourHighestBid: mine.length ? Math.max(...mine) : null,
  };
}

function publish(l, extended = false) {
  const data = JSON.stringify({
    lotId: l.id, number: l.number, status: status(l), startingPrice: l.startingPrice, currentPrice: current(l),
    minimumNextBid: current(l) == null ? l.startingPrice : current(l) + l.minimumIncrement, bidCount: l.bids.length, endsAt: l.endsAt,
    extended, reserve: reserve(l), outcome: outcome(l),
  });
  for (const res of streams) res.write(`id: ${now()}\nevent: lot\ndata: ${data}\n\n`);
}

function placeBid(l, email, amount) {
  if (status(l) !== "Open") return [422, "Bidding on this lot is not open."];
  if (l.seller === email) return [422, "You cannot bid on your own lot."];
  if (leader(l) === email) return [422, "You already have the highest bid."];
  const min = current(l) == null ? l.startingPrice : current(l) + l.minimumIncrement;
  if (!(amount >= min)) return [422, `The bid must be at least ${min.toFixed(2)}.`];
  l.bids.push({ email, amount, placedAt: iso(now()) });
  const extended = Date.parse(l.endsAt) - now() < 120_000;
  if (extended) l.endsAt = iso(now() + 120_000);
  publish(l, extended);
  return null;
}

// ---- Sign-in: codes and tokens are the person's email in disguise ------------------------------------------------
const codes = new Map();
const tokens = new Map();

function signInPage(params) {
  const fields = ["client_id", "redirect_uri", "state", "code_challenge"].map((n) => `<input type="hidden" name="${n}" value="${params.get(n) ?? ""}">`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign in to Acme Auctions</title></head><body>
<main><h1>Sign in to Acme Auctions</h1><form method="post" action="${REALM}/auth">${fields}
<label for="username">Email</label><input id="username" name="username" type="email">
<label for="password">Password</label><input id="password" name="password" type="password">
<button type="submit" id="kc-login">Sign In</button></form></main></body></html>`;
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function send(res, code, payload, headers = {}) {
  res.writeHead(code, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Tenant, Accept", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE", ...headers });
  if (payload === undefined) return res.end();
  if (typeof payload === "string" || Buffer.isBuffer(payload)) return res.end(payload);
  res.end(JSON.stringify(payload));
}

const json = { "Content-Type": "application/json" };
const problem = (res, code, detail, errors) => send(res, code, { status: code, title: "Request failed", detail, ...(errors ? { errors } : {}) }, { "Content-Type": "application/problem+json" });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  const path = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204);
  if (path === "/health") return send(res, 200, "ok");

  // Sign-in realm
  if (path === `${REALM}/auth` && req.method === "GET") return send(res, 200, signInPage(url.searchParams), { "Content-Type": "text/html" });
  if (path === `${REALM}/auth` && req.method === "POST") {
    const form = new URLSearchParams((await body(req)).toString());
    const email = form.get("username")?.toLowerCase() ?? "";
    if (!people[email] || form.get("password") !== "Passw0rd!Dev") return send(res, 401, "Wrong email or password", { "Content-Type": "text/plain" });
    const code = randomUUID();
    codes.set(code, email);
    const back = new URL(form.get("redirect_uri"));
    back.searchParams.set("code", code);
    back.searchParams.set("state", form.get("state") ?? "");
    return send(res, 302, undefined, { Location: back.toString() });
  }
  if (path === `${REALM}/token` && req.method === "POST") {
    const form = new URLSearchParams((await body(req)).toString());
    const email = form.get("grant_type") === "refresh_token" ? tokens.get(form.get("refresh_token")) : codes.get(form.get("code"));
    if (!email) return send(res, 400, { error: "invalid_grant" }, json);
    codes.delete(form.get("code"));
    const access = randomUUID();
    const refresh = randomUUID();
    tokens.set(access, email);
    tokens.set(refresh, email);
    return send(res, 200, { access_token: access, refresh_token: refresh, id_token: "id", expires_in: 600 }, json);
  }
  if (path === `${REALM}/logout`) return send(res, 302, undefined, { Location: url.searchParams.get("post_logout_redirect_uri") ?? "/" });

  if (!path.startsWith("/api/v1/")) return problem(res, 404, "Not found.");
  if (req.headers["x-tenant"] !== "acme" && !path.includes("/images/")) return problem(res, 404, "Name the house with X-Tenant.");
  const me = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, "")) ?? null;
  const signedIn = () => (me ? true : (problem(res, 401, "Sign in first."), false));
  const route = path.slice("/api/v1".length);
  let m;

  if (route === "/house") return send(res, 200, { slug: "acme", name: "Acme Auctions", currency: "SEK" }, json);
  if (route === "/site") return send(res, 200, { tenantId: randomUUID(), slug: "acme", displayName: "Acme Auctions", supportEmail: "support@acme.example", signUpOpen: true }, json);
  if (route === "/categories") {
    return send(res, 200, categories.map((c) => ({ ...c, currentLotCount: [...lots.values()].filter((l) => l.categoryId === c.id && status(l) !== "Ended").length })), json);
  }
  if (route === "/me") return signedIn() && send(res, 200, { subject: me, email: me, displayName: people[me], realm: "acme", roles: ["User"], tenantId: null, tenantName: "Acme Auctions", membershipStatus: "Active", hasAccess: true }, json);
  if (route === "/sign-ups" && req.method === "POST") return send(res, 202);
  if (route === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
    res.write("retry: 1000\n: connected\n\n");
    streams.add(res);
    req.on("close", () => streams.delete(res));
    return;
  }
  if (route === "/lots/search") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const st = url.searchParams.get("status") ?? "current";
    let list = [...lots.values()].filter((l) => !l.withdrawn);
    list = list.filter((l) => (st === "ended" ? status(l) === "Ended" : st === "open" ? status(l) === "Open" : st === "upcoming" ? status(l) === "Upcoming" : status(l) !== "Ended"));
    list = list.filter((l) => q.every((w) => `${l.title} ${l.description}`.toLowerCase().includes(w)));
    if (url.searchParams.get("category")) list = list.filter((l) => l.categoryId === url.searchParams.get("category"));
    if (url.searchParams.get("noBids") === "true") list = list.filter((l) => !l.bids.length);
    if (url.searchParams.get("bidding") === "true") list = list.filter((l) => me && l.bids.some((b) => b.email === me));
    const price = (l) => current(l) ?? l.startingPrice;
    const sorts = { ending: (a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt), newest: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt), "price-asc": (a, b) => price(a) - price(b), "price-desc": (a, b) => price(b) - price(a), bids: (a, b) => b.bids.length - a.bids.length };
    list.sort(sorts[url.searchParams.get("sort") ?? "ending"] ?? sorts.ending);
    return send(res, 200, { items: list.map((l) => card(l, me)), nextCursor: null }, json);
  }
  if (route === "/lots" && req.method === "POST") {
    if (!signedIn()) return;
    const input = JSON.parse((await body(req)).toString());
    if (!input.title?.trim()) return problem(res, 400, "One or more validation errors occurred.", { title: ["Enter a title of at most 200 characters."] });
    if (!lots.has(input.id)) {
      lots.set(input.id, {
        id: input.id, number: ++lastNumber, title: input.title, description: input.description ?? "", categoryId: input.categoryId ?? null,
        startingPrice: input.startingPrice, minimumIncrement: input.minimumIncrement, reservePrice: input.reservePrice ?? null, seller: me,
        startsAt: Date.parse(input.startsAt) < now() ? iso(now()) : input.startsAt, endsAt: input.endsAt, createdAt: iso(now()), bids: [], images: [], withdrawn: false,
      });
    }
    return send(res, 202, undefined, { Location: `/api/v1/lots/${input.id}` });
  }
  if ((m = route.match(/^\/lots\/([^/]+)$/))) {
    const l = lots.get(m[1]);
    if (!l) return problem(res, 404, "Lot not found.");
    if (req.method === "GET") return send(res, 200, lotDto(l, me), json);
    if (req.method === "PUT") {
      if (!signedIn()) return;
      if (l.seller !== me) return problem(res, 403, "Only the seller can change this lot.");
      const input = JSON.parse((await body(req)).toString());
      Object.assign(l, { title: input.title, description: input.description ?? "" });
      if (input.categoryId !== undefined && input.categoryId !== null) l.categoryId = input.categoryId === "00000000-0000-0000-0000-000000000000" ? null : input.categoryId;
      return send(res, 204);
    }
  }
  if ((m = route.match(/^\/lots\/([^/]+)\/bids$/))) {
    const l = lots.get(m[1]);
    if (!l) return problem(res, 404, "Lot not found.");
    if (req.method === "GET") return send(res, 200, { items: [...l.bids].reverse().map((b) => bidDto(l, b, me)), nextCursor: null }, json);
    if (!signedIn()) return;
    const input = JSON.parse((await body(req)).toString());
    if (!l.bids.some((b) => b.id === input.id)) {
      const failure = placeBid(l, me, Number(input.amount));
      if (failure) return problem(res, failure[0], failure[1]);
      l.bids[l.bids.length - 1].id = input.id;
    }
    return send(res, 202);
  }
  if ((m = route.match(/^\/lots\/([^/]+)\/withdraw$/)) && req.method === "POST") {
    const l = lots.get(m[1]);
    if (!signedIn()) return;
    if (!l || l.seller !== me) return problem(res, 403, "Only the seller can withdraw this lot.");
    l.withdrawn = true;
    publish(l);
    return send(res, 204);
  }
  if ((m = route.match(/^\/lots\/([^/]+)\/images\/([^/]+)$/))) {
    const l = lots.get(m[1]);
    if (!l) return problem(res, 404, "Lot not found.");
    if (req.method === "GET") {
      const image = l.images.find((i) => i.id === m[2]);
      return image ? send(res, 200, image.data, { "Content-Type": image.type }) : problem(res, 404, "No such photo.");
    }
    if (!signedIn()) return;
    if (req.method === "PUT") {
      if (!l.images.some((i) => i.id === m[2])) l.images.push({ id: m[2], data: await body(req), type: req.headers["content-type"] ?? "image/png" });
      return send(res, 204);
    }
    if (req.method === "DELETE") {
      l.images = l.images.filter((i) => i.id !== m[2]);
      return send(res, 204);
    }
  }
  if (route === "/me/bids") {
    if (!signedIn()) return;
    const mine = [...lots.values()].filter((l) => l.bids.some((b) => b.email === me));
    return send(res, 200, mine.map((l) => ({
      lotId: l.id, title: l.title, status: status(l), outcome: outcome(l), yourBid: Math.max(...l.bids.filter((b) => b.email === me).map((b) => b.amount)),
      currentPrice: current(l), youLead: leader(l) === me, youWon: outcome(l) === "Sold" && leader(l) === me, endsAt: l.endsAt, number: l.number,
    })), json);
  }
  if (route === "/me/lots") {
    if (!signedIn()) return;
    return send(res, 200, [...lots.values()].filter((l) => l.seller === me).map((l) => ({
      id: l.id, title: l.title, status: status(l), outcome: outcome(l), reserve: reserve(l), startingPrice: l.startingPrice, currentPrice: current(l),
      bidCount: l.bids.length, startsAt: l.startsAt, endsAt: l.endsAt, number: l.number,
    })), json);
  }
  if (route === "/me/selling") return signedIn() && send(res, 200, { canSell: true }, json);
  if (route === "/me/watchlist") return signedIn() && send(res, 200, [...lots.values()].filter((l) => watches.has(`${me}|${l.id}`)).map((l) => card(l, me)), json);
  if ((m = route.match(/^\/me\/watchlist\/([^/]+)$/))) {
    if (!signedIn()) return;
    if (req.method === "PUT") watches.add(`${me}|${m[1]}`);
    if (req.method === "DELETE") watches.delete(`${me}|${m[1]}`);
    return send(res, 204);
  }

  // Test hook: someone else bids (live updates).
  if (route === "/_test/rival-bid" && req.method === "POST") {
    const { lotId } = JSON.parse((await body(req)).toString());
    const l = lots.get(lotId);
    const failure = placeBid(l, "rival@example.com", (current(l) ?? l.startingPrice - l.minimumIncrement) + l.minimumIncrement);
    return failure ? problem(res, failure[0], failure[1]) : send(res, 202);
  }

  return problem(res, 404, "Not found.");
});

server.listen(PORT, () => console.log(`Fake Auctions API and sign-in on ${ORIGIN}`));
