import { setUser, setView } from '../state'
import { auth, skin } from '../ipc'
import { Dialog } from './dialog'
import logger from 'electron-log/renderer'

export function initLogin() {
  const btn = document.getElementById('btn-login-ms') as HTMLButtonElement | null
  if (!btn) return

  btn.addEventListener('click', async () => {
    const originalText = btn.innerHTML

    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting...'

    try {
      const session = await auth.login()

      if (session.success) {
        const [__, skins, capes, avatar] = await Promise.all([skin.reload(session.account), skin.getSkin(), skin.getCape(), skin.getAvatar()])

        setUser(session.account, { skins, capes, avatar })
        setView('home')
      } else {
        logger.error(session.error)
        await Dialog.show('Login failed', [{ text: 'OK', type: 'ok' }])
      }
    } catch (err) {
      logger.error(err)
      await Dialog.show('An error occurred during login.', [{ text: 'OK', type: 'ok' }])
    } finally {
      btn.disabled = false
      btn.innerHTML = originalText
    }
  })

  const btnEm = document.getElementById('btn-login-em') as HTMLButtonElement | null
  if (!btnEm) return

  btnEm.addEventListener('click', async () => {
    const originalText = btnEm.innerHTML

    btnEm.disabled = true
    btnEm.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting...'

    try {
      const username = await Dialog.prompt('Username', 'Enter your Eminium username or email:')
      if (!username) {
        btnEm.disabled = false
        btnEm.innerHTML = originalText
        return
      }

      const password = await Dialog.prompt('Password', 'Enter your password:', 'password')
      if (!password) {
        btnEm.disabled = false
        btnEm.innerHTML = originalText
        return
      }

      let session = await auth.loginAz({ username, password })

      if (session.success) {
        const [__, skins, capes, avatar] = await Promise.all([skin.reload(session.account), skin.getSkin(), skin.getCape(), skin.getAvatar()])

        setUser(session.account, { skins, capes, avatar })
        setView('home')
      } else if (session.error === 'TWOFA_CODE_REQUIRED') {
        const twoFACode = await Dialog.prompt('Two-Factor Authentication', 'Enter your 2FA code:')
        if (!twoFACode) {
          btnEm.disabled = false
          btnEm.innerHTML = originalText
          return
        }

        session = await auth.loginAz({ username, password, twoFACode })

        if (session.success) {
          const [__, skins, capes, avatar] = await Promise.all([skin.reload(session.account), skin.getSkin(), skin.getCape(), skin.getAvatar()])

          setUser(session.account, { skins, capes, avatar })
          setView('home')
        } else {
          logger.error(session.error)
          await Dialog.show('Login failed', [{ text: 'OK', type: 'ok' }])
        }
      } else {
        logger.error(session.error)
        await Dialog.show('Login failed', [{ text: 'OK', type: 'ok' }])
      }
    } catch (err) {
      logger.error(err)
      await Dialog.show('An error occurred during login.', [{ text: 'OK', type: 'ok' }])
    } finally {
      btnEm.disabled = false
      btnEm.innerHTML = originalText
    }
  })
}

