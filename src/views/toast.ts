export type ToastType = 'info' | 'success' | 'warning' | 'error'

let container: HTMLElement | null = null

function getContainer(): HTMLElement {
  if (container && document.body.contains(container)) return container
  container = document.getElementById('toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    container.className = 'toast-container'
    document.body.appendChild(container)
  }
  return container
}

export function showToast(message: string, type: ToastType = 'info', duration = 4000): void {
  const c = getContainer()
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  const iconMap: Record<ToastType, string> = {
    info: 'fa-circle-info',
    success: 'fa-circle-check',
    warning: 'fa-triangle-exclamation',
    error: 'fa-circle-xmark'
  }
  toast.innerHTML = `<i class="fa-solid ${iconMap[type]}"></i><span class="toast-message">${message}</span>`
  c.appendChild(toast)

  requestAnimationFrame(() => toast.classList.add('toast-visible'))

  const remove = () => {
    toast.classList.remove('toast-visible')
    setTimeout(() => toast.remove(), 250)
  }
  const timer = setTimeout(remove, duration)
  toast.addEventListener('click', () => {
    clearTimeout(timer)
    remove()
  })
}

export function showInfo(message: string, duration?: number): void {
  showToast(message, 'info', duration)
}
export function showSuccess(message: string, duration?: number): void {
  showToast(message, 'success', duration)
}
export function showWarning(message: string, duration?: number): void {
  showToast(message, 'warning', duration)
}
export function showError(message: string, duration?: number): void {
  showToast(message, 'error', duration ?? 6000)
}