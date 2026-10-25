/* eslint @typescript-eslint/no-require-imports: "off" -- Webpack's loader interface is CommonJS. */
const ts = require("typescript");
exports.default = function(source) {
  if (this.resourcePath.endsWith(".css")) return `const style = document.createElement('style'); style.textContent = ${JSON.stringify(source)}; document.head.appendChild(style); export default new Proxy({}, { get: (_, key) => key });`;
  return ts.transpileModule(source, { fileName: this.resourcePath, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
};
