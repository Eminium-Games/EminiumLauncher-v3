import './static/styles/_variables.scss'
import './static/styles/main.scss'
import './static/styles/loading.scss'
import './static/styles/login.scss'
import './static/styles/home.scss'
import './static/styles/settings.scss'
import './static/styles/maintenance.scss'
import './static/styles/update.scss'
import './static/styles/dialog.scss'

import { initLogin } from './views/login'
import { initHome } from './views/home'
import { initMaintenanceLogin } from './views/maintenance-login'
import { initSettings } from './views/settings'
import { bootstrap } from './init'
import { initI18n } from './i18n'

initI18n().then(() => {
  initLogin()
  initHome()
  initMaintenanceLogin()
  initSettings()
  bootstrap()
})

