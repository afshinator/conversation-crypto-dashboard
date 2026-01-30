/**
 * HTTP client for outbound requests from api/ handlers (api/_lib so Vercel nft traces it).
 */

const DEFAULT_TIMEOUT_MS = 30_000;

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message?.toLowerCase().includes('fetch')) return true;
  if (error instanceof Error && (error.message === 'Failed to fetch' || error.message === 'NetworkError when attempting to fetch resource')) return true;
  return false;
}

function getTimeoutMs(override: number | undefined): number {
  return override ?? DEFAULT_TIMEOUT_MS;
}

function createTimeoutResponse<T>(): HttpResponse<T> {
  return {
    data: null,
    status: 0,
    headers: new Headers(),
    isOk: false,
    error: 'Request timeout',
  };
}

function createNetworkErrorResponse<T>(error: unknown): HttpResponse<T> {
  return {
    data: null,
    status: 0,
    headers: new Headers(),
    isOk: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export const HTTP_STATUS = {
  "OK-200": 200,
  "NOT_MODIFIED-304": 304,
  "BAD_REQUEST-400": 400,
  "UNAUTHORIZED-401": 401,
  "FORBIDDEN-403": 403,
  "NOT_FOUND-404": 404,
  "RATE_LIMITED-429": 429,
  "SERVER_ERROR-500": 500,
  "NETWORK_OR_CORS-0": 0,
} as const;

export type ResponseType = "json" | "text" | "blob" | "arraybuffer";

export interface HttpRequest {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string | number | boolean>;
  responseType?: ResponseType;
  timeout?: number;
}

export interface HttpResponse<T> {
  data: T | null;
  status: number;
  headers: Headers;
  isOk: boolean;
  error?: string;
}

export const HttpClient = {
  async request<T>(
    url: string,
    options: HttpRequest = {}
  ): Promise<HttpResponse<T>> {
    const {
      method = "GET",
      headers = {},
      body,
      params,
      responseType = "json",
      timeout,
    } = options;

    const fullUrl = new URL(url);
    if (params) {
      Object.entries(params).forEach(([k, v]) =>
        fullUrl.searchParams.append(k, String(v))
      );
    }

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutDuration = getTimeoutMs(timeout);

    try {
      const fetchPromise = fetch(fullUrl.toString(), {
        method,
        headers: {
          Accept: "application/json",
          ...headers,
        },
        body: body !== undefined
          ? typeof body === "object" && body !== null && !(body instanceof FormData)
            ? JSON.stringify(body)
            : (body as BodyInit)
          : undefined,
        cache: 'no-store',
        signal: controller.signal,
      });

      timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutDuration);

      let response: Response;
      try {
        response = await fetchPromise;
      } catch (fetchError: unknown) {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (isNetworkError(fetchError)) {
          return createNetworkErrorResponse<T>(fetchError);
        }
        if (controller.signal.aborted) {
          return createTimeoutResponse<T>();
        }
        return createNetworkErrorResponse<T>(fetchError);
      }

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (response.status === HTTP_STATUS["NOT_MODIFIED-304"]) {
        return {
          data: null,
          status: HTTP_STATUS["NOT_MODIFIED-304"],
          headers: response.headers,
          isOk: true,
        };
      }

      let data: unknown = null;

      try {
        if (responseType === "json") data = await response.json();
        else if (responseType === "blob") data = await response.blob();
        else if (responseType === "arraybuffer")
          data = await response.arrayBuffer();
        else data = await response.text();
      } catch {
        data = null;
      }

      return {
        data: data as T,
        status: response.status,
        headers: response.headers,
        isOk: response.ok,
        error: !response.ok ? `HTTP ${response.status}: ${response.statusText || 'Request failed'}` : undefined,
      };
    } catch (error: unknown) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (isNetworkError(error)) {
        return createNetworkErrorResponse<T>(error);
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return createTimeoutResponse<T>();
      }
      return createNetworkErrorResponse<T>(error);
    }
  },
};
