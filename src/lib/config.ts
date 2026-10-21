/** The house's settings, from public/config.js (window.SITE_CONFIG), so one build serves every environment. */
export interface SiteConfig {
  /** The house's sign-in realm, e.g. https://id.auction.example/realms/acme */
  authority: string;
  /** The realm's public client for own sites ("headless"). */
  clientId: string;
  /** The Auctions API including its version prefix, e.g. https://api.auction.example/api/v1 */
  api: string;
  /** The house's slug, sent as X-Tenant. */
  tenant: string;
  /** The house's terms of sale; when set, signing up asks to accept them. */
  termsUrl?: string | null;
}

/**
 * One configuration for many houses (a platform hosting this site at {slug}.<base domain>): set `tenantFromHost` to
 * the base domain and use "{tenant}" in `authority`; the house is the first part of the host name.
 */
export interface SharedSiteConfig extends Omit<SiteConfig, "tenant"> {
  tenant?: string;
  tenantFromHost?: string;
}

declare global {
  interface Window {
    SITE_CONFIG?: Partial<SharedSiteConfig>;
  }
}

export function readConfig(source: Partial<SharedSiteConfig> | undefined, host = typeof location === "undefined" ? "" : location.hostname): SiteConfig {
  const suffix = source?.tenantFromHost ? `.${source.tenantFromHost.replace(/^\./, "")}` : null;
  const fromHost = suffix && host.endsWith(suffix) ? host.slice(0, -suffix.length) : undefined;
  const tenant = source?.tenant ?? (fromHost && /^[a-z0-9-]+$/.test(fromHost) ? fromHost : undefined);
  const authority = tenant ? source?.authority?.replace("{tenant}", tenant) : source?.authority;
  const { clientId, api } = source ?? {};
  if (!authority || !clientId || !api || !tenant) {
    const missing = Object.entries({ authority, clientId, api, tenant }).filter(([, value]) => !value).map(([key]) => key);
    throw new Error(`public/config.js is missing ${missing.join(", ")}. See README "Configure".`);
  }

  return {
    authority: authority.replace(/\/+$/, ""),
    clientId,
    api: api.replace(/\/+$/, ""),
    tenant,
    termsUrl: source?.termsUrl ?? null,
  };
}

let cached: SiteConfig | undefined;

/** The site's settings (read once). */
export function getConfig(): SiteConfig {
  cached ??= readConfig(window.SITE_CONFIG);
  return cached;
}
