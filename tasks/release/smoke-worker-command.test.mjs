import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveSmokeWorkerCommand } from "./smoke-worker-command.mjs";

test("runs the installed-package smoke in a separate Node process", () => {
  assert.deepEqual(
    resolveSmokeWorkerCommand(
      {
        installationRoot: "C:\\Users\\runner admin\\smoke",
        platformDirectory: "win32-x64-msvc",
        releaseVersion: "0.1.0-rc.5",
        reportPath: "C:\\release output\\smoke.json",
        sbomPath: "C:\\release output\\smoke.cdx.json",
      },
      {
        executable: "C:\\Program Files\\nodejs\\node.exe",
        workerPath: "C:\\checkout\\tasks\\release\\smoke-installed-package.mjs",
      },
    ),
    {
      arguments: [
        "C:\\checkout\\tasks\\release\\smoke-installed-package.mjs",
        "--installation-root=C:\\Users\\runner admin\\smoke",
        "--platform-directory=win32-x64-msvc",
        "--release-version=0.1.0-rc.5",
        "--report=C:\\release output\\smoke.json",
        "--sbom=C:\\release output\\smoke.cdx.json",
      ],
      command: "C:\\Program Files\\nodejs\\node.exe",
    },
  );
});
