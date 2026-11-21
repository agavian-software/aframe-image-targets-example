const {getFullLetterText} = require('./text')
let nextReaderId = 0

class LoveLetterReader {
  constructor(document) { this.document = document }
  get isOpen() { return Boolean(this.dialog?.hasAttribute('open')) }
  setContent(options) {
    this.options = options
    if (this.body) this.body.textContent = getFullLetterText(options)
  }
  open(options) {
    this.setContent(options)
    if (this.isOpen) return
    if (!this.dialog) this.build()
    this.body.textContent = getFullLetterText(options)
    this.previousFocus = this.document.activeElement
    this.body.scrollTop = 0
    this.dialog.hidden = false
    if (this.dialog.showModal) this.dialog.showModal()
    else this.dialog.setAttribute('open', '')
    this.closeButton.focus()
  }
  build() {
    const doc = this.document, dialog = doc.createElement('dialog')
    this.dialog = dialog
    dialog.hidden = true
    dialog.className = 'magic-love-letter-reader'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.style.cssText = 'position:fixed;inset:0;box-sizing:border-box;width:min(92vw,640px);max-height:88vh;max-height:88dvh;margin:auto;padding:24px;border:2px solid #c79b55;border-radius:16px;background:#fff8e7;color:#65372f;box-shadow:0 16px 80px #0008;z-index:2147483647;'
    const title = doc.createElement('h2')
    title.id = `magic-love-letter-title-${++nextReaderId}`; title.textContent = 'Your love letter'
    title.style.cssText = 'margin:0 0 16px;font:600 24px Georgia,serif;padding-right:72px;'
    dialog.setAttribute('aria-labelledby', title.id)
    this.closeButton = doc.createElement('button')
    this.closeButton.type = 'button'; this.closeButton.textContent = 'Close'
    this.closeButton.style.cssText = 'position:absolute;right:16px;top:16px;min-height:44px;padding:8px 16px;border:1px solid #c79b55;border-radius:8px;background:#fff1d3;color:#65372f;font:16px system-ui;cursor:pointer;'
    this.body = doc.createElement('div')
    this.body.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;overflow-y:auto;max-height:65vh;max-height:65dvh;padding:8px 8px 12px 0;font:20px/1.65 Georgia,"Segoe UI Emoji",serif;overscroll-behavior:contain;touch-action:pan-y;'
    this.body.tabIndex = 0
    dialog.appendChild(title); dialog.appendChild(this.closeButton); dialog.appendChild(this.body)
    this.onClose = () => this.close()
    this.onCancel = event => { event.preventDefault(); this.close() }
    this.onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); this.close() }
      if (event.key === 'Tab') {
        event.preventDefault()
        if (doc.activeElement === this.closeButton) this.body.focus()
        else this.closeButton.focus()
      }
    }
    this.closeButton.addEventListener('click', this.onClose)
    dialog.addEventListener('cancel', this.onCancel)
    dialog.addEventListener('keydown', this.onKey)
    doc.body.appendChild(dialog)
  }
  close() {
    if (!this.isOpen) return
    if (this.dialog.close) this.dialog.close()
    else this.dialog.removeAttribute('open')
    this.dialog.hidden = true
    if (this.previousFocus?.isConnected) this.previousFocus.focus?.()
    this.previousFocus = null
  }
  dispose() {
    this.close()
    if (!this.dialog) return
    this.closeButton.removeEventListener('click', this.onClose)
    this.dialog.removeEventListener('cancel', this.onCancel)
    this.dialog.removeEventListener('keydown', this.onKey)
    this.dialog.remove(); this.dialog = null; this.body = null; this.closeButton = null
  }
}

module.exports = {LoveLetterReader}
