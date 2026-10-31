/**
 * Tests for the manifest validator: the seed plugins pass, and each catalog
 * rule rejects a broken manifest with a message that says what to fix.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RESERVED_SLUGS, validateCatalog, validateManifest } from "./validate.mjs";

const PLUGINS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "plugins");

/** A minimal manifest that passes every rule. */
function validManifest(overrides = {}) {
  return {
    $schema: "https://raw.githubusercontent.com/macch-ai/macch-plugins/main/schema/plugin.schema.json",
    slug: "acme-crm",
    name: "Acme CRM",
    summary: {
      "en-US": "Look up Acme CRM contacts.",
      "es-AR": "Buscá contactos de Acme CRM.",
      "pt-BR": "Pesquise contatos do Acme CRM.",
    },
    publisher: "Acme",
    server_url: "https://mcp.acme.example/mcp",
    connection: "operator",
    auth: "oauth",
    tools: { "search-contacts": { read_only: true } },
    ...overrides,
  };
}

/** Asserts the manifest fails with an error containing `fragment`. */
function assertRejected(manifest, fragment, filename = `${manifest.slug}.json`) {
  const { errors } = validateManifest(manifest, filename);
  assert.ok(
    errors.some((error) => error.includes(fragment)),
    `expected an error containing ${JSON.stringify(fragment)}, got ${JSON.stringify(errors)}`,
  );
}

test("every seed plugin passes", () => {
  const filenames = readdirSync(PLUGINS_DIR).filter((name) => name.endsWith(".json"));
  assert.ok(filenames.length >= 3);
  for (const filename of filenames) {
    const data = JSON.parse(readFileSync(join(PLUGINS_DIR, filename), "utf8"));
    assert.deepEqual(validateManifest(data, filename).errors, [], filename);
  }
});

test("a minimal valid manifest passes with no warnings", () => {
  assert.deepEqual(validateManifest(validManifest(), "acme-crm.json"), { errors: [], warnings: [] });
});

test("optional fields are accepted", () => {
  const manifest = validManifest({
    oauth: { scopes: "contacts.read contacts.write" },
    docs_url: "https://docs.acme.example/mcp",
    listed: false,
    review: 2,
  });
  assert.deepEqual(validateManifest(manifest, "acme-crm.json").errors, []);
});

test("each required field is enforced", () => {
  for (const field of ["slug", "name", "summary", "publisher", "server_url", "connection", "auth"]) {
    const manifest = validManifest();
    delete manifest[field];
    assertRejected(manifest, `missing required field "${field}"`, "acme-crm.json");
  }
});

test("empty strings count as missing", () => {
  assertRejected(validManifest({ name: "" }), "name:");
  assertRejected(validManifest({ publisher: "" }), "publisher:");
});

test("slug must be lowercase words joined by hyphens", () => {
  for (const slug of ["Acme", "acme_crm", "acme--crm", "-acme", "acme-"]) {
    assertRejected(validManifest({ slug }), "lowercase letters and digits");
  }
});

test("slug is at most 40 characters", () => {
  assertRejected(validManifest({ slug: "a".repeat(41) }), "slug: must NOT have more than 40 characters");
});

test("slug must equal the file name", () => {
  assertRejected(validManifest(), 'must equal the file name ("acme")', "acme.json");
});

test("reserved slugs are refused", () => {
  for (const slug of RESERVED_SLUGS) {
    assertRejected(validManifest({ slug }), `"${slug}" is reserved`);
  }
});

test("summary needs en-US and valid locale keys", () => {
  assertRejected(validManifest({ summary: { "es-AR": "Hola." } }), 'missing required field "en-US"');
  assertRejected(validManifest({ summary: { "en-US": "" } }), "summary.en-US:");
  assertRejected(validManifest({ summary: { "en-US": "Hi.", spanish: "Hola." } }), "locale keys");
});

test("missing es-AR or pt-BR is a warning, not an error", () => {
  const { errors, warnings } = validateManifest(validManifest({ summary: { "en-US": "Hi." } }), "acme-crm.json");
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 2);
  assert.ok(warnings[0].includes('"es-AR"'));
});

test("server_url and docs_url must use https", () => {
  assertRejected(validManifest({ server_url: "http://mcp.acme.example/mcp" }), "server_url: must be an https URL");
  assertRejected(validManifest({ docs_url: "http://docs.acme.example" }), "docs_url: must be an https URL");
  assertRejected(validManifest({ server_url: "https://" }), "server_url:");
});

test("connection and auth only take known values", () => {
  assertRejected(validManifest({ connection: "team" }), 'connection: must be one of "operator", "company"');
  assertRejected(validManifest({ auth: "basic" }), 'auth: must be one of "oauth", "api_key", "none"');
});

test("review must be a positive integer", () => {
  for (const review of [0, -1, 1.5, "2", true]) {
    assertRejected(validManifest({ review }), "review:");
  }
});

test("listed must be a boolean", () => {
  assertRejected(validManifest({ listed: "yes" }), "listed: must be boolean");
});

test("every tool needs a boolean read_only and nothing else", () => {
  assertRejected(validManifest({ tools: { search: {} } }), 'tools.search: missing required field "read_only"');
  assertRejected(validManifest({ tools: { search: { read_only: "true" } } }), "tools.search.read_only: must be boolean");
  assertRejected(
    validManifest({ tools: { search: { read_only: true, description: "x" } } }),
    'tools.search: unknown field "description"',
  );
});

test("oauth only takes scopes as a string", () => {
  assertRejected(validManifest({ oauth: { scopes: ["a", "b"] } }), "oauth.scopes: must be string");
  assertRejected(validManifest({ oauth: { client_secret: "x" } }), 'oauth: unknown field "client_secret"');
});

test("unknown top-level fields are refused", () => {
  assertRejected(validManifest({ icon: "https://acme.example/icon.png" }), 'unknown field "icon"');
});

test("a manifest that is not an object is refused", () => {
  assert.ok(validateManifest([], "acme-crm.json").errors.length > 0);
});

test("the catalog refuses duplicate slugs and broken JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "macch-plugins-"));
  writeFileSync(join(directory, "acme-crm.json"), JSON.stringify(validManifest()));
  writeFileSync(join(directory, "acme-copy.json"), JSON.stringify(validManifest()));
  writeFileSync(join(directory, "broken.json"), "{ not json");

  const results = validateCatalog(directory);

  assert.ok(results.get("acme-crm.json").errors.some((e) => e.includes('"acme-crm" is also used by acme-copy.json')));
  assert.ok(results.get("acme-copy.json").errors.some((e) => e.includes('"acme-crm" is also used by acme-crm.json')));
  assert.ok(results.get("broken.json").errors[0].startsWith("not valid JSON"));
});

test("tool names with spaces or dots are refused", () => {
  for (const bad of ["find work", "find.work"]) {
    const { errors } = validateManifest(validManifest({ tools: { [bad]: { read_only: true } } }), "acme-crm.json");
    assert.ok(errors.some((error) => error.includes("tools")), `expected an error for "${bad}"`);
  }
});

test("a tool name too long for the agent is refused", () => {
  const { errors } = validateManifest(validManifest({ tools: { ["x".repeat(60)]: { read_only: true } } }), "acme-crm.json");
  assert.ok(errors.some((error) => error.includes("longer than 64 characters")));
});

test("a reserved slug gets one clear error", () => {
  const { errors } = validateManifest(validManifest({ slug: "tickets" }), "tickets.json");
  assert.deepEqual(errors.filter((error) => error.startsWith("slug")), [
    'slug: "tickets" is reserved for Macch\'s own tools; pick another',
  ]);
});
