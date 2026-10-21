// Signing buyers and sellers in at the house's realm: OpenID Connect code flow with PKCE, no secret in the browser.
// The access token lives in memory only; the refresh token is kept in sessionStorage for this tab, so a reload does
// not sign the person out (Doubleslash Auctions ADR 0104). Nothing goes to localStorage or cookies.

import { getConfig } from "./config";

interface Tokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
}

interface Pending {
  verifier: string;
  state: string;
  returnTo: string;
}

const CALLBACK_PATH = "/signed-in";

let accessToken: { value: string; expiresAt: number } | null = null;
let refreshing: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function keys() {
  const { tenant } = getConfig();
  return { pending: `auction-site:${tenant}:pending`, refresh: `auction-site:${tenant}:refresh`, idToken: `auction-site:${tenant}:id` };
}

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The PKCE challenge for a verifier: base64url(SHA-256(verifier)). */
export async function challengeFor(verifier: string): Promise<string> {
  return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

/** Only paths on this site: a return address from the URL can never send someone elsewhere. */
export function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

function redirectUri() {
  return `${location.origin}${CALLBACK_PATH}`;
}

function tokenEndpoint() {
  return `${getConfig().authority}/protocol/openid-connect/token`;
}

function keep(tokens: Tokens) {
  accessToken = { value: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
  const k = keys();
  if (tokens.refresh_token) sessionStorage.setItem(k.refresh, tokens.refresh_token);
  if (tokens.id_token) sessionStorage.setItem(k.idToken, tokens.id_token);
  listeners.forEach((listener) => listener());
}

function forget() {
  accessToken = null;
  const k = keys();
  sessionStorage.removeItem(k.refresh);
  sessionStorage.removeItem(k.idToken);
  listeners.forEach((listener) => listener());
}

/** Whether someone is signed in on this tab (their access token may still need a refresh). */
export function isSignedIn(): boolean {
  return accessToken !== null || sessionStorage.getItem(keys().refresh) !== null;
}

/** Called whenever someone signs in or out. Returns the unsubscribe function. */
export function onAuthChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Sends the browser to the house's sign-in page; afterwards it comes back to `returnTo` on this site. */
export async function signIn(returnTo = location.pathname + location.search) {
  const { authority, clientId } = getConfig();
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const pending: Pending = { verifier, state, returnTo: safeReturnTo(returnTo) };
  sessionStorage.setItem(keys().pending, JSON.stringify(pending));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "openid email",
    redirect_uri: redirectUri(),
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "S256",
  });
  location.assign(`${authority}/protocol/openid-connect/auth?${params}`);
}

/** Finishes a sign-in on the callback page. Resolves to where the person was going. */
export async function completeSignIn(search: string): Promise<string> {
  const params = new URLSearchParams(search);
  const k = keys();
  const raw = sessionStorage.getItem(k.pending);
  sessionStorage.removeItem(k.pending);
  const pending = raw ? (JSON.parse(raw) as Pending) : null;
  const code = params.get("code");
  if (!pending || params.has("error") || !code || params.get("state") !== pending.state) {
    throw new Error("The sign-in could not be completed. Please try again.");
  }

  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getConfig().clientId,
      code,
      redirect_uri: redirectUri(),
      code_verifier: pending.verifier,
    }),
  });
  if (!response.ok) throw new Error("The sign-in could not be completed. Please try again.");
  keep((await response.json()) as Tokens);
  return pending.returnTo;
}

/** A valid access token, refreshed shortly before it expires; null when nobody is signed in. */
export async function getAccessToken(): Promise<string | null> {
  if (accessToken && accessToken.expiresAt - Date.now() > 30_000) return accessToken.value;
  const refreshToken = sessionStorage.getItem(keys().refresh);
  if (!refreshToken) {
    accessToken = null;
    return null;
  }

  // One refresh at a time: refresh tokens are single-use, so two parallel refreshes would sign the person out.
  refreshing ??= (async () => {
    try {
      const response = await fetch(tokenEndpoint(), {
        method: "POST",
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: getConfig().clientId, refresh_token: refreshToken }),
      });
      if (!response.ok) {
        forget();
        return null;
      }

      keep((await response.json()) as Tokens);
      return accessToken?.value ?? null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Ends the session here and at the house's realm, then comes back to the home page. */
export function signOut() {
  const { authority, clientId } = getConfig();
  const idToken = sessionStorage.getItem(keys().idToken);
  forget();
  const params = new URLSearchParams({ client_id: clientId, post_logout_redirect_uri: `${location.origin}/` });
  if (idToken) params.set("id_token_hint", idToken);
  location.assign(`${authority}/protocol/openid-connect/logout?${params}`);
}

/** The house's account page (password and email). */
export function accountUrl(): string {
  return `${getConfig().authority}/account`;
}
