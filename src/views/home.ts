import { setView, getUser } from '../state'
import { crash, game, news, server, settings, profiles } from '../ipc'
import { Dialog } from './dialog'
import { initNotificationsBell, pushNotification } from './notifications'
import { showToast } from './toast'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import logger from 'electron-log/renderer'
import { t } from '../i18n'

marked.use({
  renderer: {
    link(link) {
      const href = link.href ?? '#'
      const titleAttr = link.title ? ` title="${link.title}"` : ''
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${link.text}</a>`
    }
  }
})

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const parseRssContent = (rawHtml: string) =>
  DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['target']
  })

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function initHome() {
  const body = document.body
  const playBtn = document.getElementById('btn-play')
  if (playBtn) playBtn.textContent = t('home.play')
  const settingsBtn = document.getElementById('btn-settings')
  const progressContainer = document.getElementById('launch-progress-container')
  const progressBar = document.getElementById('launch-progress-bar')
  const progressLabel = document.getElementById('launch-progress-label')
  const progressPercent = document.getElementById('launch-progress-percent')
  const statusDot = document.getElementById('server-status-dot')
  const statusText = document.getElementById('server-status-text')
  const playerCount = document.getElementById('player-count')
  const newsList = document.getElementById('news-list')
  const newsTitle = document.getElementById('news-title')
  if (newsTitle) newsTitle.textContent = t('home.news')
  const profileSelector = document.getElementById('profile-selector')
  const profileDropdown = document.getElementById('profile-dropdown')
  const currentProfileName = document.getElementById('current-profile-name')
  if (currentProfileName) currentProfileName.textContent = t('home.select_profile')

  let selectedProfile: any = null
  let allProfiles: any[] = []
  let totalToDownload = 0
  let totalDownloadedByType: { type: string; size: number }[] = []

  const loadProfiles = async () => {
    try {
      allProfiles = await profiles.get()
      logger.log(`Profiles loaded: ${allProfiles.length}`)
    } catch (err) {
      logger.error('Failed to load profiles:', err)
      return
    }
    if (allProfiles.length > 0) {
      const preferredProfile = allProfiles.find((profile) => profile.slug === 'eminium-factions') ?? allProfiles[0]
      selectProfile(preferredProfile)
      renderDropdown()
    }
  }

  const renderDropdown = () => {
    if (!profileDropdown) return
    profileDropdown.innerHTML = allProfiles
      .map(
        (p) => `
      <div class="profile-option ${selectedProfile?.id === p.id ? 'active' : ''}" data-id="${p.id}">
        ${p.name}
      </div>
    `
      )
      .join('')

    profileDropdown.querySelectorAll('.profile-option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).dataset.id
        const profile = allProfiles.find((p) => p.id === id)
        if (profile) selectProfile(profile)
        profileSelector?.classList.remove('open')
      })
    })
  }

  const selectProfile = (profile: any) => {
    selectedProfile = profile
    if (currentProfileName) currentProfileName.innerText = profile.name
    renderDropdown()
    updateServerStatus()
  }

  const updateServerStatus = async () => {
    if (statusDot) {
      statusDot.classList.remove('online', 'offline')
      statusDot.classList.add('pinging')
    }
    if (statusText) statusText.innerHTML = t('home.pinging')
    if (playerCount) playerCount.innerHTML = ''

    let status = null
    try {
      status = selectedProfile ? await server.getStatus(selectedProfile.ip, selectedProfile.port || 25565) : null
      logger.log(`Server status for ${selectedProfile?.name ?? 'none'}:`, status ? 'online' : 'offline')
    } catch (err) {
      logger.error('Failed to get server status:', err)
    }

    if (status) {
      if (statusDot) {
        statusDot.classList.remove('pinging', 'offline')
        statusDot.classList.add('online')
      }
      if (statusText) statusText.innerHTML = t('home.online')

      if (playerCount) {
        playerCount.innerHTML = `<i class="fa-fw fa-solid fa-users"></i>&nbsp;&nbsp;${status.players.online.toLocaleString()} / ${status.players.max.toLocaleString()}`
      }
    } else {
      if (statusDot) {
        statusDot.classList.remove('pinging', 'online')
        statusDot.classList.add('offline')
      }
      if (statusText) statusText.innerHTML = t('home.offline')
      if (playerCount) playerCount.innerHTML = ''
    }
  }

  const loadNews = async () => {
    if (!newsList) return
    newsList.innerHTML = '<div style="text-align:center; padding: 20px; color: #888;">' + t('home.loading_news') + '</div>'
    let feed
    try {
      feed = await news.getNews()
      logger.log(`News loaded: ${feed?.length ?? 0} items`)
    } catch (err) {
      logger.error('Failed to load news:', err)
      newsList.innerHTML = '<div style="text-align:center; color: #888;">' + t('home.no_news') + '</div>'
      return
    }

    newsList.innerHTML = ''

    if (!feed || feed.length === 0) {
      newsList.innerHTML = '<div style="text-align:center; color: #888;">' + t('home.no_news') + '</div>'
      return
    }

    feed.forEach((item) => {
      const author = item.author?.trim() || 'Eminium'
      const body = item.content?.trim() || item.description?.trim() || ''
      const articleHTML = `
        <article class="news-article">
          <div class="article-meta">
            <div class="author">
            <span class="date">Publié par</span>
              <img src="https://minotar.net/helm/${encodeURIComponent(author)}/24" alt="Author" />
              <span>${escapeHtml(author)}</span>
            </div>
            <span class="date">le ${formatDate(item.createdAt)}</span>
          </div>

          <h3>${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</h3>
          
          ${item.image ? `<img src="${escapeHtml(item.image)}" alt="News Image" onerror="this.style.display='none'"/>` : ''}

          <div class="article-content">
            ${parseRssContent(body)}
          </div>
        </article>
      `

      newsList.insertAdjacentHTML('beforeend', articleHTML)
    })
  }

  initNotificationsBell()

  loadProfiles()
  updateServerStatus()
  loadNews()

  const setIndeterminate = (active: boolean) => {
    if (!progressBar || !progressPercent) return

    if (active) {
      progressBar.classList.add('indeterminate')
      progressPercent.style.display = 'none'
    } else {
      progressBar.classList.remove('indeterminate')
      progressPercent.style.display = 'block'
    }
  }

  settingsBtn?.addEventListener('click', () => {
    setView('settings')
  })

  playBtn?.addEventListener('click', async () => {
    if (!selectedProfile) {
      await loadProfiles()
    }

    if (!selectedProfile) {
      logger.error('No server profile available, launch cancelled')
      return
    }

    setIndeterminate(true)
    if (playBtn) playBtn.style.display = 'none'
    if (progressContainer) progressContainer.classList.remove('hidden')
    if (progressBar) progressBar.style.width = '0%'
    if (progressPercent) progressPercent.innerText = '0%'

    const user = getUser()
    if (!user) return

    const config = await settings.get()

    const message = `
Ready to launch the game with the following settings:
      
👤 Account: ${user.name}
🧠 RAM: ${config.memory.min} - ${config.memory.max}
☕️ Java: ${config.java}
🖥️ Resolution: ${config.resolution.width}x${config.resolution.height}
🚀 Action on launch: ${config.launcherAction}
    `

    logger.log(message)
    game.launch({ account: user, settings: config, profileSlug: 'eminium-factions' })
  })

  profileSelector?.querySelector('.selected-profile')?.addEventListener('click', () => {
    profileSelector.classList.toggle('open')
  })

  body.addEventListener('click', (e) => {
    if (!profileSelector?.contains(e.target as Node)) {
      profileSelector?.classList.remove('open')
    }
  })

  game.launchComputeDownload(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = t('home.preparing_download')
    if (progressPercent) progressPercent.innerText = ''
  })
  game.launchDownload((download) => {
    setIndeterminate(false)
    totalToDownload = download.total.size
    if (progressLabel) progressLabel.innerText = `Downloading files...`
  })
  game.downloadProgress((progress) => {
    if (!totalDownloadedByType.find((t) => t.type === progress.type)) {
      totalDownloadedByType.push({ type: progress.type, size: progress.downloaded.size })
    } else {
      totalDownloadedByType[totalDownloadedByType.findIndex((t) => t.type === progress.type)].size = progress.downloaded.size
    }
    if (progressBar && progressLabel && progressPercent) {
      const downloadedSum = totalDownloadedByType.reduce((acc, curr) => acc + curr.size, 0)
      progressBar.style.width = `${Math.min((downloadedSum / totalToDownload) * 100, 100)}%`
      progressLabel.innerText = `Downloading ${progress.type === 'JAVA' ? 'Java' : 'game files'}...`
      progressPercent.innerText = `${Math.round(Math.min((downloadedSum / totalToDownload) * 100, 100))}%`
    }
  })
  game.launchInstallLoader(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = t('home.extracting')
    if (progressPercent) progressPercent.innerText = ''
  })
  game.launchExtractNatives(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = t('home.extracting')
  })
  game.launchCopyAssets(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = t('home.extracting')
  })
  game.launchPatchLoader(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = t('home.finalizing')
  })
  game.launchLaunch(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = t('home.launching')
  })
  game.launched(() => {
    setTimeout(() => {
      if (playBtn) playBtn.style.display = 'block'
      if (progressContainer) progressContainer.classList.add('hidden')
      if (progressBar) progressBar.style.width = '0%'
      if (progressPercent) progressPercent.innerText = ''
    }, 10000)
  })
  game.launchCrash(() => {
    setIndeterminate(false)
    if (playBtn) playBtn.style.display = 'block'
    if (progressContainer) progressContainer.classList.add('hidden')
    if (progressLabel) progressLabel.innerText = ''
    if (progressPercent) progressPercent.innerText = ''
  })
  game.crashReportResult(async ({ sent }) => {
    if (sent) {
      pushNotification({ id: 'crash-sent', title: t('dialog.crash_title'), message: t('dialog.crash_sent') })
      showToast(t('dialog.crash_sent'), 'success')
      return
    }
    const choice = await Dialog.show<string>(
      t('dialog.crash_prompt'),
      [
        { text: t('dialog.dont_send'), type: 'cancel' },
        { text: t('dialog.always_send'), type: 'other', action: async () => 'always' },
        { text: t('dialog.send_once'), type: 'ok', action: async () => 'once' }
      ],
      t('dialog.crash_title')
    )
    if (choice === 'always') {
      const config = await settings.get()
      await settings.set({ ...config, telemetry: { ...config.telemetry, crashReportsEnabled: true } })
      const res = await crash.sendPending()
      if (!res.success) logger.error('Failed to send pending crash report:', res.error)
    } else if (choice === 'once') {
      const res = await crash.sendPending()
      if (!res.success) logger.error('Failed to send pending crash report:', res.error)
    } else {
      await crash.discardPending()
    }
  })
}
