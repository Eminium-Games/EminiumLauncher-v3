import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import logger from 'electron-log/main'

const execFileAsync = promisify(execFile)

export interface JavaCandidate {
  path: string
  version: string
  arch: string
}

const COMMON_JAVA_DIRS = [
  process.env.JAVA_HOME,
  process.env.JDK_HOME,
  'C:\\Program Files\\Eclipse Adoptium',
  'C:\\Program Files\\AdoptOpenJDK',
  'C:\\Program Files\\Java',
  'C:\\Program Files\\Microsoft',
  'C:\\Program Files\\Amazon Corretto',
  'C:\\Program Files\\Zulu',
  '/usr/lib/jvm',
  '/usr/java',
  '/opt/java',
  '/Library/Java/JavaVirtualMachines'
].filter(Boolean) as string[]

function isExecutable(p: string): boolean {
  try {
    const st = fs.statSync(p)
    return st.isFile()
  } catch {
    return false
  }
}

function candidateJavaExes(dir: string): string[] {
  const out: string[] = []
  const exeName = process.platform === 'win32' ? 'java.exe' : 'java'
  // dir itself
  const direct = path.join(dir, exeName)
  if (isExecutable(direct)) out.push(direct)
  // bin subdir
  const bin = path.join(dir, 'bin', exeName)
  if (isExecutable(bin)) out.push(bin)
  // one level of subdirs (e.g. jdk-17.x.x)
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const sub = path.join(dir, entry.name, 'bin', exeName)
      if (isExecutable(sub)) out.push(sub)
      const sub2 = path.join(dir, entry.name, exeName)
      if (isExecutable(sub2)) out.push(sub2)
    }
  } catch {
    // ignore
  }
  return out
}

async function probeJava(javaPath: string): Promise<JavaCandidate | null> {
  try {
    const { stderr, stdout } = await execFileAsync(javaPath, ['-version'], { timeout: 10000 })
    const output = (stdout || '') + (stderr || '')
    const m = output.match(/"([^"]+)"/)
    const version = m ? m[1] : ''
    const arch = output.includes('64-Bit') ? '64-bit' : '32-bit'
    if (!version) return null
    return { path: javaPath, version, arch }
  } catch {
    return null
  }
}

// Java 17.0.6+, 21, 25, 27 on x86-64 are vulnerable to CVE-2026-114938.
// A "patched" Java is one that is either unaffected (8/11 standard, or 17 < 0.6)
// or a patched build. We can't reliably know the build, so we prefer higher
// versions and let the mitigation flag handle the rest.
function isPatchedEnough(c: JavaCandidate): boolean {
  const parts = c.version.split('.')
  const major = parseInt(parts[0], 10) || 0
  const patch = parseInt(parts[2] ?? parts[1] ?? '0', 10) || 0
  // Java 8 / 11 standard are not affected
  if (major === 8 || major === 11 || major === 1) return true
  // Java 17 < 0.6 not affected
  if (major === 17 && patch < 6) return true
  // For 17.0.6+, 21, 25, 27 we can't tell patched vs unpatched from version
  // string alone; accept them only if mitigation will be applied (always).
  return true
}

export async function resolvePatchedJava(): Promise<JavaCandidate | null> {
  const found = new Map<string, JavaCandidate>()

  // PATH
  const pathEnv = process.env.PATH || ''
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue
    for (const exe of candidateJavaExes(dir)) {
      if (!found.has(exe)) {
        const c = await probeJava(exe)
        if (c) found.set(exe, c)
      }
    }
  }

  // Common install dirs
  for (const dir of COMMON_JAVA_DIRS) {
    if (!fs.existsSync(dir)) continue
    for (const exe of candidateJavaExes(dir)) {
      if (!found.has(exe)) {
        const c = await probeJava(exe)
        if (c) found.set(exe, c)
      }
    }
  }

  const candidates = [...found.values()].filter(isPatchedEnough)
  if (candidates.length === 0) return null

  // Prefer Java 17+ (needed for modern Minecraft), then highest version.
  const scored = candidates.map((c) => {
    const major = parseInt(c.version.split('.')[0], 10) || 0
    const score = (major >= 17 ? 1000 : 0) + major * 10 + (c.arch.includes('64') ? 5 : 0)
    return { c, score }
  })
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0].c
  logger.log(`Resolved system Java: ${best.path} (${best.version}, ${best.arch})`)
  return best
}

export async function installPatchedJava17(): Promise<string | null> {
  // Downloads Eclipse Temurin 17 JRE (zip) into userData/runtimes if no patched
  // Java is available. Windows-only extraction via PowerShell.
  if (process.platform !== 'win32') {
    logger.warn('installPatchedJava17: only implemented on Windows')
    return null
  }
  const targetDir = path.join(os.homedir(), '.eminium', 'runtimes', 'temurin-17')
  const javaExe = path.join(targetDir, 'bin', 'java.exe')
  if (fs.existsSync(javaExe)) {
    const c = await probeJava(javaExe)
    if (c) return javaExe
  }

  try {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  } catch (err) {
    logger.error('Failed to create runtime dir:', err)
    return null
  }

  // Adoptium API: latest Temurin 17 JRE for Windows x64
  const apiUrl = 'https://api.adoptium.net/v3/assets/latest/17/ga?architecture=x64&heap_size=normal&image_type=jre&os=windows&vendor=eclipse'
  let downloadUrl: string | null = null
  try {
    const res = await fetch(apiUrl)
    const data = await res.json()
    const binary = Array.isArray(data) && data[0]?.binaries?.[0]
    downloadUrl = binary?.package?.link ?? null
  } catch (err) {
    logger.error('Failed to query Adoptium API:', err)
    return null
  }
  if (!downloadUrl) {
    logger.error('No download URL from Adoptium')
    return null
  }

  const zipPath = path.join(os.tmpdir(), 'temurin-17-jre.zip')
  try {
    const res = await fetch(downloadUrl)
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    const { createWriteStream } = await import('node:fs')
    const { pipeline } = await import('node:stream/promises')
    const { Readable } = await import('node:stream')
    await pipeline(Readable.fromWeb(res.body as any), createWriteStream(zipPath))
  } catch (err) {
    logger.error('Failed to download Temurin 17:', err)
    return null
  }

  // Extract via PowerShell
  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${path.dirname(targetDir)}' -Force`
    ], { timeout: 300000 })
    // Adoptium zip extracts to a jdk-17.x.x-jre folder; rename if needed
    if (!fs.existsSync(javaExe)) {
      const parent = path.dirname(targetDir)
      const extracted = fs.readdirSync(parent).find((n) => n.toLowerCase().includes('jdk-17') || n.toLowerCase().includes('jre-17'))
      if (extracted) {
        try { fs.renameSync(path.join(parent, extracted), targetDir) } catch (err) { logger.error('Rename failed:', err) }
      }
    }
  } catch (err) {
    logger.error('Extraction failed:', err)
    return null
  } finally {
    try { fs.unlinkSync(zipPath) } catch {}
  }

  if (fs.existsSync(javaExe)) {
    logger.log(`Installed patched Java 17 at ${javaExe}`)
    return javaExe
  }
  logger.error('Patched Java 17 install did not produce java.exe')
  return null
}