import { t } from '../i18n'
import { showToast } from './toast'

export interface LauncherNotification {
  id: string
  title: string
  message: string
  link?: string
  read: boolean
  createdAt: number
}

const STORAGE_KEY = 'eminium.notifications'
let notifications: LauncherNotification[] = []

function load(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) notifications = JSON.parse(raw)
  } catch {
    notifications = []
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 50)))
  } catch {
    // ignore
  }
}

load()

export function pushNotification(n: Omit<LauncherNotification, 'read' | 'createdAt'> & { read?: boolean }): void {
  if (notifications.some((x) => x.id === n.id)) return
  notifications.unshift({ ...n, read: n.read ?? false, createdAt: Date.now() })
  save()
  updateBell()
  showToast(n.title, 'info')
}

export function getNotifications(): LauncherNotification[] {
  return notifications
}

export function markAllRead(): void {
  notifications = notifications.map((n) => ({ ...n, read: true }))
  save()
  updateBell()
}

export function clearNotifications(): void {
  notifications = []
  save()
  updateBell()
}

export function unreadCount(): number {
  return notifications.filter((n) => !n.read).length
}

export function initNotificationsBell(): void {
  const btn = document.getElementById('btn-notifications')
  const dropdown = document.getElementById('notifications-dropdown')
  if (!btn || !dropdown) return

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    dropdown.classList.toggle('open')
    renderDropdown()
  })

  document.body.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target as Node) && e.target !== btn) {
      dropdown.classList.remove('open')
    }
  })

  updateBell()
}

function renderDropdown(): void {
  const dropdown = document.getElementById('notifications-dropdown')
  if (!dropdown) return
  const list = getNotifications()
  const items = list
    .map(
      (n) => `
      <div class="notification-item ${n.read ? '' : 'unread'}">
        <div class="notification-title">${n.title}</div>
        <div class="notification-message">${n.message}</div>
        ${n.link ? `<a href="${n.link}" target="_blank" rel="noopener noreferrer" class="notification-link">${t('notifications.open')}</a>` : ''}
      </div>`
    )
    .join('')

  dropdown.innerHTML = `
    <div class="notifications-header">
      <span>${t('notifications.title')}</span>
      <div class="notifications-actions">
        <button id="btn-notif-read-all" class="btn-link">${t('notifications.mark_all_read')}</button>
        <button id="btn-notif-clear" class="btn-link">${t('notifications.clear')}</button>
      </div>
    </div>
    <div class="notifications-list">
      ${list.length ? items : `<div class="notifications-empty">${t('notifications.empty')}</div>`}
    </div>
    <div class="notifications-footer">
      <a href="https://eminium.ovh/notifications" target="_blank" rel="noopener noreferrer">${t('notifications.azuriom')}</a>
    </div>
  `

  document.getElementById('btn-notif-read-all')?.addEventListener('click', () => {
    markAllRead()
    renderDropdown()
  })
  document.getElementById('btn-notif-clear')?.addEventListener('click', () => {
    clearNotifications()
    renderDropdown()
  })
}

function updateBell(): void {
  const badge = document.getElementById('notifications-badge')
  if (!badge) return
  const count = unreadCount()
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : String(count)
    badge.classList.remove('hidden')
  } else {
    badge.classList.add('hidden')
  }
}