import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Test-only in-memory module loading. No production auth bypass, SDK connection,
// generated application module, database or SQL engine is involved.
export function moduleLoader(overrides = {}) {
  const cache = new Map();
  async function sourceUrl(url) {
    if (cache.has(url)) return cache.get(url);
    const promise = compile(url); cache.set(url, promise); return promise;
  }
  async function compile(url) {
    const original = await readFile(new URL(url), "utf8");
    let compiled = ts.transpileModule(original, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    for (const match of [...compiled.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)]) {
      const specifier = match[1]; let resolved;
      const absolute = specifier.startsWith(".") ? new URL(specifier, url).href : specifier;
      if (overrides[absolute] || overrides[specifier]) resolved = `data:text/javascript;base64,${Buffer.from(overrides[absolute] ?? overrides[specifier]).toString("base64")}`;
      else if (specifier.startsWith(".")) {
        let target = absolute;
        if (!/\.(?:mjs|js|ts|tsx)$/.test(target)) {
          for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
            try { await access(fileURLToPath(target + extension)); target += extension; break; } catch { /* Try next extension. */ }
          }
        }
        resolved = /\.tsx?$/.test(target) ? await sourceUrl(target) : target;
      } else resolved = specifier.startsWith("node:") ? specifier : import.meta.resolve(specifier);
      compiled = compiled.replace(match[0], match[0].replace(specifier, resolved));
    }
    return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  }
  return async path => import(await sourceUrl(new URL(path, new URL("../../", import.meta.url)).href));
}
