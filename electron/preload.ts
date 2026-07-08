import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

import type { IGameSettings, ISystemInfo } from './handlers/settings'
import type { IAuthResponse } from './handlers/auth'

import type {
  Account,
  BootstrapsEvents,
  CleanerEvents,
  DownloaderEvents,
  FilesManagerEvents,
  IAvatar,
  IBackground,
  IBootstraps,
  ICape,
  IMaintenance,
  INews,
  IServerStatus,
  ISkin,
  JavaEvents,
  LauncherEvents,
  PatcherEvents
} from 'eml-lib'

type ProgressCallback<T> = (value: T) => void
type VoidCallback = () => void
type EventUnbinder = () => void

function bindEvent<TPayload>(channel: string, callback: ProgressCallback<TPayload>): EventUnbinder {
  const listener = (_event: IpcRendererEvent, value: TPayload) => callback(value)

  ipcRenderer.on(channel, listener)

  return () => ipcRenderer.removeListener(channel, listener)
}

function bindVoidEvent(channel: string, callback: VoidCallback): EventUnbinder {
  const listener = () => callback()

  ipcRenderer.on(channel, listener)

  return () => ipcRenderer.removeListener(channel, listener)
}

const rendererApi = {
  auth: {
    login: (): Promise<IAuthResponse> => ipcRenderer.invoke('auth:login'),
    loginAz: (payload: { username: string; password: string; twoFACode?: string }): Promise<IAuthResponse> =>
      ipcRenderer.invoke('auth:login-az', payload),
    refresh: (): Promise<IAuthResponse> => ipcRenderer.invoke('auth:refresh'),
    logout: (): Promise<{ success: boolean }> => ipcRenderer.invoke('auth:logout')
  },

  profiles: {
    get: (): Promise<Account[]> => ipcRenderer.invoke('profiles:get')
  },

  game: {
    launch: (payload: { account: Account; settings: IGameSettings; profileSlug: string }) => ipcRenderer.invoke('game:launch', payload),

    launchComputeDownload: (callback: VoidCallback) => bindVoidEvent('game:launch_compute_download', callback),
    launchDownload: (callback: ProgressCallback<LauncherEvents['launch_download'][0]>) => bindEvent('game:launch_download', callback),
    downloadProgress: (callback: ProgressCallback<DownloaderEvents['download_progress'][0]>) => bindEvent('game:download_progress', callback),
    downloadError: (callback: ProgressCallback<DownloaderEvents['download_error'][0]>) => bindEvent('game:download_error', callback),
    downloadEnd: (callback: ProgressCallback<DownloaderEvents['download_end'][0]>) => bindEvent('game:download_end', callback),
    launchInstallLoader: (callback: ProgressCallback<LauncherEvents['launch_install_loader'][0]>) =>
      bindEvent('game:launch_install_loader', callback),
    launchExtractNatives: (callback: VoidCallback) => bindVoidEvent('game:launch_extract_natives', callback),
    extractProgress: (callback: ProgressCallback<FilesManagerEvents['extract_progress'][0]>) => bindEvent('game:extract_progress', callback),
    extractEnd: (callback: ProgressCallback<FilesManagerEvents['extract_end'][0]>) => bindEvent('game:extract_end', callback),
    launchCopyAssets: (callback: VoidCallback) => bindVoidEvent('game:launch_copy_assets', callback),
    copyProgress: (callback: ProgressCallback<FilesManagerEvents['copy_progress'][0]>) => bindEvent('game:copy_progress', callback),
    copyEnd: (callback: ProgressCallback<FilesManagerEvents['copy_end'][0]>) => bindEvent('game:copy_end', callback),
    launchPatchLoader: (callback: VoidCallback) => bindVoidEvent('game:launch_patch_loader', callback),
    patchProgress: (callback: ProgressCallback<PatcherEvents['patch_progress'][0]>) => bindEvent('game:patch_progress', callback),
    patchError: (callback: ProgressCallback<PatcherEvents['patch_error'][0]>) => bindEvent('game:patch_error', callback),
    patchEnd: (callback: ProgressCallback<PatcherEvents['patch_end'][0]>) => bindEvent('game:patch_end', callback),
    launchCheckJava: (callback: VoidCallback) => bindVoidEvent('game:launch_check_java', callback),
    javaInfo: (callback: ProgressCallback<JavaEvents['java_info'][0]>) => bindEvent('game:java_info', callback),
    launchClean: (callback: VoidCallback) => bindVoidEvent('game:launch_clean', callback),
    cleanProgress: (callback: ProgressCallback<CleanerEvents['clean_progress'][0]>) => bindEvent('game:clean_progress', callback),
    cleanEnd: (callback: ProgressCallback<CleanerEvents['clean_end'][0]>) => bindEvent('game:clean_end', callback),
    launchLaunch: (callback: ProgressCallback<LauncherEvents['launch_launch'][0]>) => bindEvent('game:launch_launch', callback),
    launched: (callback: VoidCallback) => bindVoidEvent('game:launched', callback),
    launchData: (callback: ProgressCallback<LauncherEvents['launch_data'][0]>) => bindEvent('game:launch_data', callback),
    launchClose: (callback: ProgressCallback<unknown>) => bindEvent('game:launch_close', callback),
    launchDebug: (callback: ProgressCallback<LauncherEvents['launch_debug'][0]>) => bindEvent('game:launch_debug', callback),
    patchDebug: (callback: ProgressCallback<PatcherEvents['patch_debug'][0]>) => bindEvent('game:patch_debug', callback)
  },

  skin: {
    reload: (account: Account): Promise<ISkin> => ipcRenderer.invoke('skin:reload', account),
    getSkin: (account?: Account): Promise<ISkin | null> => ipcRenderer.invoke('skin:get_skin', account),
    getCape: (account?: Account): Promise<ICape | null> => ipcRenderer.invoke('skin:get_cape', account),
    getAvatar: (account?: Account): Promise<IAvatar | null> => ipcRenderer.invoke('skin:get_avatar', account),
    updateSkin: (source: string | Blob, model?: 'classic' | 'slim'): Promise<void> => ipcRenderer.invoke('skin:update_skin', source, model),
    switchCape: (id: string): Promise<void> => ipcRenderer.invoke('skin:switch_cape', id),
    deleteSkin: (id: string): Promise<void> => ipcRenderer.invoke('skin:delete_skin', id),
    hideCape: (): Promise<void> => ipcRenderer.invoke('skin:hide_cape')
  },

  server: {
    getStatus: (ip: string, port?: number): Promise<IServerStatus> => ipcRenderer.invoke('server:status', ip, port)
  },

  news: {
    getNews: (): Promise<INews[]> => ipcRenderer.invoke('news:get_news'),
    getCategories: (): Promise<string[]> => ipcRenderer.invoke('news:get_categories')
  },

  background: {
    get: (): Promise<IBackground | null> => ipcRenderer.invoke('background:get')
  },

  maintenance: {
    get: (): Promise<IMaintenance | null> => ipcRenderer.invoke('maintenance:get')
  },

  bootstraps: {
    check: (): Promise<IBootstraps> => ipcRenderer.invoke('bootstraps:check'),
    download: (): Promise<void> => ipcRenderer.invoke('bootstraps:download'),
    install: (): Promise<void> => ipcRenderer.invoke('bootstraps:install'),
    downloadProgress: (callback: ProgressCallback<DownloaderEvents['download_progress'][0]>) => bindEvent('bootstraps:download_progress', callback),
    downloadEnd: (callback: ProgressCallback<DownloaderEvents['download_end'][0]>) => bindEvent('bootstraps:download_end', callback),
    error: (callback: ProgressCallback<BootstrapsEvents['bootstraps_error'][0]>) => bindEvent('bootstraps:error', callback)
  },

  settings: {
    get: (): Promise<IGameSettings> => ipcRenderer.invoke('settings:get'),
    set: (settings: IGameSettings): Promise<void> => ipcRenderer.invoke('settings:set', settings),
    pickJava: (): Promise<string | null> => ipcRenderer.invoke('settings:pick_java')
  },

  system: {
    getInfo: (): Promise<ISystemInfo> => ipcRenderer.invoke('system:info')
  },

  updater: {
    checkNow: (): Promise<{ updated: boolean }> => ipcRenderer.invoke('updater:checkNow'),
    installNow: (): Promise<void> => ipcRenderer.invoke('updater:installNow'),
    onProgress: (callback: ProgressCallback<{ percent: number }>) => bindEvent('updater:progress', callback),
    onStatus: (callback: ProgressCallback<{ status: string; error?: string }>) => bindEvent('updater:status', callback)
  }
}

export type RendererApi = typeof rendererApi

contextBridge.exposeInMainWorld('api', rendererApi)
