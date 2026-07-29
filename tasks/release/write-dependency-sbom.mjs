import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await writeDependencySbom({
    outputPath: resolve(
      workspaceRoot,
      readArgument("--output") ?? ".release/npm/release-dependencies.cdx.json",
    ),
    rootPath: resolve(workspaceRoot, readArgument("--root") ?? workspaceRoot),
  });
}

export async function writeDependencySbom({ outputPath, rootPath }) {
  const [cargoMetadata, cargoLock, npmTree, publicManifest] = await Promise.all([
    cargoMetadataFor(rootPath),
    readFile(resolve(rootPath, "Cargo.lock"), "utf8"),
    npmDependencyTree(rootPath),
    readJson(resolve(rootPath, "packages/imagemin/package.json")),
  ]);
  const cargo = cargoInventory(cargoMetadata, cargoLock);
  const npm = await npmInventory(npmTree);
  assert(
    publicManifest.version === npmTree.version,
    `Public manifest ${publicManifest.version} does not match installed tree ${npmTree.version}`,
  );

  const rootReference = `dependency-closure:imagemin-rs@${publicManifest.version}`;
  const components = [...cargo.components, ...npm.components].sort(compareBomReferences);
  const dependencies = mergeDependencies([
    ...cargo.dependencies,
    ...npm.dependencies,
    {
      dependsOn: [...cargo.rootReferences, ...npm.rootDependencies],
      ref: rootReference,
    },
  ]);
  const serialSeed = JSON.stringify({
    components,
    dependencies,
    version: publicManifest.version,
  });
  const sbom = {
    bomFormat: "CycloneDX",
    components,
    dependencies,
    metadata: {
      component: {
        "bom-ref": rootReference,
        name: "imagemin-rs dependency closure",
        type: "application",
        version: publicManifest.version,
      },
      properties: [
        {
          name: "imagemin-rs:cargo-profile",
          value: "N-API and WASM non-dev locked closures",
        },
        { name: "imagemin-rs:npm-profile", value: "production dependency closure" },
      ],
    },
    serialNumber: deterministicUuid(serialSeed),
    specVersion: "1.6",
    version: 1,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(sbom, undefined, 2)}\n`);
  return sbom;
}

async function cargoMetadataFor(rootPath) {
  const { stdout } = await execFileAsync(
    "cargo",
    ["metadata", "--locked", "--format-version", "1"],
    {
      cwd: rootPath,
      maxBuffer: 30_000_000,
    },
  );
  return JSON.parse(stdout);
}

async function npmDependencyTree(rootPath) {
  const arguments_ = ["--filter", "imagemin-rs", "list", "--prod", "--depth", "Infinity", "--json"];
  const npmExecPath = process.env.npm_execpath;
  const usePnpmCli = npmExecPath !== undefined && /(?:^|[/\\])pnpm(?:\.c?js)?$/iu.test(npmExecPath);
  const useWindowsShell = !usePnpmCli && process.platform === "win32";
  const executable = usePnpmCli
    ? process.execPath
    : useWindowsShell
      ? (process.env.ComSpec ?? "cmd.exe")
      : "pnpm";
  const commandArguments = usePnpmCli
    ? [npmExecPath, ...arguments_]
    : useWindowsShell
      ? ["/d", "/s", "/c", "pnpm", ...arguments_]
      : arguments_;
  const { stdout } = await execFileAsync(executable, commandArguments, {
    cwd: rootPath,
    maxBuffer: 30_000_000,
  });
  const roots = JSON.parse(stdout);
  assert(
    Array.isArray(roots) && roots.length === 1,
    "Expected one imagemin-rs npm dependency root",
  );
  return roots[0];
}

function cargoInventory(metadata, cargoLock) {
  const packages = new Map(metadata.packages.map((package_) => [package_.id, package_]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const rootPackages = ["imagemin_napi", "imagemin_wasm_core"].map((name) => {
    const package_ = metadata.packages.find(
      (candidate) => candidate.name === name && candidate.source === null,
    );
    assert(package_ !== undefined, `Could not find the ${name} Cargo package`);
    return package_;
  });
  const reachable = new Set();
  const pending = rootPackages.map((package_) => package_.id);

  while (pending.length > 0) {
    const id = pending.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = nodes.get(id);
    assert(node !== undefined, `Cargo metadata has no resolve node for ${id}`);
    for (const dependency of releaseCargoDependencies(node)) {
      pending.push(dependency.pkg);
    }
  }

  const checksums = cargoChecksums(cargoLock);
  const componentById = new Map();
  const idByReference = new Map();
  for (const id of reachable) {
    const package_ = packages.get(id);
    assert(package_ !== undefined, `Cargo metadata has no package for ${id}`);
    const component = cargoComponent(package_, checksums);
    assert(
      !idByReference.has(component["bom-ref"]),
      `Duplicate Cargo component reference ${component["bom-ref"]}`,
    );
    idByReference.set(component["bom-ref"], id);
    componentById.set(id, component);
  }

  const dependencies = [];
  for (const id of reachable) {
    const node = nodes.get(id);
    const component = componentById.get(id);
    dependencies.push({
      dependsOn: releaseCargoDependencies(node)
        .filter((dependency) => reachable.has(dependency.pkg))
        .map((dependency) => componentById.get(dependency.pkg)["bom-ref"]),
      ref: component["bom-ref"],
    });
  }

  return {
    components: [...componentById.values()],
    dependencies,
    rootReferences: rootPackages.map((package_) => componentById.get(package_.id)["bom-ref"]),
  };
}

function releaseCargoDependencies(node) {
  return node.deps.filter(
    (dependency) =>
      dependency.dep_kinds.length === 0 || dependency.dep_kinds.some((kind) => kind.kind !== "dev"),
  );
}

function cargoComponent(package_, checksums) {
  const reference =
    package_.source === null
      ? `cargo-workspace:${package_.name}@${package_.version}`
      : cargoPackageUrl(package_.name, package_.version);
  const component = {
    "bom-ref": reference,
    name: package_.name,
    properties: [{ name: "imagemin-rs:ecosystem", value: "cargo" }],
    type: "library",
    version: package_.version,
  };
  if (package_.source !== null) component.purl = cargoPackageUrl(package_.name, package_.version);
  if (package_.license !== null) component.licenses = [{ expression: package_.license }];
  if (package_.repository !== null) {
    component.externalReferences = [{ type: "vcs", url: package_.repository }];
  }
  const checksum = checksums.get(
    cargoLockKey(package_.name, package_.version, package_.source ?? ""),
  );
  if (checksum !== undefined) component.hashes = [{ alg: "SHA-256", content: checksum }];
  return component;
}

function cargoChecksums(cargoLock) {
  const checksums = new Map();
  for (const block of cargoLock.split(/^\[\[package\]\]\r?\n/gmu).slice(1)) {
    const name = cargoString(block, "name");
    const version = cargoString(block, "version");
    const source = cargoString(block, "source") ?? "";
    const checksum = cargoString(block, "checksum");
    if (name !== undefined && version !== undefined && checksum !== undefined) {
      assert(/^[\da-f]{64}$/u.test(checksum), `Invalid Cargo checksum for ${name}@${version}`);
      checksums.set(cargoLockKey(name, version, source), checksum);
    }
  }
  return checksums;
}

function cargoString(block, field) {
  const match = block.match(new RegExp(`^${field} = ("(?:[^"\\\\]|\\\\.)*")$`, "mu"));
  return match === null ? undefined : JSON.parse(match[1]);
}

function cargoLockKey(name, version, source) {
  return `${name}\0${version}\0${source}`;
}

async function npmInventory(root) {
  assert(isObject(root.dependencies), "The imagemin-rs npm dependency tree is empty");
  const components = new Map();
  const dependencyMap = new Map();
  const expandedPaths = new Set();

  async function visit(name, dependency) {
    assert(isObject(dependency), `Invalid npm dependency ${name}`);
    assert(isNonEmptyString(dependency.path), `npm dependency ${name} has no installed path`);
    assert(isNonEmptyString(dependency.version), `npm dependency ${name} has no version`);
    const manifest = await readOptionalNpmManifest(dependency.path);
    const packageName = isNonEmptyString(manifest.name) ? manifest.name : name;
    const reference = npmPackageUrl(packageName, dependency.version);

    if (!components.has(reference)) {
      components.set(
        reference,
        npmComponent(manifest, packageName, dependency.version, reference, dependency.resolved),
      );
    }
    if (expandedPaths.has(dependency.path)) return reference;
    expandedPaths.add(dependency.path);

    const childReferences = [];
    for (const [childName, child] of Object.entries(dependency.dependencies ?? {})) {
      childReferences.push(await visit(childName, child));
    }
    const existing = dependencyMap.get(reference) ?? new Set();
    for (const childReference of childReferences) existing.add(childReference);
    dependencyMap.set(reference, existing);
    return reference;
  }

  const rootDependencies = [];
  for (const [name, dependency] of Object.entries(root.dependencies)) {
    rootDependencies.push(await visit(name, dependency));
  }

  return {
    components: [...components.values()],
    dependencies: [...dependencyMap].map(([ref, dependsOn]) => ({
      dependsOn: [...dependsOn],
      ref,
    })),
    rootDependencies,
  };
}

function npmComponent(manifest, name, version, reference, resolved) {
  const component = {
    "bom-ref": reference,
    name,
    properties: [{ name: "imagemin-rs:ecosystem", value: "npm" }],
    purl: reference,
    type: "library",
    version,
  };
  if (isNonEmptyString(manifest.license)) {
    component.licenses = [{ license: { name: manifest.license } }];
  }
  const references = [];
  if (isNonEmptyString(resolved)) references.push({ type: "distribution", url: resolved });
  const repository = repositoryUrl(manifest.repository);
  if (repository !== undefined) references.push({ type: "vcs", url: repository });
  if (isNonEmptyString(manifest.homepage)) {
    references.push({ type: "website", url: manifest.homepage });
  }
  if (references.length > 0) component.externalReferences = references;
  return component;
}

function repositoryUrl(repository) {
  if (isNonEmptyString(repository)) return repository;
  if (isObject(repository) && isNonEmptyString(repository.url)) return repository.url;
  return undefined;
}

function mergeDependencies(entries) {
  const dependencies = new Map();
  for (const entry of entries) {
    const current = dependencies.get(entry.ref) ?? new Set();
    for (const reference of entry.dependsOn) current.add(reference);
    dependencies.set(entry.ref, current);
  }
  return [...dependencies]
    .map(([ref, dependsOn]) => ({
      dependsOn: [...dependsOn].sort(),
      ref,
    }))
    .sort((left, right) => left.ref.localeCompare(right.ref));
}

function compareBomReferences(left, right) {
  return left["bom-ref"].localeCompare(right["bom-ref"]);
}

function cargoPackageUrl(name, version) {
  return `pkg:cargo/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function npmPackageUrl(name, version) {
  const encodedName = name.startsWith("@")
    ? `%40${name.slice(1).split("/").map(encodeURIComponent).join("/")}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
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

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readOptionalNpmManifest(path) {
  try {
    return await readJson(resolve(path, "package.json"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
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
