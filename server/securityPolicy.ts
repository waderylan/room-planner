/** Production-only browser policy. Development needs Vite's injected scripts and WebSocket. */
export function productionContentSecurityPolicy(serviceUrl = ""): string {
  let service = "";
  if (serviceUrl.trim()) {
    const url = new URL(serviceUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^[a-z0-9.-]+$/i.test(url.hostname) ||
      (url.port && url.port !== "443")
    )
      throw new Error("The production service must use a public HTTPS origin.");
    service = url.origin;
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${service} https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com`.replace(
      /\s+/g,
      " ",
    ),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}
