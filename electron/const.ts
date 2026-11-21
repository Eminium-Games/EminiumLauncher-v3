export const ADMINTOOL_URL = 'https://admintool.eminium.ovh'
export const EMINIUM_FACTIONS_PROFILE_SLUG = 'eminium-factions'
export const EMINIUM_FACTIONS_PROFILE_URL = 'https://admintool.eminium.ovh/dashboard/files-updater?profile=eminium-factions'

// Configuration d'autostart du serveur (se connecte et lance le jeu automatiquement)
export const AUTO_START_SERVER = {
  enabled: true,
  ip: '82.64.85.47',
  port: 25566
}

// Discord Rich Presence (optionnel) — crée une application sur https://discord.com/developers/applications
// et colle son Client ID ici. Laisse vide pour désactiver.
export const DISCORD_CLIENT_ID = '1484903800266293379'

export const AUTO_START_MINECRAFT = {
  version: '1.20.1',
  loader: {
    loader: 'forge' as const,
    version: '1.20.1-47.4.20'
  },
  modpackUrl: 'https://admintool.eminium.ovh/api/files-updater/eminium-factions'
}
