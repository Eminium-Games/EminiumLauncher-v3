import { ipcMain, app, safeStorage } from 'electron'
import type { Account } from 'eml-lib'
import logger from 'electron-log/main'
import * as fs from 'node:fs'
import * as path from 'node:path'

const AZURIOM_URL = 'https://eminium.ovh'
const sessionPath = path.join(app.getPath('userData'), 'session.json')

export type IAuthResponse = { success: true; account: Account } | { success: false; error: string }

type StoredAccount = {
  account: Account
  savedAt: string
}

type SessionData = {
  accounts: StoredAccount[]
  activeIndex: number
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
    userProperties: {
      email: data.email,
      emailVerified: data.email_verified,
      money: data.money,
      role: data.role?.name,
      roleColor: data.role?.color,
      banned: data.banned,
      banReason: data.ban_reason,
      createdAt: data.created_at
    },
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

function normalizeAccount(raw: any): Account | null {
  if (!raw || typeof raw !== 'object') return null
  if (raw.account && raw.account.accessToken !== undefined) {
    if (!raw.account.meta) raw.account.meta = { online: false, type: 'azuriom', url: AZURIOM_URL }
    return raw.account as Account
  }
  if (raw.accessToken !== undefined && raw.name && raw.uuid) {
    const account = raw as Account
    if (!account.meta) account.meta = { online: false, type: 'azuriom', url: AZURIOM_URL }
    return account
  }
  return null
}

function normalizeSessionData(data: unknown): SessionData | null {
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
      return normalizeSessionData(JSON.parse(json))
    } catch (err) {
      logger.error('Failed to decrypt session:', err)
      return null
    }
  }

  // Multi-account format
  if (Array.isArray(raw.accounts)) {
    const accounts: StoredAccount[] = []
    for (const entry of raw.accounts) {
      const acc = normalizeAccount(entry)
      if (acc) accounts.push({ account: acc, savedAt: entry.savedAt ?? new Date().toISOString() })
    }
    if (accounts.length === 0) return null
    let activeIndex = typeof raw.activeIndex === 'number' ? raw.activeIndex : 0
    if (activeIndex < 0 || activeIndex >= accounts.length) activeIndex = 0
    return { accounts, activeIndex }
  }

  // Legacy single-account format
  const single = normalizeAccount(raw)
  if (single) {
    return { accounts: [{ account: single, savedAt: raw.savedAt ?? new Date().toISOString() }], activeIndex: 0 }
  }

  return null
}

function saveSessionData(data: SessionData) {
  const json = JSON.stringify(data)
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
  const wrapper: SessionFile = { v: 3, encrypted, payload }
  fs.writeFileSync(sessionPath, JSON.stringify(wrapper, null, 2))
  logger.log(`Session saved (${data.accounts.length} account(s))`)
}

function loadSessionData(): SessionData | null {
  if (!fs.existsSync(sessionPath)) return null
  try {
    const raw = fs.readFileSync(sessionPath, 'utf-8')
    const parsed = normalizeSessionData(JSON.parse(raw))
    if (!parsed) {
      logger.warn('Session file exists but could not be parsed')
      return null
    }
    // Remove accounts without token
    parsed.accounts = parsed.accounts.filter((a) => a.account?.accessToken)
    if (parsed.accounts.length === 0) {
      try { fs.unlinkSync(sessionPath) } catch {}
      return null
    }
    if (parsed.activeIndex >= parsed.accounts.length) parsed.activeIndex = 0
    logger.log(`Session loaded: ${parsed.accounts.length} account(s), active=${parsed.accounts[parsed.activeIndex].account.name}`)
    return parsed
  } catch (err) {
    logger.error('Failed to load session:', err)
    return null
  }
}

export function registerAuthHandlers(_mainWindow: Electron.BrowserWindow) {
  let sessionData: SessionData | null = loadSessionData()

  const persist = () => {
    if (sessionData) saveSessionData(sessionData)
  }

  ipcMain.handle('auth:accounts', async () => {
    if (!sessionData) return []
    return sessionData.accounts.map((a, i) => ({
      name: a.account.name,
      uuid: a.account.uuid,
      role: a.account.userProperties?.role,
      active: i === sessionData!.activeIndex
    }))
  })

  ipcMain.handle('auth:switch', async (_event, index: number) => {
    if (!sessionData) return { success: false, error: 'No session' }
    if (index < 0 || index >= sessionData.accounts.length) return { success: false, error: 'Invalid index' }
    sessionData.activeIndex = index
    persist()
    logger.log(`Switched to account ${sessionData.accounts[index].account.name}`)
    return { success: true, account: sessionData.accounts[index].account }
  })

  ipcMain.handle('auth:remove', async (_event, index: number) => {
    if (!sessionData) return { success: false, error: 'No session' }
    if (index < 0 || index >= sessionData.accounts.length) return { success: false, error: 'Invalid index' }
    const removed = sessionData.accounts.splice(index, 1)[0]
    if (sessionData.accounts.length === 0) {
      sessionData = null
      try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath) } catch {}
    } else {
      if (sessionData.activeIndex >= sessionData.accounts.length) sessionData.activeIndex = 0
      persist()
    }
    logger.log(`Removed account ${removed.account.name}`)
    return { success: true }
  })

  ipcMain.handle('auth:refresh', async () => {
    if (!sessionData || sessionData.accounts.length === 0) {
      return { success: false } as { success: false }
    }
    const active = sessionData.accounts[sessionData.activeIndex]
    try {
      const verified = await azVerify(active.account)
      active.account = verified
      active.savedAt = new Date().toISOString()
      persist()
      return { success: true, account: verified } as IAuthResponse
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      logger.error('Failed to refresh session:', msg)
      if (/invalid|banned|401|403|422/i.test(msg)) {
        sessionData.accounts.splice(sessionData.activeIndex, 1)
        if (sessionData.accounts.length === 0) {
          sessionData = null
          try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath) } catch {}
        } else {
          if (sessionData.activeIndex >= sessionData.accounts.length) sessionData.activeIndex = 0
          persist()
        }
        return { success: false, error: msg }
      }
      return { success: true, account: active.account } as IAuthResponse
    }
  })

  ipcMain.handle('auth:logout', async (_event, account?: Account) => {
    if (account && sessionData) {
      const idx = sessionData.accounts.findIndex((a) => a.account.name === account.name)
      if (idx !== -1) {
        await azLogout(sessionData.accounts[idx].account)
        sessionData.accounts.splice(idx, 1)
        if (sessionData.accounts.length === 0) {
          sessionData = null
          try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath) } catch {}
        } else {
          if (sessionData.activeIndex >= sessionData.accounts.length) sessionData.activeIndex = 0
          persist()
        }
      }
    } else if (sessionData) {
      await azLogout(sessionData.accounts[sessionData.activeIndex].account)
      sessionData = null
      try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath) } catch {}
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
      if (!sessionData) sessionData = { accounts: [], activeIndex: 0 }
      const existing = sessionData.accounts.findIndex((a) => a.account.name.toLowerCase() === account.name.toLowerCase())
      if (existing !== -1) {
        sessionData.accounts[existing].account = account
        sessionData.accounts[existing].savedAt = new Date().toISOString()
        sessionData.activeIndex = existing
      } else {
        sessionData.accounts.push({ account, savedAt: new Date().toISOString() })
        sessionData.activeIndex = sessionData.accounts.length - 1
      }
      persist()
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
