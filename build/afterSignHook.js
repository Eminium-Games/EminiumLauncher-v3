require('dotenv').config()

const { notarize } = require('@electron/notarize')
const { spawnSync } = require('node:child_process')

const APPLE_ID                 = process.env.APPLE_ID
const APPLE_APP_SPECIIC_P      = process.env.APPLE_APP_SPECIIC_PASSWORD
const APPLE_TEAM_ID            = process.env.APPLE_TEAM_ID
const SKIP_NOTARIZE            = process.env.SKIP_NOTARIZE === 'true'

async function submitForNotarization(context) {
  const { appOutDir, electronPlatformName, packager } = context

  if (electronPlatformName !== 'darwin' || SKIP_NOTARIZE) {
    return
  }

  if (!APPLE_ID || !APPLE_APP_SPECIIC_P || !APPLE_TEAM_P) {
    throw new Error('Missing APPLE_ID / APPLE_APP_SPECIIC_PASSWORD / APPLE_TEAM_ID')
  }

  const appName               = packager.appInfo.productFileName
  const appBundlePath         = require('node:path').join(appOutDir, `${appName}.app`)

  stapleAppBundle(appBundlePath)

  await notarize({
    tool: 'notarytool',
    appBundlePath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIIC_P,
    teamId: APPLE_TEAM_ID
  })

  stapleAppBundle(appBundlePath)
}

function stapleAppBundle(appBundlePath) {
  const result = spawnSync('xcrun', ['stapler', 'staple', appBundlePath], { stdio: 'inherit' })

  if (result.status !== 0) {
    throw new Error(`stapler failed for ${appBundlePath}`)
  }
}

exports.default = submitForNotarization
