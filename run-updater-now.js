const https = require('https')
const fs = require('fs')
const path = require('path')

const REPO_OWNER = 'EminiumGames'
const REPO_NAME = 'EminiumLauncher-v3'
const BRANCH = 'main'
const GITHUB_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Eminium-Updater' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('error', reject)
  })
}

function httpsGetBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Eminium-Updater' } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(Buffer.from(c)))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

function isPathAllowed(p) {
  const blocked = ['node_modules', '.git', 'release', 'dist-electron/win-unpacked', 'linux-unpacked']
  for (const b of blocked) if (p.startsWith(b)) return false
  return true
}

async function run() {
  try {
    console.log('Fetching latest commit...')
    const commit = await httpsGetJson(`${GITHUB_API}/commits/${BRANCH}`)
    const latestSha = commit.sha
    console.log('Latest SHA:', latestSha)

    const stateFile = path.join(process.cwd(), 'updater.json')
    let localSha = null
    try {
      const s = fs.readFileSync(stateFile, 'utf-8')
      localSha = JSON.parse(s).sha
    } catch (e) {
      localSha = null
    }

    if (localSha === latestSha) {
      console.log('Already up-to-date')
      return
    }

    console.log('Fetching repo tree...')
    const treeRes = await httpsGetJson(`${GITHUB_API}/git/trees/${BRANCH}?recursive=1`)
    const tree = treeRes.tree || []
    const files = tree.filter((t) => t.type === 'blob' && isPathAllowed(t.path))

    console.log(`Found ${files.length} files to update`)
    let i = 0
    for (const f of files) {
      i++
      const fileUrl = `${RAW_BASE}/${f.path}`
      try {
        const buf = await httpsGetBuffer(fileUrl)
        const targetPath = path.join(process.cwd(), f.path)
        const dir = path.dirname(targetPath)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(targetPath, buf)
        process.stdout.write(`\r[${i}/${files.length}] ${f.path}`)
      } catch (err) {
        console.error('\nFailed to fetch', fileUrl, err.message)
      }
    }

    fs.writeFileSync(stateFile, JSON.stringify({ sha: latestSha }), 'utf-8')
    console.log('\nUpdate applied. Wrote updater.json')
  } catch (err) {
    console.error('Update failed', err)
    process.exit(1)
  }
}

run()
