import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await writeBundleSbom({
    manifestPath: resolve(
      workspaceRoot,
      readArgument("--manifest") ?? ".release/npm/release-manifest.json",
    ),
    outputPath: resolve(
      workspaceRoot,
      readArgument("--output") ?? ".release/npm/release-sbom.cdx.json",
    ),
    pinsPath: resolve(workspaceRoot, readArgument("--pins") ?? "tasks/sidecars/pins.json"),
  });
}

export async function writeBundleSbom({ manifestPath, outputPath, pinsPath }) {
  const [bundle, pins] = await Promise.all([
    readJson(manifestPath, "release manifest"),
    readJson(pinsPath, "sidecar pins"),
  ]);
  const sbom = createBundleSbom(bundle, pins);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(sbom, undefined, 2)}\n`);
  return sbom;
}

export function createBundleSbom(bundle, pins) {
  assert(
    bundle?.artifactMode === "all" || bundle?.artifactMode === "current",
    "Release manifest artifactMode must be all or current",
  );
  assert(isNonEmptyString(bundle.version), "Release manifest version is missing");
  assert(
    Array.isArray(bundle.packages) && bundle.packages.length > 0,
    "Release packages are missing",
  );
  assert(isObject(pins), "Sidecar pins must be an object");

  const packageComponents = bundle.packages.map(packageComponent);
  const sourceComponents = Object.entries(pins).flatMap(([tool, pin]) => {
    assert(isObject(pin), `Invalid ${tool} sidecar pin`);
    assert(isObject(pin.sources), `Sidecar pin ${tool} has no sources`);
    return Object.entries(pin.sources).map(([name, source]) => sourceComponent(tool, name, source));
  });
  const components = [...packageComponents, ...sourceComponents].sort((left, right) =>
    left["bom-ref"].localeCompare(right["bom-ref"]),
  );
  const rootReference = `release-bundle:${bundle.version}:${bundle.artifactMode}`;
  const serialSeed = JSON.stringify({
    artifactMode: bundle.artifactMode,
    components,
    version: bundle.version,
  });

  return {
    bomFormat: "CycloneDX",
    components,
    dependencies: [
      {
        dependsOn: components.map((component) => component["bom-ref"]),
        ref: rootReference,
      },
    ],
    metadata: {
      component: {
        "bom-ref": rootReference,
        name: "imagemin-rs release bundle",
        type: "application",
        version: bundle.version,
      },
      properties: [
        {
          name: "imagemin-rs:artifact-mode",
          value: bundle.artifactMode,
        },
      ],
    },
    serialNumber: deterministicUuid(serialSeed),
    specVersion: "1.6",
    version: 1,
  };
}

function packageComponent(descriptor) {
  assert(isObject(descriptor), "Invalid release package descriptor");
  for (const field of ["integrity", "name", "tarball", "version"]) {
    assert(isNonEmptyString(descriptor[field]), `Release package ${field} is missing`);
  }
  assert(
    Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0,
    `Release package ${descriptor.name} has invalid bytes`,
  );
  const digest = sha512Digest(descriptor.integrity, descriptor.name);

  return {
    "bom-ref": `npm:${descriptor.name}@${descriptor.version}`,
    hashes: [{ alg: "SHA-512", content: digest }],
    name: descriptor.name,
    properties: [
      { name: "imagemin-rs:tarball", value: descriptor.tarball },
      { name: "imagemin-rs:bytes", value: String(descriptor.bytes) },
    ],
    type: "library",
    version: descriptor.version,
  };
}

function sourceComponent(tool, name, source) {
  assert(isObject(source), `Invalid source ${tool}/${name}`);
  assert(isNonEmptyString(source.version), `Source ${tool}/${name} version is missing`);
  assert(
    typeof source.sha256 === "string" && /^[\da-f]{64}$/u.test(source.sha256),
    `Source ${tool}/${name} has invalid sha256`,
  );
  assert(isNonEmptyString(source.url), `Source ${tool}/${name} URL is missing`);

  return {
    "bom-ref": `source:${tool}:${name}@${source.version}`,
    externalReferences: [{ type: "distribution", url: source.url }],
    hashes: [{ alg: "SHA-256", content: source.sha256 }],
    name,
    properties: [{ name: "imagemin-rs:sidecar-tool", value: tool }],
    type: "library",
    version: source.version,
  };
}

function sha512Digest(integrity, name) {
  const prefix = "sha512-";
  assert(integrity.startsWith(prefix), `Release package ${name} has invalid integrity`);
  const encoded = integrity.slice(prefix.length);
  assert(/^[\d+/A-Za-z]+={0,2}$/u.test(encoded), `Release package ${name} has invalid integrity`);
  const digest = Buffer.from(encoded, "base64");
  assert(
    digest.byteLength === 64 && digest.toString("base64") === encoded,
    `Release package ${name} has invalid integrity`,
  );
  return digest.toString("hex");
}

function deterministicUuid(value) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label}: ${path}`, { cause: error });
  }
}

function readArgument(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct !== undefined) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
