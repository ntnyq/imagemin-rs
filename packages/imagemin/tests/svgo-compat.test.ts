import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";
import { optimize as optimizeWithSvgo } from "svgo";

import { svgo, type SvgoOptions } from "../src/index";

const FIXTURES = [
  "basic-icon.svg",
  "defs-use.svg",
  "css-selectors.svg",
  "animation.svg",
  "scripted.svg",
  "upstream-figma-transforms.svg",
  "upstream-illustrator.svg",
] as const;

const PROFILES: ReadonlyArray<{ name: string; options: SvgoOptions }> = [
  { name: "default multipass", options: {} },
  { name: "single pass", options: { multipass: false } },
  { name: "empty plugin program", options: { multipass: false, plugins: [] } },
  {
    name: "preset override",
    options: {
      multipass: false,
      plugins: [
        {
          name: "preset-default",
          params: { overrides: { removeDesc: false } },
        },
      ],
    },
  },
  {
    name: "ordered builtins",
    options: {
      floatPrecision: 2,
      multipass: false,
      plugins: ["removeComments", "sortAttrs", "removeComments"],
    },
  },
  {
    name: "serializer options",
    options: {
      js2svg: { indent: 2, pretty: true },
      multipass: false,
      plugins: [],
    },
  },
  {
    name: "path-aware prefixing",
    options: {
      multipass: false,
      path: "/corpus/icon.svg",
      plugins: ["prefixIds"],
    },
  },
];

describe("pinned SVGO 4 differential oracle", () => {
  for (const fixture of FIXTURES) {
    for (const profile of PROFILES) {
      test(`${fixture}: ${profile.name}`, async () => {
        const input = await readFile(new URL(`../../../fixtures/svg/${fixture}`, import.meta.url));
        const expected = optimizeWithSvgo(input.toString(), {
          multipass: true,
          ...profile.options,
        }).data;
        const output = await svgo(profile.options)(input);

        expect(Buffer.from(output).toString()).toBe(expected);
      });
    }
  }

  test("default optimization preserves scripts while explicit cleanup removes them", async () => {
    const input = await readFile(new URL("../../../fixtures/svg/scripted.svg", import.meta.url));
    const defaultOutput = Buffer.from(await svgo()(input)).toString();
    const cleanedOutput = Buffer.from(
      await svgo({ multipass: false, plugins: ["removeScripts"] })(input),
    ).toString();

    expect(defaultOutput).toContain("<script");
    expect(cleanedOutput).not.toContain("<script");
    expect(cleanedOutput).not.toContain("onclick=");
  });

  test("malformed SVG follows imagemin-svgo's non-SVG no-op behavior", async () => {
    const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>');

    await expect(svgo()(input)).resolves.toBe(input);
  });
});
