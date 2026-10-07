// Vercel's Express service uses the explicit CommonJS entrypoint in
// vercel.json; Docker and `start` use the ESM bundle. The tsc-emitted
// dist/index.js is removed so nothing resolves to un-runnable ESM.
import { build } from "esbuild";
import { rm } from "fs/promises";
import path from "path";

const dist = path.resolve(import.meta.dirname, "dist");

const shared = {
  entryPoints: [path.join(dist, "../src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  logLevel: "warning",
};

await build({ ...shared, format: "esm", outfile: path.join(dist, "index.mjs") });
await build({ ...shared, format: "cjs", outfile: path.join(dist, "index.cjs") });
await rm(path.join(dist, "index.js"), { force: true });
