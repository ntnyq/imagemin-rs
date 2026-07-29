import { fileURLToPath } from "node:url";

const defaultWorkerPath = fileURLToPath(new URL("./smoke-installed-package.mjs", import.meta.url));

export function resolveSmokeWorkerCommand(
  { installationRoot, platformDirectory, releaseVersion, reportPath, sbomPath },
  { executable = process.execPath, workerPath = defaultWorkerPath } = {},
) {
  const arguments_ = [
    workerPath,
    `--installation-root=${installationRoot}`,
    `--platform-directory=${platformDirectory}`,
    `--release-version=${releaseVersion}`,
  ];
  if (reportPath !== undefined) arguments_.push(`--report=${reportPath}`);
  if (sbomPath !== undefined) arguments_.push(`--sbom=${sbomPath}`);
  return { arguments: arguments_, command: executable };
}
