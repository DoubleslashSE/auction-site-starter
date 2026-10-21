// The house's settings, read at start-up (window.SITE_CONFIG). Replace this file when you deploy: the built site stays
// the same for every environment. See README "Configure".
window.SITE_CONFIG = {
  // The house's sign-in (its realm) and the public client for its own sites.
  authority: "http://localhost:8680/realms/acme",
  clientId: "headless",
  // The Auctions API including its version prefix.
  api: "http://localhost:4600/api/v1",
  // The house's slug, sent as X-Tenant on every call.
  tenant: "acme",
  // Optional: the house's terms of sale. When set, signing up asks to accept them.
  termsUrl: null,
};
