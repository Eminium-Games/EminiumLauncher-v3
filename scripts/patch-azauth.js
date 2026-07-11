const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const target = join(__dirname, '..', 'node_modules', 'eml-lib', 'lib', 'auth', 'azuriom.js')

try {
  let code = readFileSync(target, 'utf-8')

  const header = `headers: {\n                    'Content-Type': 'application/json',\n                    'Accept': 'application/json'\n                },`
  const oldHeader = `headers: {\n                    'Content-Type': 'application/json'\n                },`

  if (code.includes(header)) {
    console.log('✓ AzAuth already patched')
    process.exit(0)
  }

  if (!code.includes(oldHeader)) {
    console.warn('patch-azauth: pattern not found, skipping')
    process.exit(0)
  }

  code = code.split(oldHeader).join(header)
  writeFileSync(target, code, 'utf-8')
  console.log('✓ AzAuth patched with Accept: application/json')
} catch (err) {
  console.error('patch-azauth failed:', err.message)
  process.exit(1)
}
