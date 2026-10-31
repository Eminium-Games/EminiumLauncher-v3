// Writes the current git commit SHA to public/commit-sha.txt so it is
// embedded into dist/ at build time (vite copies public/ -> dist/).
// Runs automatically via the `prebuild` npm script. Falls back to a
// previous value or "unknown" when git is unavailable.
const { execSync } = require('node:child_process')
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const outFile = join(__dirname, '..', 'public', 'commit-sha.txt')

function currentSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return null
  }
}

function previousSha() {
  try {
    if (existsSync(outFile)) return readFileSync(outFile, 'utf-8').trim()
  } catch {}
  return null
}

const sha = currentSha() ?? previousSha() ?? 'unknown'
mkdirSync(join(__dirname, '..', 'public'), { recursive: true })
writeFileSync(outFile, `${sha}\n`, 'utf-8')
console.log(`✓ commit-sha: ${sha.slice(0, 12)}`)
