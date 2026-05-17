import { ipcMain } from 'electron'
import { Profiles } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, EMINIUM_FACTIONS_PROFILE_SLUG, EMINIUM_FACTIONS_PROFILE_URL } from '../const'

export function registerProfilesHandlers() {
  ipcMain.handle('profiles:get', async () => {
    const profiles = new Profiles(ADMINTOOL_URL)

    try {
      const list = await profiles.getProfiles()
      const sorted = [
        ...list.filter((profile) => profile.slug === EMINIUM_FACTIONS_PROFILE_SLUG),
        ...list.filter((profile) => profile.isDefault && profile.slug !== EMINIUM_FACTIONS_PROFILE_SLUG),
        ...list.filter((profile) => !profile.isDefault && profile.slug !== EMINIUM_FACTIONS_PROFILE_SLUG)
      ]

      if (sorted.length === 0) {
        logger.warn(`Target profile ${EMINIUM_FACTIONS_PROFILE_SLUG} not found. Check ${EMINIUM_FACTIONS_PROFILE_URL}`)
      }

      return sorted
    } catch (err) {
      logger.error('Failed to fetch profiles:', err)
      return null
    }
  })
}
