// @ts-ignore - ko-co has no types
import { addSupportForTheKonamiCode } from 'ko-co'
import { showToast } from './views/toast'
import { startSnow, stopSnow, isSeasonalActive } from './seasonal'

export const EVENT_TIMEOUT = 30000
export function initKonami(): void {
  try {
    addSupportForTheKonamiCode({})
    document.addEventListener('konamicode', () => {
      showToast('Konami code activated! Snow mode on', 'success', 4000)
      document.body.classList.add('konami-active')
      if (!isSeasonalActive()) {
        startSnow()
        setTimeout(() => {
          stopSnow()
          document.body.classList.remove('konami-active')
          showToast('Snow mode off', 'info', 3000)
        }, EVENT_TIMEOUT)
      }
    })
  } catch (err) {
    console.warn('Konami init failed:', err)
  }
}