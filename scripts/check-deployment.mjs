import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** Prevent adding billed products or public historical versions by a routine deploy. Account plan is a separate provider setting. */
export function validateDeploymentPolicy(config) {
  const allowed = new Set([
    "$schema",
    "name",
    "main",
    "compatibility_date",
    "workers_dev",
    "preview_urls",
    "upload_source_maps",
    "send_metrics",
    "vars",
    "observability",
    "d1_databases",
  ]);
  if (
    !config ||
    typeof config !== "object" ||
    Object.keys(config).some((key) => !allowed.has(key))
  )
    throw new Error(
      "Deployment contains an unreviewed resource or setting. Free-only policy blocks deployment.",
    );
  if (
    config.main !== "server/service/worker.ts" ||
    config.name !== "room-planner-service"
  )
    throw new Error("Unexpected production Worker target.");
  if (
    config.preview_urls !== false ||
    config.upload_source_maps !== false ||
    config.send_metrics !== false
  )
    throw new Error(
      "Public version URLs, source maps, and CLI telemetry must stay disabled.",
    );
  if (
    !config.observability ||
    config.observability.enabled !== false ||
    Object.keys(config.observability).length !== 1
  )
    throw new Error("Worker observability must stay disabled.");
  if (
    !config.vars ||
    Object.keys(config.vars).some((key) => key !== "ALLOWED_ORIGINS") ||
    config.vars.ALLOWED_ORIGINS !== "https://waderylan.github.io"
  )
    throw new Error(
      "Unreviewed public variables or allowed origins. Never add credentials to Worker vars.",
    );
  if (!Array.isArray(config.d1_databases) || config.d1_databases.length !== 1)
    throw new Error("Only the existing D1 database is allowed.");
  const db = config.d1_databases[0];
  if (
    !db ||
    Object.keys(db).some(
      (key) => !["binding", "database_name", "database_id"].includes(key),
    ) ||
    db.binding !== "DB" ||
    db.database_name !== "room-planner-service" ||
    db.database_id !== "2546b111-5a12-49f6-8d60-7e98dc30dfdd"
  )
    throw new Error("Unreviewed production database binding.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filename = new URL("../wrangler.jsonc", import.meta.url);
  const parsed = ts.parseConfigFileTextToJson(
    filename.pathname,
    readFileSync(filename, "utf8"),
  );
  if (parsed.error) throw new Error("Invalid Worker configuration.");
  validateDeploymentPolicy(parsed.config);
  process.stdout.write(
    "Deployment policy passed: existing D1 only; version URLs, source maps and observability disabled.\n",
  );
}
