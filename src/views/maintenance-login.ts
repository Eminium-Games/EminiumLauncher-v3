import { logout } from '../state'
import { auth, maintenance } from '../ipc'
import { enterWithAccount, requestEminiumLogin } from './login'
import { Dialog } from './dialog'
import logger from 'electron-log/renderer'
import type { Account } from 'eml-lib'

function setCapsule(account: Account | null) {
  const btnAdmin = document.getElementById('btn-maintenance-login')
  const capsule = document.getElementById('maintenance-profile')
  if (!btnAdmin || !capsule) return

  if (!account) {
    capsule.classList.add('hidden')
    btnAdmin.classList.remove('hidden')
    return
  }

  const avatarEl = document.getElementById('maintenance-profile-avatar') as HTMLImageElement | null
  const nameEl = document.getElementById('maintenance-profile-name')

  if (avatarEl) {
    avatarEl.onerror = () => {
      avatarEl.onerror = null
      avatarEl.src = 'https://minotar.net/helm/steve/32.png'
    }
    avatarEl.src = `https://minotar.net/helm/${encodeURIComponent(account.name)}/32`
  }
  if (nameEl) nameEl.innerText = account.name
  capsule.classList.remove('hidden')
  btnAdmin.classList.add('hidden')
}

export function initMaintenanceLogin() {
  const btnAdmin = document.getElementById('btn-maintenance-login') as HTMLButtonElement | null
  const capsule = document.getElementById('maintenance-profile')
  if (!btnAdmin || !capsule) return

  btnAdmin.addEventListener('click', async () => {
    btnAdmin.disabled = true

    try {
      const account = await requestEminiumLogin()
      if (!account) return

      await enterWithAccount(account)

      // Whitelisted pseudo? Enter the launcher, otherwise stay blocked.
      const status = await maintenance.get(account)
      if (status && status.canBypass) {
        logger.log(`Maintenance bypassed by ${account.name}`)
        setCapsule(null)
        // Same end-of-bootstrap steps: reveal #app and fade out the overlays.
        document.querySelector('div#view-loading')?.classList.add('loaded')
        document.querySelector('div#view-maintenance')?.classList.remove('loaded')
        document.body.classList.add('loaded')
      } else {
        logger.log(`${account.name} is not allowed to bypass maintenance`)
        setCapsule(account)
      }
    } catch (err) {
      logger.error(err)
      await Dialog.show('An error occurred during login.', [{ text: 'OK', type: 'ok' }])
    } finally {
      btnAdmin.disabled = false
    }
  })

  capsule.addEventListener('click', async () => {
    if (await Dialog.show('Log out?', [{ text: 'Cancel', type: 'cancel' }, { text: 'Logout', type: 'danger' }])) {
      await auth.logout()
      logout()
      setCapsule(null)
    }
  })
}

/** Show the profile capsule on the maintenance screen (e.g. restored session at startup). */
export function showMaintenanceProfile(account: Account) {
  setCapsule(account)
}
