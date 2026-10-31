import type { Account, IAvatar, ICape, ISkin } from 'eml-lib'
import logger from 'electron-log/renderer'
import shared from './shared'

export type ViewName = 'loading' | 'login' | 'home' | 'settings'
export type BlockingViewName = 'maintenance' | 'update'

export function getUser() {
  return shared.account
}

export async function setUser(account: Account, assets: { skins: ISkin[] | null; capes: ICape[] | null; avatar: IAvatar | null }) {
  shared.account = account
  shared.skins = assets.skins
  shared.capes = assets.capes
  shared.avatar = assets.avatar
  await updateUserInterface()
}

export function logout() {
  shared.account = null
  shared.skins = null
  shared.capes = null
  shared.avatar = null
  const nameEl = document.getElementById('user-name')
  if (nameEl) nameEl.innerText = ''
}

async function updateUserInterface() {
  if (!shared.account || !shared.skins) return

  logger.log('Updating UI for user:', shared.account.name)

  const nameEl = document.getElementById('user-name')
  const avatarEl = document.getElementById('user-avatar') as HTMLImageElement
  const rankBadgeEl = document.querySelector('.rank-badge') as HTMLElement | null
  const nameSettingsEl = document.getElementById('settings-user-name')
  const uuidSettingsEl = document.getElementById('settings-user-uuid')
  const typeSettingsEl = document.getElementById('settings-user-type')
  const emailSettingsEl = document.getElementById('settings-user-email')
  const roleSettingsEl = document.getElementById('settings-user-role')
  const moneySettingsEl = document.getElementById('settings-user-money')
  const statusSettingsEl = document.getElementById('settings-user-status')
  const avatarSettingsEl = document.getElementById('settings-user-avatar') as HTMLImageElement

  if (nameEl) nameEl.innerText = shared.account.name
  if (rankBadgeEl) rankBadgeEl.innerText = (shared.account.userProperties?.role as string) ?? 'Member'
  const headUrl = shared.avatar?.url ?? `https://minotar.net/helm/${encodeURIComponent(shared.account.name)}/256.png`
  if (avatarEl) {
    avatarEl.onerror = () => {
      avatarEl.onerror = null
      avatarEl.src = 'https://minotar.net/helm/steve/256.png'
    }
    avatarEl.src = headUrl
  }
  if (nameSettingsEl) nameSettingsEl.innerText = shared.account.name
  if (uuidSettingsEl) uuidSettingsEl.innerText = `UUID: ${shared.account.uuid}`
  if (typeSettingsEl) typeSettingsEl.innerHTML = getAccountIcon(shared.account.meta.type)
  const props = shared.account.userProperties ?? {}
  if (emailSettingsEl) emailSettingsEl.innerText = props.email ? `Email: ${props.email}` : ''
  if (roleSettingsEl) roleSettingsEl.innerText = props.role ? `Role: ${props.role}` : ''
  if (moneySettingsEl) moneySettingsEl.innerText = typeof props.money === 'number' ? `Money: ${props.money}` : ''
  if (statusSettingsEl) {
    const verified = props.emailVerified ? 'Email verified' : 'Email not verified'
    const banned = props.banned ? `Banned${props.banReason ? ': ' + props.banReason : ''}` : 'Not banned'
    statusSettingsEl.innerText = `${verified} • ${banned}`
  }
  if (avatarSettingsEl) {
    avatarSettingsEl.onerror = () => {
      avatarSettingsEl.onerror = null
      avatarSettingsEl.src = 'https://minotar.net/helm/steve/256.png'
    }
    avatarSettingsEl.src = headUrl
  }

  shared.resetMainView()
  shared.resetSkinViews()
  shared.resetCapesViews()
}

export function setView(view: ViewName) {
  const target = document.querySelector(`.view[data-view="${view}"]`) as HTMLElement
  if (!target) return logger.error(`View ${view} not found`)

  const isOverlay = target.classList.contains('overlay')

  if (view === 'settings') resetSettingsTab()

  if (!isOverlay) {
    document.querySelectorAll('.view').forEach((el) => {
      if (!el.classList.contains('overlay')) {
        el.classList.remove('active')
      }
    })
  }

  target.classList.add('active')
}

export function setBlockingView(view: BlockingViewName) {
  setTimeout(() => {
    document.querySelector('div#view-loading')?.classList.add('loaded')
  }, 400)
  setTimeout(() => {
    document.querySelector(`div#view-${view}`)?.classList.add('loaded')
  }, 200)
}

export function closeOverlay(view: ViewName) {
  const target = document.querySelector(`.view[data-view="${view}"]`)
  target?.classList.remove('active')
}

function getAccountIcon(type: 'msa' | 'yggdrasil' | 'azuriom' | 'crack') {
  switch (type) {
    case 'msa':
      return '<i class="fa-brands fa-globe"></i>Eminium account'
    case 'yggdrasil':
      return '<i class="fa-solid fa-user"></i>Yggdrasil account'
    case 'azuriom':
      return '<i class="fa-brands fa-globe"></i>Azuriom account'
    case 'crack':
      return '<i class="fa-solid fa-user-slash"></i>Cracked account'
    default:
      return 'Unknown account type'
  }
}

function resetSettingsTab() {
  const tabButtons = document.querySelectorAll('.nav-btn')
  const tabContents = document.querySelectorAll('.tab-content')
  tabButtons.forEach((b) => b.classList.remove('active'))
  tabContents.forEach((content) => content.classList.remove('active'))

  tabButtons[0].classList.add('active')
  tabContents[0].classList.add('active')
}



