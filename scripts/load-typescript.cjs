// Execute the repository's TypeScript in diagnostics without adding a runtime dependency.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
module.exports = function loadTypescript(filename) {
  const absolute = path.resolve(__dirname, '..', filename);
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, file) => {
    const source = fs.readFileSync(file, 'utf8').replace(/import\.meta\.env\.DEV/g, 'false');
    const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
    module._compile(result.outputText, file);
  };
  try { return require(absolute); }
  finally { if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts']; }
};
