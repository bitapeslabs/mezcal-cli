import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "cjs", // safe for CLIs
  platform: "node",
  target: ["node20"], // ✅ must be one pkg supports
  tsconfig: "./tsconfig.json",
});
