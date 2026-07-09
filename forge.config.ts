import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

const APP_ID = 'ovh.eminiumgames.launcher'

const forgeConfig: ForgeConfig = {
  packagerConfig: {
    name: 'Eminium Games Launcher',
    executableName: 'eminium-launcher',
    asar: true,
    icon: 'build/icon',
    appBundleId: APP_ID,
    osxSign: {
      identity: 'Developer ID Application: Eminium Games',
      // FIX: removed tool: notarytool
      optionsForFile: () => {
        return {
          hardenedRuntime: true,
          entitlements: 'build/entitlements.mac.plist',
          entitlementsInherit: 'build/entitlements.mac.plist'
        }
      }
    },
    osxNotarize: {
      // FIX: removed tool: 'notarytool',
      appleId: process.env.APPLE_ID || '',
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD || '',
      teamId: process.env.APPLE_TEAM_ID || ''
    }
  },

  makers: [
    new MakerSquirrel({}),
    new MakerDMG({
      icon: 'build/dmg-icon.icns',
      background: 'build/background.png',
      format: 'ULFO'
    }),
    // Resolved: Community AppImage maker defined as a plain string object configuration
    {
      name: 'electron-forge-maker-appimage',
      config: {
        options: {
          arch: 'x64'
        }
      }
    },
    new MakerDeb({
      options: {
        categories: ['Game'],
        maintainer: 'Eminium Games <contact@eminium.ovh>',
        icon: 'build/icon.png'
      }
    })
  ],

  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.ts' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts' }
      ],
      renderer: [{ name: 'main', config: 'vite.renderer.config.ts' }]
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
}

export default forgeConfig
