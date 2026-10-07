console.log('process.versions.electron:', process.versions.electron);
console.log('require("electron") ->', require('electron'));

let electronObj = null;
try {
  electronObj = process.electronBinding ? process.electronBinding('electron') : null;
  console.log('process.electronBinding("electron") keys:', electronObj ? Object.keys(electronObj) : null);
} catch (e) {
  console.log('electronBinding error:', e.message);
}

try {
  const Module = require('module');
  console.log('Builtin modules:', Module.builtinModules);
} catch (e) {}
