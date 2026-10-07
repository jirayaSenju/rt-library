const electron = require('electron');
console.log('require("electron") type:', typeof electron);
console.log('require("electron") value:', electron);
if (typeof electron === 'object' && electron !== null) {
  console.log('require("electron") keys:', Object.keys(electron));
  console.log('electron.app:', electron.app);
}
