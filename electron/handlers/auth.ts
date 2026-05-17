import { ipcMain, app } from 'electron'
import { MicrosoftAuth, AzAuth } from 'eml-lib'
import type { Account } from 'eml-lib'
import logger from 'electron-log/main'
import * as fs from 'node:fs'
import * as path from 'node:path'

const sessionPath = path.join(app.getPath('userData'), 'session.json')

type AccountType = 'microsoft' | 'azuriom'

type StoredSession = {
  account: Account
  type: AccountType
  savedAt: string
}

export type IAuthResponse = { success: true; account: Account } | { success: false; error: string }

function getAccountType(account: Account): AccountType {
  return account.meta?.type === 'azuriom' ? 'azuriom' : 'microsoft'
}

function normalizeSession(data: unknown): StoredSession | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const raw = data as Partial<StoredSession> & { meta?: Account['meta'] }

  if (raw.account) {
    const accountType = raw.account.meta?.type === 'azuriom' || raw.meta?.type === 'azuriom' ? 'azuriom' : 'microsoft'
    return {
      account: raw.account,
      type: accountType,
      savedAt: raw.savedAt ?? new Date().toISOString()
    }
  }

  if ('accessToken' in raw && 'clientToken' in raw && 'name' in raw && 'uuid' in raw) {
    const account = raw as unknown as Account
    return {
      account,
      type: account.meta?.type === 'azuriom' ? 'azuriom' : 'microsoft',
      savedAt: new Date().toISOString()
    }
  }

  return null
}

export function registerAuthHandlers(mainWindow: Electron.BrowserWindow) {
  const auth = new MicrosoftAuth(mainWindow)
  const azAuth = new AzAuth('https://eminium.ovh/')

  const saveSession = (account: Account) => {
    const sessionData: StoredSession = {
      account,
      type: getAccountType(account),
      savedAt: new Date().toISOString()
    }

    fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2))
    logger.log(`✓ Session saved (${sessionData.type}) for ${account.name}`)
  }

  const loadSession = (): StoredSession | null => {
    if (!fs.existsSync(sessionPath)) {
      return null
    }

    try {
      const data = fs.readFileSync(sessionPath, 'utf-8')
      const parsed = normalizeSession(JSON.parse(data))

      if (!parsed) {
        logger.warn('Session file exists but could not be parsed')
        return null
      }

      logger.log(`✓ Session loaded (${parsed.type}) for ${parsed.account.name}`)
      return parsed
    } catch (err) {
      logger.error('Failed to load session:', err)
      return null
    }
  }

  ipcMain.handle('auth:login', async () => {
    try {
      const account = await auth.auth()
      saveSession(account)
      return { success: true, account } as IAuthResponse
    } catch (err: any) {
      logger.error('Failed to login:', err)
      return { success: false, error: err.message ?? 'Unknown error' }
    }
  })

  ipcMain.handle('auth:refresh', async () => {
    const session = loadSession()
    if (!session) {
      logger.log('No session found')
      return { success: false } as { success: false }
    }

    try {
      const { account, type } = session

      if (type === 'microsoft') {
        logger.log('🔄 Refreshing Microsoft session...')
        const valid = await auth.validate(account)
        if (valid) {
          logger.log('✓ Microsoft session is still valid')
          return { success: true, account } as IAuthResponse
        }

        logger.log('⟳ Microsoft token expired, refreshing...')
        const newAccount = await auth.refresh(account)
        saveSession(newAccount)
        return { success: true, account: newAccount } as IAuthResponse
      }

      logger.log('🔄 Verifying Azuriom session...')
      const verifiedAccount = await azAuth.verify(account)
      saveSession(verifiedAccount)
      logger.log('✓ Azuriom session is still valid')
      return { success: true, account: verifiedAccount } as IAuthResponse
    } catch (err: any) {
      logger.error('Failed to refresh session:', err)
      return { success: false, error: err.message ?? 'Unknown error' }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath)
      logger.log('✓ Session cleared')
    }
    return { success: true }
  })

  ipcMain.handle('auth:login-az', async (_event, payload: { username: string; password: string; twoFACode?: string }) => {
    try {
      logger.log(`🔐 Attempting Azuriom login for ${payload.username}...`)
      const account = await azAuth.auth(payload.username, payload.password, payload.twoFACode)
      saveSession(account)
      logger.log('✓ Azuriom login successful')
      return { success: true, account } as IAuthResponse
    } catch (err: any) {
      logger.error('Failed to login with AzAuth:', err)
      if (err.message?.includes('2fa') || err.message?.includes('Missing 2FA code')) {
        return { success: false, error: 'TWOFA_CODE_REQUIRED' }
      }
      return { success: false, error: err.message ?? 'Unknown error' }
    }
  })
}