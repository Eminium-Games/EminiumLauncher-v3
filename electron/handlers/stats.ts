import { app } from 'electron'
import { Stats } from 'eml-lib'
import type { IStatProvider } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'
import { readSettings } from './settings'

let stats: Stats | null = null

export function getStats(): Stats | null {
  return stats
}

/** Initialize the stats system once at startup. Never throws, never blocks the launcher. */
export async function initStats(): Promise<void> {
  try {
    const settings = readSettings()
    if (!settings.telemetry.statsEnabled) {
      logger.log('Stats disabled by user, skipping initialization')
      return
    }

    const instance = new Stats(ADMINTOOL_URL, app.getVersion())
    await instance.initialize()
    stats = instance
    logger.log('Stats initialized')
  } catch (err) {
    logger.error('Failed to initialize stats:', err)
    stats = null
  }
}

/** Attach a Launcher (or Auth/Bootstrap) provider. Safe to call even if stats is disabled. */
export function attachStatsProvider(provider: IStatProvider): void {
  if (!stats) return
  try {
    stats.attach(provider)
  } catch (err) {
    logger.warn('Failed to attach stats provider:', err)
  }
}
