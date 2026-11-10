/**
 * Validates every plugin manifest in plugins/ against schema/plugin.schema.json
 * and the catalog rules a JSON Schema cannot express. Exits 1 when any
 * manifest is invalid, so pull requests fail before Macch reviews them.
 *
 * Usage: npm run validate
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGINS_DIR = join(ROOT, "plugins");
const SCHEMA_PATH = join(ROOT, "schema", "plugin.schema.json");

// Names of Macch's own built-in tool groups. The agent sees plugin tools as
// "<slug>_<tool>", so a plugin with one of these slugs would collide with them.
export const RESERVED_SLUGS = ["tickets", "customers", "hub", "memory", "tool"];

// Operators mostly speak Spanish or Portuguese; a missing translation is a
// warning, not a failure, because only en-US is required.
const RECOMMENDED_LOCALES = ["es-AR", "pt-BR"];

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

/**
 * Turns one Ajv error into a sentence that says what to fix.
 */
function describeSchemaError(error) {
  const field = error.instancePath ? error.instancePath.slice(1).replaceAll("/", ".") : "manifest";
  switch (error.keyword) {
    case "required":
      return `${field}: missing required field "${error.params.missingProperty}"`;
    case "additionalProperties":
      return `${field}: unknown field "${error.params.additionalProperty}"`;
    case "enum":
      return `${field}: must be one of ${error.params.allowedValues.map((v) => `"${v}"`).join(", ")}`;
    case "propertyNames":
      return `${field}: locale keys look like "en-US", "es-AR", or "pt-BR"`;
    case "pattern":
      if (field === "slug") {
        return 'slug: use lowercase letters and digits joined by single hyphens, like "my-plugin"';
      }
      if (/^suggestions\.\d+\.id$/.test(field)) {
        return `${field}: use lowercase letters and digits joined by single hyphens, like "find-invoice"`;
      }
      if (field === "server_url" || field === "docs_url") {
        return `${field}: must be an https URL`;
      }
      return `${field}: ${error.message}`;
    default:
      return `${field}: ${error.message}`;
  }
}

/**
 * Checks one parsed manifest. `filename` is the manifest's file name, such as
 * "notion.json". Returns the errors that block the pull request and the
 * warnings that only ask for improvements.
 */
const MAX_TOOL_NAME_CHARS = 64;

export function validateManifest(data, filename) {
  const errors = [];
  const warnings = [];
  if (!validateSchema(data)) {
    // propertyNames reports the same bad key twice (the key and its pattern).
    const unique = new Set(
      validateSchema.errors
        // Reserved slugs get a clearer message below than the schema's "not".
        .filter((error) => !(error.keyword === "pattern" && error.propertyName))
        .filter((error) => !(error.keyword === "not" && error.instancePath === "/slug"))
        .map(describeSchemaError),
    );
    errors.push(...unique);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { errors, warnings };
  }

  const expectedSlug = basename(filename, ".json");
  if (!filename.endsWith(".json")) {
    errors.push(`file name must end in .json`);
  } else if (data.slug !== expectedSlug) {
    errors.push(`slug: must equal the file name ("${expectedSlug}"), got "${data.slug}"`);
  }
  if (RESERVED_SLUGS.includes(data.slug)) {
    errors.push(`slug: "${data.slug}" is reserved for Macch's own tools; pick another`);
  }
  // The agent sees each tool as <slug>_<tool>, and model APIs cap tool names at 64 characters.
  if (typeof data.slug === "string" && data.tools && typeof data.tools === "object") {
    for (const name of Object.keys(data.tools)) {
      if (data.slug.length + 1 + name.length > MAX_TOOL_NAME_CHARS) {
        errors.push(
          `tools: "${name}" makes "${data.slug}_${name}" longer than ${MAX_TOOL_NAME_CHARS} characters; use a shorter tool name`,
        );
      }
    }
  }

  if (data.summary && typeof data.summary === "object") {
    for (const locale of RECOMMENDED_LOCALES) {
      if (!data.summary[locale]) {
        warnings.push(`summary: add a "${locale}" translation; most Macch operators read it`);
      }
    }
  }
  if (Array.isArray(data.suggestions)) {
    const seen = new Set();
    for (const suggestion of data.suggestions) {
      if (!suggestion || typeof suggestion !== "object") continue;
      // Macch prefixes each id with the slug, so ids only need to be unique here.
      if (seen.has(suggestion.id)) {
        errors.push(`suggestions: "${suggestion.id}" is used twice; give each question its own id`);
      }
      seen.add(suggestion.id);
      for (const locale of RECOMMENDED_LOCALES) {
        if (suggestion.text && typeof suggestion.text === "object" && !suggestion.text[locale]) {
          warnings.push(
            `suggestions: add a "${locale}" text to "${suggestion.id}"; most Macch operators read it`,
          );
        }
      }
    }
  }
  return { errors, warnings };
}

/**
 * Validates every manifest in a directory, including that no two share a slug.
 * Returns a map from file name to its errors and warnings.
 */
export function validateCatalog(directory = PLUGINS_DIR) {
  const results = new Map();
  const filesBySlug = new Map();
  const filenames = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort();

  for (const filename of filenames) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(directory, filename), "utf8"));
    } catch (error) {
      results.set(filename, { errors: [`not valid JSON: ${error.message}`], warnings: [] });
      continue;
    }
    results.set(filename, validateManifest(data, filename));
    if (typeof data?.slug === "string") {
      filesBySlug.set(data.slug, [...(filesBySlug.get(data.slug) ?? []), filename]);
    }
  }

  for (const [slug, files] of filesBySlug) {
    if (files.length > 1) {
      for (const filename of files) {
        const others = files.filter((other) => other !== filename).join(", ");
        results.get(filename).errors.push(`slug: "${slug}" is also used by ${others}`);
      }
    }
  }
  return results;
}

function main() {
  const results = validateCatalog();
  let failed = 0;
  for (const [filename, { errors, warnings }] of results) {
    const path = `plugins/${filename}`;
    if (errors.length) {
      failed += 1;
      console.error(`FAIL ${path}`);
      for (const error of errors) console.error(`  - ${error}`);
    } else {
      console.log(`ok   ${path}`);
    }
    for (const warning of warnings) console.warn(`  warning: ${warning}`);
  }
  if (results.size === 0) {
    console.error("No manifests found in plugins/.");
    process.exit(1);
  }
  if (failed) {
    console.error(`\n${failed} of ${results.size} manifest(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.size} manifest(s) are valid.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
