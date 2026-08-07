import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

fs.mkdirSync("dist-electron", { recursive: true });

await esbuild.build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist-electron/main.cjs",
  external: ["electron"],
  sourcemap: true,
});

await esbuild.build({
  entryPoints: ["electron/preload.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist-electron/preload.cjs",
  external: ["electron"],
  sourcemap: true,
});

console.log("Built electron main + preload");
