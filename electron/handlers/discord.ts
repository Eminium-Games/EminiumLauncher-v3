import logger from 'electron-log/main'

let rpc: any = null
let ready = false

export async function initDiscordRPC(clientId: string): Promise<void> {
  if (!clientId) {
    logger.warn('Discord RPC disabled: no client ID configured')
    return
  }
  try {
    const DiscordRPC = require('discord-rpc')
    DiscordRPC.register(clientId)
    rpc = new DiscordRPC.Client({ transport: 'ipc' })
    rpc.on('ready', () => {
      ready = true
      logger.log('Discord RPC ready')
      setTimeout(() => {
        setActivity({ state: 'In the launcher', details: 'Browsing' })
      }, 1000)
    })
    rpc.on('disconnected', () => {
      ready = false
      logger.warn('Discord RPC disconnected')
    })
    rpc.on('error', (err: any) => {
      logger.error('Discord RPC error:', err)
    })
    await rpc.login({ clientId })
    logger.log('Discord RPC login resolved')
  } catch (err: any) {
    logger.error('Discord RPC init failed:', err?.message ?? err, err?.stack)
    rpc = null
    ready = false
  }
}

export function setActivity(activity: { state?: string; details?: string; largeImageKey?: string; largeImageText?: string }): void {
  if (!rpc || !ready) {
    logger.warn('Discord setActivity skipped: rpc not ready')
    return
  }
  try {
    const payload: any = {
      state: activity.state,
      details: activity.details,
      instance: false
    }
    if (activity.largeImageKey) {
      payload.largeImageKey = activity.largeImageKey
      payload.largeImageText = activity.largeImageText
    }
    payload.startTimestamp = Date.now()
    rpc.setActivity(payload)
    logger.log('Discord activity set:', JSON.stringify(payload))
  } catch (err: any) {
    logger.error('Discord setActivity failed:', err?.message ?? err)
  }
}

export function clearActivity(): void {
  if (!rpc || !ready) return
  try {
    rpc.clearActivity()
  } catch (err: any) {
    logger.warn('Discord clearActivity failed:', err?.message ?? err)
  }
}