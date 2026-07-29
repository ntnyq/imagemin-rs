import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { verifyAomSecurity } from "./verify-aom-security.mjs";

const policy = JSON.parse(
  await readFile(new URL("../../security/native-dependency-policy.json", import.meta.url), "utf8"),
);

test("checks every required AOM fix against the approved release tag commit", async () => {
  const requests = [];
  const result = await verifyAomSecurity(policy, async (url) => {
    requests.push(url);
    return `)]}'\n${JSON.stringify({
      log: [
        { commit: policy.aom.tagCommit },
        ...policy.aom.requiredFixCommits.map(({ commit }) => ({ commit })),
      ],
    })}`;
  });

  assert.deepEqual(requests, [
    `${policy.aom.repository}/+log/refs/tags/v${policy.aom.version}?format=JSON&n=1000`,
  ]);
  assert.equal(result.assertions.length, policy.aom.requiredFixCommits.length);
});

test("rejects a tag that does not descend from a required AOM fix", async () => {
  await assert.rejects(
    verifyAomSecurity(
      policy,
      async () =>
        `)]}'\n${JSON.stringify({
          log: [{ commit: policy.aom.tagCommit }, { commit: "0".repeat(40) }],
        })}`,
    ),
    /history does not contain required fix/u,
  );
});
