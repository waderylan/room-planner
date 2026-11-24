/** Only a public service origin belongs in this setting; credentials remain per invite. */
function configuredBase(): string {
  const raw = import.meta.env?.VITE_SERVICE_URL?.trim() ?? "";
  if (!raw) return "";
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("The Room Planner service URL is invalid.");
  }
  return url.href.replace(/\/$/, "");
}

export function serviceUrl(path: string): string {
  if (!path.startsWith("/api/") || path.startsWith("//"))
    throw new Error("Invalid service path.");
  return configuredBase() + path;
}

export const apiUrl = serviceUrl;

export function serviceIsConfigured(): boolean {
  return !!import.meta.env?.DEV || !!configuredBase();
}

export function serviceFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("x-room-planner-client", "1");
  return fetch(serviceUrl(path), {
    ...init,
    headers,
    credentials: "omit",
    cache: "no-store",
  });
}
