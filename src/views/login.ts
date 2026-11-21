import { setUser, setView } from '../state'
import { auth, skin } from '../ipc'
import { Dialog } from './dialog'
import logger from 'electron-log/renderer'
import type { Account } from 'eml-lib'
import { t } from '../i18n'

/** Prompt for credentials and authenticate. Returns the account, or null if cancelled/failed. */
export async function requestEminiumLogin(): Promise<Account | null> {
  const username = await Dialog.prompt('Username', 'Enter your Eminium username or email:')
  if (!username) return null

  const password = await Dialog.prompt('Password', 'Enter your password:', 'password')
  if (!password) return null

  let session = await auth.loginAz({ username, password })

  if (!session.success && session.error === 'TWOFA_CODE_REQUIRED') {
    const twoFACode = await Dialog.prompt('Two-Factor Authentication', 'Enter your 2FA code:')
    if (!twoFACode) return null

    session = await auth.loginAz({ username, password, twoFACode })
  }

  if (!session.success) {
    logger.error(session.error)
    await Dialog.show('Login failed', [{ text: 'OK', type: 'ok' }])
    return null
  }

  return session.account
}

/** Load skins/capes/avatar, store the user and enter the home view. */
export async function enterWithAccount(account: Account) {
  const [__, skins, capes, avatar] = await Promise.all([skin.reload(account), skin.getSkin(), skin.getCape(), skin.getAvatar()])
  await setUser(account, { skins, capes, avatar })
  setView('home')
}

export function initLogin() {
  const btnEm = document.getElementById('btn-login-em') as HTMLButtonElement | null
  if (!btnEm) return

  const welcome = document.querySelector('#view-login h2')
  if (welcome) welcome.textContent = t('login.welcome')
  const btnLabel = btnEm.querySelector('span')
  if (btnLabel) btnLabel.textContent = t('login.connect')

  btnEm.addEventListener('click', async () => {
    const originalText = btnEm.innerHTML

    btnEm.disabled = true
    btnEm.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> ' + t('common.connecting')

    try {
      const account = await requestEminiumLogin()
      if (account) await enterWithAccount(account)
    } catch (err) {
      logger.error(err)
      await Dialog.show('An error occurred during login.', [{ text: 'OK', type: 'ok' }])
    } finally {
      btnEm.disabled = false
      btnEm.innerHTML = originalText
    }
  })
}
