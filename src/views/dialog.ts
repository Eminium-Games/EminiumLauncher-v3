import logger from 'electron-log/renderer'

export type ButtonType = 'ok' | 'cancel' | 'danger' | 'other'

export interface DialogButton {
  text: string
  type: ButtonType
  action?: () => any
}

class DialogSystem {
  private readonly overlay: HTMLElement
  private readonly messageEl: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly buttonsEl: HTMLElement

  constructor() {
    this.overlay = document.getElementById('custom-dialog')!
    this.messageEl = document.getElementById('dialog-message')!
    this.titleEl = document.getElementById('dialog-title')!
    this.buttonsEl = document.getElementById('dialog-buttons')!
  }

  public async show<T = boolean>(message: string, buttons?: DialogButton[], title?: string): Promise<T> {
    return new Promise<T>((resolve) => {
      this.messageEl.innerText = message
      this.buttonsEl.innerHTML = ''

      if (title) {
        this.titleEl.innerText = title
        this.titleEl.classList.remove('hidden')
      } else {
        this.titleEl.classList.add('hidden')
      }

      const configButtons = buttons ?? [
        { text: 'Cancel', type: 'cancel' },
        { text: 'OK', type: 'ok' }
      ]

      configButtons.forEach((btnConfig) => {
        const btn = document.createElement('button')
        btn.innerText = btnConfig.text
        btn.className = `btn btn-${btnConfig.type === 'ok' ? 'secondary' : btnConfig.type === 'danger' ? 'danger' : 'secondary'}`

        btn.onclick = async () => {
          this.close()

          if (btnConfig.action) {
            const result = await btnConfig.action()
            resolve(result !== undefined ? result : (true as any))
          } else {
            switch (btnConfig.type) {
              case 'cancel':
                resolve(false as any)
                break
              case 'ok':
              case 'danger':
                resolve(true as any)
                break
              case 'other':
                logger.warn("The 'other' type button requires an action!")
                resolve(null as any)
                break
            }
          }
        }

        this.buttonsEl.appendChild(btn)
      })

      this.overlay.classList.remove('hidden')
    })
  }

  public async prompt(title: string, message: string, inputType: 'text' | 'password' = 'text'): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.messageEl.innerHTML = `${message}<br><input type="${inputType}" id="dialog-input" class="dialog-input" style="width: 100%; padding: 10px; margin-top: 15px; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--glass-bg); color: white;" />`
      this.buttonsEl.innerHTML = ''

      this.titleEl.innerText = title
      this.titleEl.classList.remove('hidden')

      const okBtn = document.createElement('button')
      okBtn.innerText = 'OK'
      okBtn.className = 'btn btn-secondary'
      okBtn.onclick = () => {
        const input = document.getElementById('dialog-input') as HTMLInputElement
        this.close()
        resolve(input.value || null)
      }

      const cancelBtn = document.createElement('button')
      cancelBtn.innerText = 'Cancel'
      cancelBtn.className = 'btn btn-secondary'
      cancelBtn.onclick = () => {
        this.close()
        resolve(null)
      }

      this.buttonsEl.appendChild(cancelBtn)
      this.buttonsEl.appendChild(okBtn)

      this.overlay.classList.remove('hidden')

      const input = document.getElementById('dialog-input') as HTMLInputElement
      input.focus()
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          okBtn.click()
        }
      })
    })
  }

  private close() {
    this.overlay.classList.add('hidden')
  }
}

export const Dialog = new DialogSystem()

