import { z } from "zod";

/** The response of the web app's `POST /api/services/token`. */
export type Credentials = { token: string; apiBaseUrl: string };

/** Returns credentials for the client's organization (called on every request, so a five-minute token can refresh). */
export type CredentialsProvider = () => Credentials | Promise<Credentials>;

/**
 * How requests reach the data plane, following Octokit's auth strategies. A sandbox uses `network`,
 * whose base URL (`http://api.grounded.internal`) sandboxd routes to the organization with a token.
 */
export type Auth =
  | { type: "token"; orgId: string; credentials: CredentialsProvider }
  | { type: "network"; baseUrl: string };

export type TokenAuth = Extract<Auth, { type: "token" }>;

export class GroundedError extends Error {
  readonly status: number;
  /** The `X-Request-Id` the data plane logged the request under. */
  readonly requestId: string | undefined;

  constructor(message: string, status: number, requestId: string | undefined) {
    super(requestId ? `${message} (request ${requestId})` : message);
    this.name = "GroundedError";
    this.status = status;
    this.requestId = requestId;
  }
}

const errorBody = z.object({ message: z.string() });

export class Api {
  constructor(readonly auth: Auth) {}

  /** Calls an organization route (such as `/repos`) and parses its JSON response. */
  async json<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    const body = schema.safeParse(await response.json());
    if (!body.success) {
      throw new Error(`Unexpected response from ${path}`, { cause: body.error });
    }

    return body.data;
  }

  /** Calls an organization route, throwing a `GroundedError` for an error status. */
  request(path: string, init: RequestInit = {}) {
    return this.#fetch(this.auth.type === "token" ? `/orgs/${this.auth.orgId}${path}` : path, init);
  }

  /** Calls a route outside the organization (such as `/deployment/models`), which needs token auth. */
  unscopedRequest(route: string, init: RequestInit = {}) {
    this.tokenAuth();

    return this.#fetch(route, init);
  }

  /** The token strategy, for what the network can't supply (such as a WebSocket's token). */
  tokenAuth(): TokenAuth {
    if (this.auth.type !== "token") {
      throw new Error("This call needs token auth");
    }

    return this.auth;
  }

  async #fetch(route: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    let baseUrl: string;
    if (this.auth.type === "token") {
      const { token, apiBaseUrl } = await this.auth.credentials();
      headers.set("Authorization", `Bearer ${token}`);
      baseUrl = apiBaseUrl;
    } else {
      baseUrl = this.auth.baseUrl;
    }
    if (init.body) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${baseUrl}${route}`, { ...init, headers });
    if (!response.ok) {
      const body = errorBody.safeParse(await response.json().catch(() => null));
      throw new GroundedError(
        body.success ? body.data.message : `${response.status} ${response.statusText}`,
        response.status,
        response.headers.get("X-Request-Id") ?? undefined,
      );
    }

    return response;
  }
}

/** Builds a query string from the defined values, repeating a key for each item of an array, e.g. `?ref=main`. */
export function query(params: Record<string, string | number | readonly string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of [value].flat()) {
      if (item !== undefined) {
        search.append(key, String(item));
      }
    }
  }

  const text = search.toString();
  return text ? `?${text}` : "";
}
