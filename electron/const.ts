export const ADMINTOOL_URL = 'https://admintool.eminium.ovh'
export const EMINIUM_FACTIONS_PROFILE_SLUG = 'eminium-factions'
export const EMINIUM_FACTIONS_PROFILE_URL = 'https://admintool.eminium.ovh/dashboard/files-updater?profile=eminium-factions'

// Configuration d'autostart du serveur (se connecte et lance le jeu automatiquement)
export const AUTO_START_SERVER = {
  enabled: true,
  ip: '82.64.85.47',
  port: 25566
}

export const AUTO_START_MINECRAFT = {
  version: '1.20.1',
  loader: {
    loader: 'forge' as const,
    version: '1.20.1-47.4.20'
  },
  modpackUrl: 'https://admintool.eminium.ovh/api/files-updater/eminium-factions'
}
