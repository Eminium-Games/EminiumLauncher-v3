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
}

