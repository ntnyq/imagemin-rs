import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const execFileAsync = promisify(execFile);

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const policy = JSON.parse(
    await readFile(resolve(workspaceRoot, "security/native-dependency-policy.json"), "utf8"),
  );
  console.log(JSON.stringify(await verifyAomSecurity(policy), undefined, 2));
}

export async function verifyAomSecurity(policy, readEndpoint = readGitilesWithCurl) {
  const aom = policy?.aom;
  assert(policy?.schema === 1, "Unsupported native dependency policy");
  assert(typeof aom?.repository === "string", "AOM repository is missing");
  assert(/^\d+\.\d+\.\d+$/u.test(aom?.version), "AOM version is invalid");
  assert(isCommit(aom?.tagCommit), "AOM tag commit is invalid");
  assert(
    Array.isArray(aom?.requiredFixCommits) && aom.requiredFixCommits.length > 0,
    "AOM fix commits are missing",
  );

  const endpoint = `${aom.repository}/+log/refs/tags/v${aom.version}?format=JSON&n=1000`;
  const result = parseGitilesJson(await readEndpoint(endpoint));
  assert(
    result.log?.[0]?.commit === aom.tagCommit,
    `AOM v${aom.version} does not resolve to the approved tag commit`,
  );
  const history = new Set(result.log.map(({ commit }) => commit));
  const assertions = aom.requiredFixCommits.map((fix) => {
    assert(isCommit(fix?.commit), "AOM fix commit is invalid");
    assert(typeof fix?.reason === "string" && fix.reason.length > 0, "AOM fix reason is missing");
    assert(
      history.has(fix.commit),
      `AOM v${aom.version} history does not contain required fix ${fix.commit}`,
    );
    return {
      fixCommit: fix.commit,
      reason: fix.reason,
      tagCommit: aom.tagCommit,
      version: aom.version,
    };
  });
  return { assertions, repository: aom.repository };
}

async function readGitilesWithCurl(endpoint) {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "--connect-timeout",
      "15",
      "--fail",
      "--location",
      "--retry",
      "3",
      "--show-error",
      "--silent",
      endpoint,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout;
}

function parseGitilesJson(value) {
  return JSON.parse(value.replace(/^\)\]\}'\s*/u, ""));
}

function isCommit(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
