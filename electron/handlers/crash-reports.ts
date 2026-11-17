import { ipcMain } from 'electron'
import { CrashReport } from 'eml-lib'
import type { Launcher } from 'eml-lib'
import type { CrashData } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'
import { readSettings } from './settings'

let crashReport: CrashReport | null = null

function getCrashReport(): CrashReport {
  if (!crashReport) crashReport = new CrashReport(ADMINTOOL_URL)
  return crashReport
}

type PendingCrash = { launcher: Launcher; crashData: CrashData }
let pendingCrash: PendingCrash | null = null

export function isCrashReportEnabled(): boolean {
  try {
    return readSettings().telemetry.crashReportsEnabled
  } catch {
    return false
  }
}

/** Send a crash report if the user opted in. Never throws. */
export async function maybeSendCrashReport(launcher: Launcher, crashData: CrashData): Promise<boolean> {
  if (!isCrashReportEnabled()) {
    pendingCrash = { launcher, crashData }
    return false
  }
  try {
    await getCrashReport().send(launcher, crashData)
    logger.log('Crash report sent')
    return true
  } catch (err) {
    logger.error('Failed to send crash report:', err)
    return false
  }
}

export function registerCrashReportHandlers() {
  // One-shot send after the user consents from the crash dialog (opt-in kept off).
  ipcMain.handle('crash:send-pending', async () => {
    const pending = pendingCrash
    pendingCrash = null
    if (!pending) return { success: false, error: 'No pending crash report' }
    try {
      await getCrashReport().send(pending.launcher, pending.crashData)
      logger.log('Crash report sent (one-shot consent)')
      return { success: true }
    } catch (err) {
      logger.error('Failed to send crash report:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('crash:discard-pending', async () => {
    pendingCrash = null
    return { success: true }
  })
}
