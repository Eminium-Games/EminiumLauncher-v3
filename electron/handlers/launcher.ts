import { ipcMain, BrowserWindow, app } from 'electron'
import { Launcher } from 'eml-lib'
import type { Account, IProfile } from 'eml-lib'
import type { IGameSettings } from './settings'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, AUTO_START_MINECRAFT } from '../const'
import { resolvePatchedJava } from './java-resolver'
import { attachStatsProvider } from './stats'
import { maybeSendCrashReport } from './crash-reports'

// Défense en profondeur contre CVE-2026-114938 ("Java4Shell") : ces variables
// d'environnement sont héritées par le process Java lancé par eml-lib et par
// les JVM auxiliaires (patcher, etc.).
process.env.JAVA_TOOL_OPTIONS = process.env.JAVA_TOOL_OPTIONS
  ? `${process.env.JAVA_TOOL_OPTIONS} -XX:+IgnoreUnrecognizedVMOptions -XX:-UseBASE64Intrinsics`
  : '-XX:+IgnoreUnrecognizedVMOptions -XX:-UseBASE64Intrinsics'

export function registerLauncherHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('game:launch', async (_event, payload: { account: Account; settings: IGameSettings; profileSlug: string }) => {
    const { account, settings, profileSlug } = payload
    const java = settings.java === 'system' ? { install: 'manual' as const, absolutePath: 'java' } : { install: 'auto' as const }
    logger.log('Launching')

    // Force l'usage d'un Java système patché si disponible (CVE-2026-114938),
    // uniquement si l'utilisateur a choisi "system" pour ne pas casser les
    // anciennes versions de Minecraft qui nécessitent Java 8.
    let resolvedJava = java
    if (settings.java === 'system') {
      try {
        const patched = await resolvePatchedJava()
        if (patched) {
          const major = parseInt(patched.version.split('.')[0], 10) || 0
          if (major >= 17) {
            resolvedJava = { install: 'manual' as const, absolutePath: patched.path }
            logger.log(`Forcing patched system Java: ${patched.path} (${patched.version})`)
          }
        }
      } catch (err) {
        logger.error('resolvePatchedJava failed, falling back to configured Java:', err)
      }
    }

    // Mitigation CVE-2026-114938 ("Java4Shell") : corruption mémoire dans le
    // décodeur Base64 accéléré AVX-512 VBMI d'OpenJDK (Java 17.0.6+, 21, 25,
    // 27). Le décodeur accéléré est désactivé ; les autres optimisations
    // AVX-512 restent actives. Sur ARM64 le chemin de code n'existe pas et le
    // drapeau n'est pas reconnu, mais -XX:+IgnoreUnrecognizedVMOptions le rend
    // inoffensif.
    // -XX:+IgnoreUnrecognizedVMOptions évite un échec au démarrage sur les
    // anciennes JVM (Java 8/11) qui ne connaissent pas ces options.
    const java4ShellArgs: string[] = ['-XX:+IgnoreUnrecognizedVMOptions', '-XX:-UseBASE64Intrinsics']

    const launcher = new Launcher({
      url: ADMINTOOL_URL,
      root: 'eminiumgames',
      profile: { slug: profileSlug },
      minecraft: AUTO_START_MINECRAFT,
      account: account,
      cleaning: {
        enabled: true
      },
      java: {
        ...resolvedJava,
        args: java4ShellArgs
      },
      memory: {
        min: +settings.memory.min * 1024,
        max: +settings.memory.max * 1024
      },
      window: {
        width: settings.resolution.width,
        height: settings.resolution.height,
        fullscreen: settings.resolution.fullscreen
      }
    })

    launcher.on('launch_compute_download', () => {
      logger.log('Computing download...')
      mainWindow.webContents.send('game:launch_compute_download')
    })

    launcher.on('launch_download', (download) => {
      logger.log(`Downloading ${download.total.amount} files (${download.total.size} B).`)
      mainWindow.webContents.send('game:launch_download', download)
    })
    launcher.on('download_progress', (progress) => {
      mainWindow.webContents.send('game:download_progress', progress)
    })
    launcher.on('download_error', (error) => {
      logger.error(`Error downloading ${error.filename}: ${error.message}`)
      mainWindow.webContents.send('game:download_error', error)
    })
    launcher.on('download_end', (info) => {
      logger.log(`Downloaded ${info.downloaded.amount} files.`)
      mainWindow.webContents.send('game:download_end', info)
    })

    launcher.on('launch_install_loader', (loader) => {
      logger.log(`Installing loader ${loader.loader.loader} ${loader.loader.version}...`)
      mainWindow.webContents.send('game:launch_install_loader', loader)
    })

    launcher.on('launch_extract_natives', () => {
      logger.log('Extracting natives...')
      mainWindow.webContents.send('game:launch_extract_natives')
    })
    launcher.on('extract_progress', (progress) => {
      logger.log(`Extracted ${progress.filename}.`)
      mainWindow.webContents.send('game:extract_progress', progress)
    })
    launcher.on('extract_end', (info) => {
      logger.log(`Extracted ${info.amount} files.`)
      mainWindow.webContents.send('game:extract_end', info)
    })

    launcher.on('launch_copy_assets', () => {
      logger.log('Copying assets...')
      mainWindow.webContents.send('game:launch_copy_assets')
    })
    launcher.on('copy_progress', (progress) => {
      logger.log(`Copied ${progress.filename} to ${progress.dest}.`)
      mainWindow.webContents.send('game:copy_progress', progress)
    })
    launcher.on('copy_end', (info) => {
      logger.log(`Copied ${info.amount} files.`)
      mainWindow.webContents.send('game:copy_end', info)
    })

    launcher.on('launch_patch_loader', () => {
      logger.log('Patching loader...')
      mainWindow.webContents.send('game:launch_patch_loader')
    })
    launcher.on('patch_progress', (progress) => {
      mainWindow.webContents.send('game:patch_progress', progress)
    })
    launcher.on('patch_error', (error) => {
      logger.error(`Error patching ${error.filename}: ${error.message}`)
      mainWindow.webContents.send('game:patch_error', error)
    })
    launcher.on('patch_end', (info) => {
      logger.log(`Patched ${info.amount} files.`)
      mainWindow.webContents.send('game:patch_end', info)
    })

    launcher.on('launch_check_java', () => {
      logger.log('Checking Java...')
      mainWindow.webContents.send('game:launch_check_java')
    })
    launcher.on('java_info', (info) => {
      logger.log(`Using Java ${info.version} ${info.arch}`)
      // Avertissement CVE-2026-114938 : Java 17.0.6+ / 21 / 25 / 27 sur x86-64
      // sont vulnérables si le décodeur AVX-512 VBMI est actif. La mitigation
      // -XX:-UseBASE64Intrinsics est déjà appliquée, mais une mise à jour de
      // la JVM reste la vraie correction.
      try {
        const parts = String(info.version).split('.')
        const major = parseInt(parts[0], 10) || 0
        const patch = parseInt(parts[2] ?? parts[1] ?? '0', 10) || 0
        const vulnerable =
          major === 21 ||
          major === 25 ||
          major === 27 ||
          (major === 17 && patch >= 6)
        if (vulnerable && /64/.test(String(info.arch))) {
          logger.warn(
            `CVE-2026-114938 (Java4Shell): Java ${info.version} may be vulnerable. Mitigation -XX:-UseBASE64Intrinsics applied; please update the bundled JVM.`
          )
        }
      } catch (err) {
        logger.error('Java4Shell version check failed:', err)
      }
      mainWindow.webContents.send('game:java_info', info)
    })

    launcher.on('launch_clean', () => {
      logger.log('Cleaning game directory...')
      mainWindow.webContents.send('game:launch_clean')
    })
    launcher.on('clean_progress', (progress) => {
      mainWindow.webContents.send('game:clean_progress', progress)
    })
    launcher.on('clean_end', (info) => {
      logger.log(`Cleaned ${info.amount} files.`)
      mainWindow.webContents.send('game:clean_end', info)
    })

    launcher.on('launch_launch', (info) => {
      logger.log(`Launching Minecraft ${info.minecraft?.version ?? '?'} (${info.minecraft?.loader?.loader ?? 'vanilla'}${info.minecraft?.loader?.version ? ` ${info.minecraft.loader.version}` : ''})...`)
      mainWindow.webContents.send('game:launch_launch', info)
      if (settings.launcherAction === 'close') {
        setTimeout(() => app.quit(), 5000)
      } else if (settings.launcherAction === 'hide') {
        setTimeout(() => mainWindow.minimize(), 5000)
      }
      mainWindow.webContents.send('game:launched')
    })
    launcher.on('launch_data', (message) => {
      logger.log(message)
      mainWindow.webContents.send('game:launch_data', message)
    })
    launcher.on('launch_close', (code) => {
      logger.log(`Closed with code ${code}.`)
      mainWindow.webContents.send('game:launch_close', code)
    })

    launcher.on('launch_crash', async (crashData) => {
      logger.error(`Game crashed with code ${crashData.code}.`)
      mainWindow.webContents.send('game:launch_crash', { code: crashData.code, date: crashData.date })
      const sent = await maybeSendCrashReport(launcher, crashData)
      mainWindow.webContents.send('game:crash_report_result', { sent })
    })

    attachStatsProvider(launcher)

    launcher.on('launch_debug', (message) => {
      mainWindow.webContents.send('game:launch_debug', message)
    })
    launcher.on('patch_debug', (message) => {
      mainWindow.webContents.send('game:patch_debug', message)
    })

    try {
      launcher.launch()
    } catch (err) {
      logger.error('Launcher error:', err)
    }
  })
}

