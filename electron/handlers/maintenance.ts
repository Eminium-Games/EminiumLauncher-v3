import { ipcMain } from 'electron'
import { Maintenance } from 'eml-lib'
import type { Account } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'

export function registerMaintenanceHandlers() {
  // When an account is provided, its pseudo is sent to the AdminTool which
  // answers with `canBypass: true` if the pseudo is in the bypass list.
  ipcMain.handle('maintenance:get', async (_event, account?: Account) => {
    // eml-lib types require an account, but the implementation tolerates
    // `undefined` (no `pseudo` header sent, no bypass possible).
    const maintenance = new Maintenance(ADMINTOOL_URL, account as Account)

    try {
      const status = await maintenance.getMaintenance()
      return status?.startTime && new Date(status.startTime) <= new Date() ? status : null
    } catch (err) {
      logger.error('Failed to fetch maintenance:', err)
      return null
    }
  })
}


