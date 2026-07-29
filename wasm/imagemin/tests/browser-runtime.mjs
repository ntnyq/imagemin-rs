import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium, firefox, webkit } from "playwright";

const executeFile = promisify(execFile);
const browserName = process.env.BROWSER ?? "chromium";
const launcher = { chromium, firefox, webkit }[browserName];
if (launcher === undefined) throw new Error(`Unsupported browser: ${browserName}`);

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const consumerRoot = await mkdtemp(join(tmpdir(), "imagemin-wasm-browser-"));
const tarballRoot = join(consumerRoot, "tarballs");
let server;

try {
  await mkdir(tarballRoot);
  await writeFile(
    join(consumerRoot, "package.json"),
    JSON.stringify({
      name: "imagemin-wasm-browser-smoke",
      private: true,
      type: "module",
    }),
  );
  await copyFile(
    join(workspaceRoot, "fixtures/png/gradient.hex"),
    join(consumerRoot, "gradient.hex"),
  );
  await copyFile(
    join(workspaceRoot, "fixtures/gif/animation.hex"),
    join(consumerRoot, "animation.hex"),
  );

  const packageSpec =
    process.env.IMAGEMIN_WASM_TARBALL === undefined
      ? await packWorkspacePackage()
      : resolve(workspaceRoot, process.env.IMAGEMIN_WASM_TARBALL);

  await executeFile("npm", ["install", "--ignore-scripts", packageSpec], {
    cwd: consumerRoot,
  });

  server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html" }).end("<!doctype html>");
      return;
    }

    const path = resolve(consumerRoot, `.${pathname}`);
    if (!path.startsWith(consumerRoot)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const body = await readFile(path);
      const type = contentType(extname(path));
      response.writeHead(200, { "content-type": type }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((resolveServer) => {
    server.listen(0, resolveServer);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Browser smoke server did not expose a TCP address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await launcher.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(baseUrl);
    const result = await page.evaluate(async (base) => {
      const imagemin = await import(`${base}/node_modules/@imagemin-rs/wasm/dist/index.js`);
      const parseHex = async (name) => {
        const hex = (await (await fetch(`${base}/${name}`)).text()).trim();
        return Uint8Array.from(hex.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
      };

      await imagemin.initWasm();
      const png = await imagemin.optimize(await parseHex("gradient.hex"), {
        plugins: [imagemin.oxipng({ optimizationLevel: 3 })],
      });
      const gif = await imagemin.optimize(await parseHex("animation.hex"), {
        plugins: [imagemin.giflossless({ strip: true })],
      });
      const svg = await imagemin.optimize(
        new TextEncoder().encode(
          '<svg viewBox="0 0 24 24"><!-- remove --><path fill="#ff0000" d="M0 0h24v24z"/></svg>',
        ),
        { plugins: [imagemin.svgm()] },
      );

      return {
        gif: new TextDecoder().decode(gif.data.subarray(0, 6)),
        png: [...png.data.subarray(0, 8)],
        pngSteps: png.steps.map((step) => step.plugin),
        svg: new TextDecoder().decode(svg.data),
      };
    }, baseUrl);

    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      result.gif !== "GIF89a" ||
      JSON.stringify(result.png) !== JSON.stringify(pngSignature) ||
      JSON.stringify(result.pngSteps) !== JSON.stringify(["oxipng"]) ||
      result.svg.includes("<!--")
    ) {
      throw new Error(`Packed browser WASM verification failed: ${JSON.stringify(result)}`);
    }
  } finally {
    await browser.close();
  }
} finally {
  if (server !== undefined) {
    await new Promise((resolveServer) => {
      server.close(resolveServer);
    });
  }
  await rm(consumerRoot, { force: true, recursive: true });
}

function contentType(extension) {
  if (extension === ".wasm") return "application/wasm";
  if (extension === ".js") return "text/javascript";
  if (extension === ".json") return "application/json";
  if (extension === ".hex") return "text/plain";
  return "application/octet-stream";
}

async function packWorkspacePackage() {
  const { stdout } = await executeFile("pnpm", ["pack", "--pack-destination", tarballRoot], {
    cwd: resolve(workspaceRoot, "wasm/imagemin"),
  });
  const tarballName = stdout
    .trim()
    .split(/\r?\n/u)
    .findLast((line) => line.endsWith(".tgz"));
  if (tarballName === undefined) throw new Error(`Could not find packed tarball in:\n${stdout}`);
  return resolve(tarballName);
}
