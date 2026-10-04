// Vercel's express preset runs dist/index.js as CommonJS, so the raw ESM output
// of tsc crashes at import time. Emit one bundle per module system and drop the
// tsc-emitted dist/index.js so nothing resolves to unrunnable ESM.
import { build } from "esbuild";
import { rm } from "fs/promises";
import path from "path";

const dist = path.resolve(import.meta.dirname, "dist");

const shared = {
  entryPoints: [path.join(dist, "../src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  packages: "external",
  logLevel: "warning",
};

await build({ ...shared, format: "esm", outfile: path.join(dist, "index.mjs") });
await build({ ...shared, format: "cjs", outfile: path.join(dist, "index.cjs") });
await rm(path.join(dist, "index.js"), { force: true });