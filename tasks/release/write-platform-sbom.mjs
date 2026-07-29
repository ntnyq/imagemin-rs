import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const versionsPath = requiredArgument("--versions");
  await writePlatformSbom({
    installationRoot: resolve(workspaceRoot, requiredArgument("--root")),
    outputPath: resolve(workspaceRoot, requiredArgument("--output")),
    platformDirectory: requiredArgument("--platform"),
    releaseVersion: requiredArgument("--version"),
    sharpVersions: JSON.parse(await readFile(resolve(workspaceRoot, versionsPath), "utf8")),
  });
}

export async function writePlatformSbom({
  installationRoot,
  outputPath,
  platformDirectory,
  releaseVersion,
  sharpVersions,
}) {
  assert(isNonEmptyString(platformDirectory), "Platform directory is missing");
  assert(isNonEmptyString(releaseVersion), "Release version is missing");
  assert(isObject(sharpVersions), "Sharp versions must be an object");

  const sharpPackages = await installedSharpPackages(installationRoot, platformDirectory);
  assert(sharpPackages.length > 0, "No installed @img/sharp platform package was found");
  const embedded = Object.entries(sharpVersions)
    .filter(([name, version]) => name !== "sharp" && isNonEmptyString(version))
    .map(([name, version]) => ({
      "bom-ref": `sharp-embedded:${platformDirectory}:${name}@${version}`,
      name,
      properties: [
        { name: "imagemin-rs:platform", value: platformDirectory },
        { name: "imagemin-rs:provider", value: "sharp.versions" },
      ],
      type: "library",
      version,
    }));
  assert(embedded.length > 0, "Sharp reported no embedded native libraries");

  const packageComponents = sharpPackages.map(({ component }) => component);
  const fileComponents = sharpPackages.flatMap(({ files }) => files);
  const components = [...packageComponents, ...embedded, ...fileComponents].sort((left, right) =>
    left["bom-ref"].localeCompare(right["bom-ref"]),
  );
  const rootReference = `platform-runtime:${platformDirectory}:imagemin-rs@${releaseVersion}`;
  const dependencies = [
    {
      dependsOn: [...packageComponents, ...embedded]
        .map((component) => component["bom-ref"])
        .sort(),
      ref: rootReference,
    },
    ...sharpPackages.map(({ component, files }) => ({
      dependsOn: files.map((file) => file["bom-ref"]).sort(),
      ref: component["bom-ref"],
    })),
  ].sort((left, right) => left.ref.localeCompare(right.ref));
  const serialSeed = JSON.stringify({
    components,
    dependencies,
    platformDirectory,
    releaseVersion,
  });
  const sbom = {
    bomFormat: "CycloneDX",
    components,
    dependencies,
    metadata: {
      component: {
        "bom-ref": rootReference,
        name: "imagemin-rs installed platform runtime",
        type: "application",
        version: releaseVersion,
      },
      properties: [{ name: "imagemin-rs:platform", value: platformDirectory }],
    },
    serialNumber: deterministicUuid(serialSeed),
    specVersion: "1.6",
    version: 1,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(sbom, undefined, 2)}\n`);
  return sbom;
}

async function installedSharpPackages(installationRoot, platformDirectory) {
  const scopeRoot = resolve(installationRoot, "node_modules/@img");
  const entries = await readdir(scopeRoot, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if (!entry.name.startsWith("sharp-")) continue;
    const packageRoot = resolve(scopeRoot, entry.name);
    const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
    assert(isNonEmptyString(manifest.name), `${entry.name} package name is missing`);
    assert(isNonEmptyString(manifest.version), `${entry.name} package version is missing`);
    const reference = npmPackageUrl(manifest.name, manifest.version);
    const component = {
      "bom-ref": reference,
      name: manifest.name,
      properties: [{ name: "imagemin-rs:platform", value: platformDirectory }],
      purl: reference,
      type: "library",
      version: manifest.version,
    };
    if (isNonEmptyString(manifest.license)) {
      component.licenses = [{ license: { name: manifest.license } }];
    }
    const files = [];
    for (const path of await nativeFiles(packageRoot)) {
      const data = await readFile(path);
      const name = portablePath(relative(installationRoot, path));
      files.push({
        "bom-ref": `native-file:${platformDirectory}:${name}`,
        hashes: [{ alg: "SHA-256", content: createHash("sha256").update(data).digest("hex") }],
        name,
        properties: [
          { name: "imagemin-rs:bytes", value: String(data.byteLength) },
          { name: "imagemin-rs:owner", value: manifest.name },
          { name: "imagemin-rs:platform", value: platformDirectory },
        ],
        type: "file",
      });
    }
    assert(files.length > 0, `${manifest.name} contains no native runtime file`);
    packages.push({ component, files });
  }

  return packages;
}

async function nativeFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && isNativeRuntimeFile(entry.name)) {
        files.push(path);
      }
    }
  }
  return files.sort();
}

function isNativeRuntimeFile(name) {
  return /\.(?:dll|dylib|node|wasm)$/u.test(name) || /\.so(?:\.\d+)*$/u.test(name);
}

function npmPackageUrl(name, version) {
  const encodedName = name.startsWith("@")
    ? `%40${name.slice(1).split("/").map(encodeURIComponent).join("/")}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function portablePath(path) {
  return sep === "/" ? path : path.split(sep).join("/");
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

function requiredArgument(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  const index = process.argv.indexOf(name);
  const value =
    direct === undefined
      ? index === -1
        ? undefined
        : process.argv[index + 1]
      : direct.slice(name.length + 1);
  assert(isNonEmptyString(value), `${name} is required`);
  return value;
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
