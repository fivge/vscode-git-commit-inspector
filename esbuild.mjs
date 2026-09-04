import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const tests = process.argv.includes("--tests");
const options = {
  entryPoints: tests ? ["test/integration/suite/index.ts"] : ["src/extension.ts"],
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node22",
  outfile: tests ? "dist/test/suite/index.js" : "dist/extension.js",
  sourcemap: true,
  sourcesContent: false,
  logLevel: "info",
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log("Watching extension sources...");
} else {
  await esbuild.build(options);
}
