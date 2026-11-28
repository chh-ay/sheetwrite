import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const SOURCE_MAPS_MODE = "hidden-external";
const BASE64 = Object.fromEntries(
  [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map(
    (character, index) => [character, index],
  ),
);
const ATTRIBUTION_METHOD = "source-map-generated-spans-with-explicit-opaque-assets-v2";

function compressed_sizes(data) {
  return {
    rawBytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9, mtime: 0 }).byteLength,
    brotliBytes: brotliCompressSync(data, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
      },
    }).byteLength,
  };
}

function decode_vlq(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const character of segment) {
    const digit = BASE64[character];
    if (digit === undefined) throw new Error(`Invalid source-map VLQ character ${character}`);
    value += (digit & 31) << shift;
    if ((digit & 32) !== 0) {
      shift += 5;
      continue;
    }
    const negative = (value & 1) === 1;
    const decoded = value >> 1;
    values.push(negative ? -decoded : decoded);
    value = 0;
    shift = 0;
  }
  if (shift !== 0) throw new Error(`Truncated source-map VLQ segment ${segment}`);
  return values;
}

function decoded_mappings(map) {
  if (map.version !== 3 || !Array.isArray(map.sources) || typeof map.mappings !== "string") {
    throw new Error("Module attribution requires a non-indexed source map v3");
  }
  const lines = [];
  let source_index = 0;
  for (const encoded_line of map.mappings.split(";")) {
    let generated_column = 0;
    const mappings = [];
    for (const encoded_segment of encoded_line.split(",")) {
      if (encoded_segment.length === 0) continue;
      const fields = decode_vlq(encoded_segment);
      if (fields.length !== 1 && fields.length !== 4 && fields.length !== 5) {
        throw new Error(`Unsupported source-map segment width ${fields.length}`);
      }
      generated_column += fields[0];
      let source;
      if (fields.length >= 4) {
        source_index += fields[1];
        source = map.sources[source_index];
        if (typeof source !== "string") {
          throw new Error(`Source-map segment references missing source ${source_index}`);
        }
      }
      mappings.push({ generatedColumn: generated_column, source });
    }
    lines.push(mappings);
  }
  return lines;
}

function normalize_source(source, bundler) {
  const decoded = decodeURIComponent(source).replaceAll("\\", "/").split("!").at(-1).split("?")[0];
  const node_modules = decoded.lastIndexOf("/node_modules/");
  if (node_modules >= 0) {
    const package_path = decoded
      .slice(node_modules + "/node_modules/".length)
      .replace(/^\.pnpm\/[^/]+\/node_modules\//, "");
    const segments = package_path.split("/").filter(Boolean);
    const package_name = segments[0]?.startsWith("@")
      ? `${segments[0]}/${segments[1] ?? "missing"}`
      : (segments[0] ?? "missing");
    return { id: package_path, owner: package_name };
  }
  const workspace_core = decoded.lastIndexOf("/packages/core/");
  if (workspace_core >= 0) {
    return {
      id: `@sheetwrite/core/${decoded.slice(workspace_core + "/packages/core/".length)}`,
      owner: "@sheetwrite/core",
    };
  }
  const fixture = decoded.lastIndexOf("/test/bundler-fixtures/");
  if (fixture >= 0) {
    return {
      id: `fixture/${decoded.slice(fixture + "/test/bundler-fixtures/".length)}`,
      owner: "fixture",
    };
  }
  const source_index = decoded.lastIndexOf("/src/");
  if (source_index >= 0) {
    return { id: `fixture${decoded.slice(source_index)}`, owner: "fixture" };
  }
  const stable_fixture = decoded.replace(/^webpack:\/\/[^/]*\//, "").replace(/^\.\//, "");
  if (stable_fixture.startsWith("app/")) {
    return { id: `fixture/${stable_fixture}`, owner: "fixture" };
  }
  const stable = decoded
    .replace(/^webpack:\/\/[^/]*\//, "")
    .replace(/^file:\/\//, "")
    .replace(/^(?:\.\.\/)+/, "")
    .replace(/^\.\//, "")
    .replaceAll("\0", "virtual:");
  return {
    id:
      stable.length === 0
        ? `${bundler}:runtime`
        : stable.startsWith("/")
          ? `${bundler}:runtime/absolute`
          : `${bundler}:runtime/${stable}`,
    owner: `${bundler}:runtime`,
  };
}

async function source_map_for(asset_path, source) {
  const match = source.match(/\n?\/\/[#@] sourceMappingURL=([^\s]+)\s*$/);
  const map_path =
    match === null || match[1].startsWith("data:")
      ? `${asset_path}.map`
      : resolve(dirname(asset_path), decodeURIComponent(match[1]));
  try {
    return JSON.parse(await readFile(map_path, "utf8"));
  } catch (error) {
    throw new Error(`Module attribution requires an external source map for ${asset_path}`, {
      cause: error,
    });
  }
}

function append_span(spans, identity, text) {
  if (text.length === 0) return;
  const key = `${identity.owner}\0${identity.id}`;
  const previous = spans.get(key);
  if (previous === undefined) spans.set(key, { ...identity, parts: [text] });
  else previous.parts.push(text);
}

function attribute_source(source, map, bundler) {
  const spans = new Map();
  const mapping_lines = decoded_mappings(map);
  const generated_lines = source.split("\n");
  const runtime = { id: `${bundler}:runtime`, owner: `${bundler}:runtime` };
  for (let line_index = 0; line_index < generated_lines.length; line_index++) {
    const line =
      generated_lines[line_index] + (line_index + 1 < generated_lines.length ? "\n" : "");
    const content_length = generated_lines[line_index].length;
    const mappings = mapping_lines[line_index] ?? [];
    let cursor = 0;
    let owner = runtime;
    for (const mapping of mappings) {
      if (mapping.generatedColumn < cursor || mapping.generatedColumn > content_length) {
        throw new Error(`Source-map generated column escapes line ${line_index + 1}`);
      }
      append_span(spans, owner, line.slice(cursor, mapping.generatedColumn));
      owner =
        mapping.source === undefined
          ? runtime
          : normalize_source(`${map.sourceRoot ?? ""}${mapping.source}`, bundler);
      cursor = mapping.generatedColumn;
    }
    append_span(spans, owner, line.slice(cursor));
  }
  return spans;
}

function merge_spans(target, source) {
  for (const [key, identity] of source) {
    const previous = target.get(key);
    if (previous === undefined) target.set(key, identity);
    else previous.parts.push(...identity.parts);
  }
}

export async function attributeEntry({
  assetFiles,
  bundler,
  eagerImports,
  opaqueAssetFiles = [],
  entry,
  name,
  repositoryRoot,
  root,
}) {
  const selected = [...new Set(assetFiles)].sort();
  const opaque = new Set(opaqueAssetFiles);
  for (const file of opaque) {
    if (!selected.includes(file)) {
      throw new Error(`${bundler} ${name} declares a non-initial opaque asset ${file}`);
    }
  }
  if (selected.length === 0) throw new Error(`${bundler} ${name} has no initial JavaScript assets`);
  const spans = new Map();
  let generated_bytes = 0;
  const attributed_assets = [];
  for (const file of selected) {
    if (!file.endsWith(".js")) throw new Error(`Cannot attribute non-JavaScript asset ${file}`);
    const asset_path = resolve(root, file);
    if (asset_path !== root && !asset_path.startsWith(`${root}${sep}`)) {
      throw new Error(`Attribution asset escapes fixture output: ${file}`);
    }
    const content = await readFile(asset_path);
    const source = content.toString("utf8");
    generated_bytes += content.byteLength;
    attributed_assets.push({
      path: relative(repositoryRoot, asset_path).replaceAll("\\", "/"),
      sha256: createHash("sha256").update(content).digest("hex"),
    });
    if (opaque.has(file)) {
      append_span(
        spans,
        { id: `${bundler}:opaque/${file}`, owner: `${bundler}:opaque-framework` },
        source,
      );
    } else {
      merge_spans(
        spans,
        attribute_source(source, await source_map_for(asset_path, source), bundler),
      );
    }
  }
  const modules = [...spans.values()]
    .map(({ id, owner, parts }) => ({
      id,
      owner,
      attribution: owner === `${bundler}:opaque-framework` ? "opaque-asset" : "source-map",
      ...compressed_sizes(Buffer.from(parts.join(""))),
    }))
    .filter((module) => module.rawBytes > 0)
    .sort(
      (left, right) => left.id.localeCompare(right.id) || left.owner.localeCompare(right.owner),
    );
  const attributed_bytes = modules.reduce((sum, module) => sum + module.rawBytes, 0);
  if (attributed_bytes !== generated_bytes) {
    throw new Error(
      `${bundler} ${name} attributed ${attributed_bytes} of ${generated_bytes} generated bytes`,
    );
  }
  return {
    name,
    entry,
    eagerImports: [...new Set(eagerImports)].sort(),
    assets: attributed_assets,
    generatedBytes: generated_bytes,
    modules,
  };
}

export function attributionProvenance({ minifier, version }) {
  return {
    buildMode: "production",
    minified: true,
    minifier: { name: minifier, version },
    externals: [],
    target: "browser",
    sourceMaps: SOURCE_MAPS_MODE,
    attributionMethod: ATTRIBUTION_METHOD,
  };
}
