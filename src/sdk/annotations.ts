import { z } from "zod";

import { GroundedError } from "./api.ts";
import type { Evaluation } from "./genai.ts";
import { type Repos, decodeContent } from "./repos.ts";

const HTTP_NOT_FOUND = 404;
const GROUNDED_NAME_PREFIX = "grounded/";
const GROUNDED_SCHEMAS_DIR = ".grounded/annotations";
const SCHEMAS_DIR = "annotations";
/** The directories an Agent repo's annotation schemas live in, Grounded's first. */
export const ANNOTATION_SCHEMA_DIRS = [GROUNDED_SCHEMAS_DIR, SCHEMAS_DIR];
const SCHEMA_PATH_PATTERN = /^(\.grounded\/)?annotations\/([^/]+)\.json$/;
const RESERVED_SCHEMA_PATH = "annotations/grounded.json";
const REGEXP_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

type JsonSchema = z.core.JSONSchema.JSONSchema;

/** The annotation result fields validated by a name's schema. */
export type AnnotationFields = Pick<
  Evaluation,
  "name" | "value" | "label" | "explanation" | "description" | "raw"
>;

/** Whether Grounded owns an annotation name, which its own schemas define. */
export const isGroundedAnnotation = (name: string) => name.startsWith(GROUNDED_NAME_PREFIX);

/**
 * The schema file that defines an annotation name: `.grounded/annotations/<segment>.json` for a
 * name under `grounded/`, and `annotations/<segment>.json` for any other.
 */
export function getAnnotationSchemaPath(name: string) {
  const grounded = isGroundedAnnotation(name);
  const [segment = ""] = (grounded ? name.slice(GROUNDED_NAME_PREFIX.length) : name).split("/");
  if (segment === "" || (!grounded && segment === "grounded")) {
    return undefined;
  }

  return grounded ? `.grounded/annotations/${segment}.json` : `annotations/${segment}.json`;
}

/**
 * An Agent repo's annotation schemas, keyed by their path. A name's first segment picks exactly
 * one schema, and that schema validates the whole annotation.
 */
export class AnnotationRegistry {
  private readonly schemas: ReadonlyMap<string, z.ZodType>;

  private constructor(schemas: ReadonlyMap<string, z.ZodType>) {
    this.schemas = schemas;
  }

  /**
   * Imports parsed schema files by path. It refuses a path no name maps to, a `name.pattern` that
   * doesn't start with the name prefix its path implies, and a schema Zod can't import.
   */
  static parse(files: ReadonlyMap<string, JsonSchema>) {
    const schemas = new Map<string, z.ZodType>();
    for (const [path, schema] of files) {
      const prefix = getNamePrefix(path);
      if (prefix === undefined) {
        throw new Error(`${path} isn't an annotation schema path`);
      }
      checkNamePattern(path, prefix, schema);
      schemas.set(path, importSchema(path, schema));
    }

    return new AnnotationRegistry(schemas);
  }

  /** Why an annotation doesn't fit its name's schema, or undefined when it does. */
  problemWith({ name, value, label, explanation, description, raw }: AnnotationFields) {
    const path = getAnnotationSchemaPath(name);
    const schema = path === undefined ? undefined : this.schemas.get(path);
    if (schema === undefined) {
      return `${name} has no annotation schema${path === undefined ? "" : ` at ${path}`}`;
    }

    const fields = Object.fromEntries(
      // The API returns `value: null` for an annotation without a score.
      Object.entries({ name, value, label, explanation, description, raw }).filter(
        ([, field]) => field !== undefined && field !== null,
      ),
    );
    const result = schema.safeParse(fields);
    return result.success
      ? undefined
      : `${name} doesn't match ${path}: ${z.prettifyError(result.error)}`;
  }
}

/** Loads an Agent repo's annotation schemas from `ANNOTATION_SCHEMA_DIRS` with `parseAnnotationRegistry`. */
export async function loadAnnotationRegistry(
  repos: Repos,
  { repo, ref }: { repo: string; ref?: string | undefined },
) {
  const listings = await Promise.all(
    ANNOTATION_SCHEMA_DIRS.map((path) => listSchemaFiles(repos, { repo, ref, path })),
  );
  const files = new Map<string, string>();
  for (const entry of listings.flat()) {
    if (entry.type === "file" && entry.path.endsWith(".json")) {
      files.set(entry.path, decodeContent(entry, entry.path));
    }
  }

  return parseAnnotationRegistry(files);
}

/**
 * Parses an Agent repo's annotation schema files, given each one's text by path. It fails without
 * a schema in `.grounded/annotations/`, which Grounded seeds every Agent repo with.
 */
export function parseAnnotationRegistry(files: ReadonlyMap<string, string>) {
  const paths = [...files.keys()];
  if (!paths.some((path) => path.startsWith(`${GROUNDED_SCHEMAS_DIR}/`))) {
    throw new Error(
      `There's no schema in ${GROUNDED_SCHEMAS_DIR}/, so annotations can't be checked`,
    );
  }

  const schemas = new Map<string, JsonSchema>();
  for (const [path, text] of files) {
    schemas.set(path, readSchema(path, text));
  }

  return AnnotationRegistry.parse(schemas);
}

async function listSchemaFiles(
  repos: Repos,
  options: { repo: string; ref: string | undefined; path: string },
) {
  try {
    return await repos.listContents(options);
  } catch (error) {
    if (error instanceof GroundedError && error.status === HTTP_NOT_FOUND) {
      return [];
    }
    throw error;
  }
}

function readSchema(path: string, text: string): JsonSchema {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} isn't a JSON file`, { cause: error });
  }
}

/** The literal start of every name a schema path defines, like `grounded/issue` for `.grounded/annotations/issue.json`. */
function getNamePrefix(path: string) {
  const match = SCHEMA_PATH_PATTERN.exec(path);
  if (match === null || path === RESERVED_SCHEMA_PATH) {
    return undefined;
  }

  const [, grounded, segment] = match;
  return grounded === undefined ? segment : `${GROUNDED_NAME_PREFIX}${segment}`;
}

function checkNamePattern(path: string, prefix: string, schema: JsonSchema) {
  const name = schema.properties?.name;
  const pattern = name === undefined || name === true || name === false ? undefined : name.pattern;
  const start = `^${prefix.replace(REGEXP_SPECIAL_CHARS, "\\$&")}`;
  if (pattern !== `${start}$` && !pattern?.startsWith(`${start}/`)) {
    throw new Error(`${path} must give name a pattern starting with ${start}$ or ${start}/`);
  }
}

function importSchema(path: string, schema: JsonSchema) {
  try {
    return z.fromJSONSchema(schema);
  } catch (error) {
    throw new Error(`${path} isn't a JSON Schema that z.fromJSONSchema can import`, {
      cause: error,
    });
  }
}
