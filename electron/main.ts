import { app, Details, BrowserWindow, Menu, MenuItemConstructorOptions, nativeTheme, session, shell } from 'electron'

import path from 'node:path'

import { registerAuthHandlers } from './handlers/auth'
import { registerBackgroundHandlers } from './handlers/background'
import { registerBootstrapHandlers } from './handlers/bootstraps'
import { registerLauncherHandlers } from './handlers/launcher'
import { registerMaintenanceHandlers } from './handlers/maintenance'
import { registerNewsHandlers } from './handlers/news'
import { registerProfilesHandlers } from './handlers/profiles'
import { registerServerHandlers } from './handlers/server'
import { registerSettingsHandlers } from './handlers/settings'
import { registerSkinHandlers } from './handlers/skin'
import { registerUpdaterHandlers } from './handlers/updater'

import logger from 'electron-log/main'

const APP_TITLE = 'Eminium Games Launcher'
const BG_COLOR = '#121212'
const DEFAULT_WINDOW_WIDTH = 1280
const DEFAULT_WINDOW_HEIGHT = 720
const MIN_WINDOW_WIDTH = 1000
const MIN_WINDOW_HEIGHT = 700
const CSP_DIRECTIVE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "img-src 'self' data: http: https:",
  "connect-src 'self' https:",
  "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'"
].join('; ')

let mainWindow: BrowserWindow | null = null

function resolvePreloadPath() {
  return path.join(__dirname, 'preload.js')
}

function resolveRendererPath() {
  return path.join(__dirname, '../dist/index.html')
}

function resolveIconPath() {
  return path.join(__dirname, '../build/icon.png')
}

function enforceContentSecurityPolicy() {
  if (!app.isPackaged) return

  session.defaultSession.webRequest.onHeadersReceived((details, respond) => {
    respond({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_DIRECTIVE]
      }
    })
  })

  session.defaultSession.setPermissionRequestHandler((_wc, permission, permit) => {
    const PERMITTED = new Set<string>(['clipboard-read'])

    permit(PERMITTED.has(permission))
  })
}

function decideWindowOpen({ url }: { url: string }) {
  if (url.startsWith('https:') || url.startsWith('http:')) {
    shell.openExternal(url)
  }

  return { action: 'deny' as const }
}

function repelForeignNavigation(event: Electron.Event, destinationUrl: string) {
  const allowedOrigin = `file://${resolveRendererPath().replace(/\\/g, '/')}`

  if (destinationUrl !== allowedOrigin && !destinationUrl.startsWith('file://')) {
    event.preventDefault()
  }
}

function forgeSecureWindow() {
  nativeTheme.themeSource = 'dark'

  mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: APP_TITLE,
    autoHideMenuBar: true,
    backgroundColor: BG_COLOR,
    show: false,
    icon: resolveIconPath(),
    webPreferences: {
      preload: resolvePreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: !app.isPackaged,
      spellcheck: false,
      disableDialogs: false,
      navigateOnDragDrop: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(decideWindowOpen)
  mainWindow.webContents.on('will-navigate', repelForeignNavigation)
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  loadRendererSafely()
}

function loadRendererSafely() {
  if (!mainWindow) {
    return
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(resolveRendererPath())
  }
}

function configureAppMenu() {
  app.setAboutPanelOptions({
    applicationName: APP_TITLE,
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026 Eminium Games',
    credits: 'Developed with EML Lib & Electron',
    iconPath: resolveIconPath()
  })

  const viewSubmenu: Electron.MenuItemConstructorOptions[] = [
    { role: 'reload' },
    { role: 'forceReload' },
    { type: 'separator' },
    { role: 'togglefullscreen' }
  ]

  if (!app.isPackaged) {
    viewSubmenu.push({ type: 'separator' }, { role: 'toggleDevTools' })
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    { label: 'File', submenu: [{ role: 'close' }] },
    { label: 'View', submenu: viewSubmenu },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    { label: 'View', submenu: viewSubmenu }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function wireIpcHandlers() {
  if (!mainWindow) {
    return
  }

  registerAuthHandlers(mainWindow)
  registerProfilesHandlers()
  registerServerHandlers()
  registerSkinHandlers()
  registerNewsHandlers()
  registerBackgroundHandlers()
  registerMaintenanceHandlers()
  registerBootstrapHandlers(mainWindow)
  registerLauncherHandlers(mainWindow)
  registerUpdaterHandlers(mainWindow)
  registerSettingsHandlers()
}

function bootstrapApplication() {
  logger.initialize()
  enforceContentSecurityPolicy()
  configureAppMenu()
  forgeSecureWindow()
  wireIpcHandlers()
}

app.whenReady().then(bootstrapApplication)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(decideWindowOpen)
  contents.on('will-navigate', repelForeignNavigation)
})

app.on('child-process-gone', (event: Electron.Event, details: Details) => {
  if (details.type === 'GPU') {
    logger.error('GPU process crashed', { reason: details.reason })
  }
})
