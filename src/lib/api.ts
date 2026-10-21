// The Auctions API, typed from the published OpenAPI document (openapi/auctions-v1.json, `pnpm gen:api`). Every call
// names the house (X-Tenant) and carries the access token when someone is signed in.

import createClient, { type Middleware } from "openapi-fetch";
import { getAccessToken } from "./auth";
import { getConfig } from "./config";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type LotCard = Schemas["LotCardDto"];
export type Lot = Schemas["LotDto"];
export type House = Schemas["HouseDto"];
export type Category = Schemas["CategoryDto"];

/** RFC 9457 problem details, as the API answers errors. */
export interface Problem {
  title?: string;
  detail?: string;
  status?: number;
  errors?: Record<string, string[]>;
}

/** An API error: the status and the problem details. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(status: number, problem: Problem | null) {
    super(problem?.detail ?? problem?.title ?? `The request failed (${status}).`);
    this.status = status;
    this.problem = problem ?? {};
  }

  /** The message for one field (validation errors), if any. */
  field(name: string): string | undefined {
    const entry = Object.entries(this.problem.errors ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return entry?.[1][0];
  }
}

const auth: Middleware = {
  async onRequest({ request }) {
    request.headers.set("X-Tenant", getConfig().tenant);
    const token = await getAccessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
};

let client: ReturnType<typeof createClient<paths>> | undefined;

/** The typed client: `api().GET("/api/v1/lots/search", …)`. Paths include /api/v1; the base is the API's origin. */
export function api() {
  if (!client) {
    client = createClient<paths>({ baseUrl: new URL(getConfig().api).origin });
    client.use(auth);
  }

  return client;
}

/** Unwraps an openapi-fetch result: the data, or an ApiError. */
export async function call<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw new ApiError(response.status, (error as Problem | undefined) ?? null);
  return data as T;
}

/** A photo's address (images are public and cacheable for ever). */
export function imageUrl(lotId: string, imageId: string): string {
  return `${getConfig().api}/lots/${lotId}/images/${imageId}`;
}

/** Uploads a photo of the caller's lot: the body is the file itself. */
export async function uploadPhoto(lotId: string, imageId: string, file: Blob): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`${getConfig().api}/lots/${lotId}/images/${imageId}`, {
    method: "PUT",
    body: file,
    headers: { "X-Tenant": getConfig().tenant, "Content-Type": file.type || "application/octet-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
}

/** A new id for something the caller creates (the API takes ids from the caller): UUID v7. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const now = Date.now();
  bytes[0] = Math.floor(now / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
