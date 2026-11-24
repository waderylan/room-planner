import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { validateDeploymentPolicy } from "../../scripts/check-deployment.mjs";
import { productionContentSecurityPolicy } from "../../server/securityPolicy";

const config = () =>
  ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
  ).config;
test("deployment policy accepts only the reviewed database and disables historical public URLs", () => {
  validateDeploymentPolicy(config());
  for (const patch of [
    { r2_buckets: [{ binding: "UPLOADS" }] },
    { ai: { binding: "AI" } },
    { analytics_engine_datasets: [{ binding: "EVENTS" }] },
    { preview_urls: true },
    { upload_source_maps: true },
    { observability: { enabled: true } },
    { usage_model: "standard" },
    { d1_databases: [] },
    { vars: { ALLOWED_ORIGINS: "https://attacker.test" } },
  ])
    assert.throws(() => validateDeploymentPolicy({ ...config(), ...patch }));
  const otherDatabase = config();
  otherDatabase.d1_databases[0].database_id =
    "00000000-0000-0000-0000-000000000000";
  assert.throws(() => validateDeploymentPolicy(otherDatabase));
});

test("production browser policy restricts scripts, API destinations and active content", () => {
  const policy = productionContentSecurityPolicy(
    "https://room-planner-service.rylanwwade.workers.dev/",
  );
  assert.match(policy, /script-src 'self';/);
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /form-action 'none'/);
  assert.ok(
    policy.includes("https://room-planner-service.rylanwwade.workers.dev"),
  );
  assert.ok(!policy.includes("connect-src *"));
  for (const url of [
    "http://api.example",
    "https://name:secret@api.example",
    "https://api.example/?x=1",
    "https://api.example/#x",
    "https://api.example:444/",
    "https://example.com';script-src*",
  ])
    assert.throws(() => productionContentSecurityPolicy(url));
});
