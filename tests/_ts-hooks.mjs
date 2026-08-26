/**
 * Node ESM loader: transpile .ts on import so tests can load src/*.ts on Node 20.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts")) {
    return nextLoad(url, context);
  }

  const source = readFileSync(fileURLToPath(url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      sourceMap: false,
    },
    fileName: fileURLToPath(url),
  }).outputText;

  return {
    format: "module",
    source: transpiled,
    shortCircuit: true,
  };
}
