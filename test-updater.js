// Simple test script to verify updater debugSimulate works
const { ipcMain, BrowserWindow, app } = require('electron')

console.log('Test updater debugSimulate IPC handler registered')
console.log('To test in dev mode:')
console.log('1. Open Electron DevTools (Ctrl+Shift+I)')
console.log('2. In console, type: window.api.updater.debugSimulate()')
console.log('3. You should see 10 progress updates and status changes')
console.log('')
console.log('Or from this test script:')
console.log('const result = window.api?.updater?.debugSimulate()')
console.log('result.then(() => console.log("Test completed"))')
