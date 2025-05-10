import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["node20"],
  tsconfig: "./tsconfig.json",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
