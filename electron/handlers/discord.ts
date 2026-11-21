import logger from 'electron-log/main'

let rpc: any = null
let ready = false

export async function initDiscordRPC(clientId: string): Promise<void> {
  try {
    const DiscordRPC = require('discord-rpc')
    DiscordRPC.register(clientId)
    rpc = new DiscordRPC.Client({ transport: 'ipc' })
    rpc.on('ready', () => {
      ready = true
      logger.log('Discord RPC ready')
      setActivity({ state: 'In the launcher', details: 'Browsing' })
    })
    rpc.on('disconnected', () => {
      ready = false
      logger.log('Discord RPC disconnected')
    })
    await rpc.login({ clientId })
  } catch (err) {
    logger.warn('Discord RPC init failed (Discord not running?):', err)
  }
}

export function setActivity(activity: { state?: string; details?: string; largeImageKey?: string; largeImageText?: string }): void {
  if (!rpc || !ready) return
  try {
    rpc.setActivity({
      state: activity.state,
      details: activity.details,
      largeImageKey: activity.largeImageKey ?? 'logo',
      largeImageText: activity.largeImageText ?? 'Eminium Games Launcher',
      startTimestamp: Date.now(),
      instance: false
    })
  } catch (err) {
    logger.warn('Discord setActivity failed:', err)
  }
}

export function clearActivity(): void {
  if (!rpc || !ready) return
  try {
    rpc.clearActivity()
  } catch (err) {
    logger.warn('Discord clearActivity failed:', err)
  }
}