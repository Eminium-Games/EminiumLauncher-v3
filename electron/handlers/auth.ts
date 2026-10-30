import { ipcMain, app, safeStorage } from 'electron'
import type { Account } from 'eml-lib'
import logger from 'electron-log/main'
import * as fs from 'node:fs'
import * as path from 'node:path'

const AZURIOM_URL = 'https://eminium.ovh'
const sessionPath = path.join(app.getPath('userData'), 'session.json')

export type IAuthResponse = { success: true; account: Account } | { success: false; error: string }

type StoredSession = {
  account: Account
  savedAt: string
}

type SessionFile = {
  v: number
  encrypted: boolean
  payload: string
}

function toAccount(data: any): Account {
  return {
    name: data.username,
    uuid: data.uuid ?? data.id?.toString?.() ?? '',
    accessToken: data.access_token,
    clientToken: data.uuid ?? data.id?.toString?.() ?? '',
    userProperties: {},
    meta: {
      online: false,
      type: 'azuriom',
      url: AZURIOM_URL
    }
  }
}

async function requestAzuriom(endpoint: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params)
  const res = await fetch(`${AZURIOM_URL}/api/auth/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body
  })

  const text = await res.text()
  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text }
  }

  if (!res.ok) {
    if (data?.status === 'pending' && data?.reason === '2fa') {
      const err: any = new Error('TWOFA_CODE_REQUIRED')
      err.code = 'TWOFA_CODE_REQUIRED'
      throw err
    }
    throw new Error(data?.message || data?.reason || `HTTP ${res.status}`)
  }

  return data
}

async function azAuth(username: string, password: string, twoFACode?: string): Promise<Account> {
  const params: Record<string, string> = { email: username, password }
  if (twoFACode) params.code = twoFACode
  const data = await requestAzuriom('authenticate', params)
  if (data?.status === 'pending' && data?.reason === '2fa') {
    const err: any = new Error('TWOFA_CODE_REQUIRED')
    err.code = 'TWOFA_CODE_REQUIRED'
    throw err
  }
  if (data?.status === 'error') {
    throw new Error(data?.message || data?.reason || 'Authentication failed')
  }
  const account = toAccount(data)
  if (!account.accessToken) {
    throw new Error('Authentication did not return an access token')
  }
  return account
}

async function azVerify(account: Account): Promise<Account> {
  const data = await requestAzuriom('verify', { access_token: account.accessToken })
  if (data?.status === 'error') {
    throw new Error(data?.message || data?.reason || 'Verification failed')
  }
  const verified = toAccount(data)
  if (!verified.accessToken) {
    // keep previous token if server did not return a new one
    verified.accessToken = account.accessToken
    verified.clientToken = account.clientToken
  }
  return verified
}

async function azLogout(account: Account): Promise<void> {
  try {
    await requestAzuriom('logout', { access_token: account.accessToken })
  } catch (err) {
    logger.warn('Azuriom logout failed:', err)
  }
}

function normalizeSession(data: unknown): StoredSession | null {
  if (!data || typeof data !== 'object') return null

  const raw = data as any

  // New encrypted wrapper
  if (raw.v && raw.payload) {
    try {
      let json: string
      if (raw.encrypted && safeStorage.isEncryptionAvailable()) {
        json = safeStorage.decryptString(Buffer.from(raw.payload, 'base64'))
      } else {
        json = raw.payload
      }
      return normalizeSession(JSON.parse(json))
    } catch (err) {
      logger.error('Failed to decrypt session:', err)
      return null
    }
  }

  if (raw.account && raw.account.accessToken !== undefined) {
    // ensure meta
    if (!raw.account.meta) raw.account.meta = { online: false, type: 'azuriom', url: AZURIOM_URL }
    return { account: raw.account, savedAt: raw.savedAt ?? new Date().toISOString() }
  }

  if (raw.account) {
    if (!raw.account.meta) raw.account.meta = { online: false, type: 'azuriom', url: AZURIOM_URL }
    return { account: raw.account, savedAt: raw.savedAt ?? new Date().toISOString() }
  }

  if ('accessToken' in raw && 'name' in raw && 'uuid' in raw) {
    const account = raw as unknown as Account
    if (!account.meta) account.meta = { online: false, type: 'azuriom', url: AZURIOM_URL }
    return { account, savedAt: new Date().toISOString() }
  }

  return null
}

function saveSession(account: Account) {
  const sessionData: StoredSession = { account, savedAt: new Date().toISOString() }
  const json = JSON.stringify(sessionData)
  let payload = json
  let encrypted = false
  if (safeStorage.isEncryptionAvailable()) {
    try {
      payload = safeStorage.encryptString(json).toString('base64')
      encrypted = true
    } catch (err) {
      logger.warn('safeStorage encryption failed, storing plain:', err)
      payload = json
      encrypted = false
    }
  }
  const wrapper: SessionFile = { v: 2, encrypted, payload }
  fs.writeFileSync(sessionPath, JSON.stringify(wrapper, null, 2))
  logger.log(`Session saved for ${account.name}`)
}

function loadSession(): StoredSession | null {
  if (!fs.existsSync(sessionPath)) return null
  try {
    const raw = fs.readFileSync(sessionPath, 'utf-8')
    const parsed = normalizeSession(JSON.parse(raw))
    if (!parsed) {
      logger.warn('Session file exists but could not be parsed')
      return null
    }
    if (!parsed.account?.accessToken) {
      logger.warn('Session has no access token, clearing')
      try { fs.unlinkSync(sessionPath) } catch {}
      return null
    }
    logger.log(`Session loaded for ${parsed.account.name}`)
    return parsed
  } catch (err) {
    logger.error('Failed to load session:', err)
    return null
  }
}

export function registerAuthHandlers(_mainWindow: Electron.BrowserWindow) {
  const save = saveSession
  const load = loadSession

  ipcMain.handle('auth:refresh', async () => {
    const session = load()
    if (!session) {
      return { success: false } as { success: false }
    }

    try {
      const verified = await azVerify(session.account)
      save(verified)
      return { success: true, account: verified } as IAuthResponse
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      logger.error('Failed to refresh session:', msg)
      // Clear session only for auth failures; keep for transient errors
      if (/invalid|banned|401|403|422/i.test(msg)) {
        try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath) } catch {}
        return { success: false, error: msg }
      }
      // Transient/network error: return cached account to keep session alive
      return { success: true, account: session.account } as IAuthResponse
    }
  })

  ipcMain.handle('auth:logout', async (_event, account?: Account) => {
    const session = load()
    const target = account ?? session?.account
    if (target) await azLogout(target)
    if (fs.existsSync(sessionPath)) {
      try { fs.unlinkSync(sessionPath) } catch {}
    }
    logger.log('Session cleared')
    return { success: true }
  })

  ipcMain.handle('auth:login-az', async (_event, payload: { username: string; password: string; twoFACode?: string }) => {
    try {
      if (!payload?.username || !payload?.password) {
        return { success: false, error: 'Username and password are required' }
      }
      logger.log(`Attempting Azuriom login for ${payload.username}...`)
      const account = await azAuth(payload.username, payload.password, payload.twoFACode)
      save(account)
      logger.log('Azuriom login successful')
      return { success: true, account } as IAuthResponse
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      logger.error('Failed to login with AzAuth:', msg)
      if (msg === 'TWOFA_CODE_REQUIRED' || msg.includes('2fa') || msg.includes('Missing 2FA')) {
        return { success: false, error: 'TWOFA_CODE_REQUIRED' }
      }
      return { success: false, error: msg }
    }
  })
}
