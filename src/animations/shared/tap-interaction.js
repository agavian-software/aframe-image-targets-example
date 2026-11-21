const UI_SELECTOR = 'a, button, input, select, textarea, [role="button"], [contenteditable], nav, #videoPlayer, #videoMessage, .timeoutOverlay'

class TargetTapInteraction {
  constructor({element, document, onTap, allowed = () => true, now = () => Date.now()}) {
    this.element = element
    this.document = document
    this.onTap = onTap
    this.allowed = allowed
    this.now = now
    this.active = new Set()
    this.onDown = (event) => {
      this.active.add(event.pointerId)
      if (this.active.size !== 1 || event.isPrimary === false) { this.pointer = null; return }
      this.pointer = null
      if (event.button !== 0 || !this.allowed() || event.target?.closest?.(UI_SELECTOR) ||
        !(event.target === this.element || this.element.contains?.(event.target))) return
      this.pointer = {id: event.pointerId, x: event.clientX, y: event.clientY, at: this.now()}
    }
    this.onUp = (event) => {
      this.active.delete(event.pointerId)
      const pointer = this.pointer
      this.pointer = null
      if (!pointer || this.active.size || pointer.id !== event.pointerId || !this.allowed() ||
        this.now() - pointer.at > 600 || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10 ||
        event.target?.closest?.(UI_SELECTOR)) return
      const rect = this.element.getBoundingClientRect()
      if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.left + rect.width ||
        event.clientY < rect.top || event.clientY > rect.top + rect.height) return
      if (this.onTap(event.clientX, event.clientY, rect) && event.cancelable) event.preventDefault()
    }
    this.onCancel = () => this.reset()
    document.addEventListener('pointerdown', this.onDown, true)
    document.addEventListener('pointerup', this.onUp, true)
    document.addEventListener('pointercancel', this.onCancel, true)
  }
  reset() { this.pointer = null; this.active.clear() }
  dispose() {
    this.reset()
    this.document.removeEventListener('pointerdown', this.onDown, true)
    this.document.removeEventListener('pointerup', this.onUp, true)
    this.document.removeEventListener('pointercancel', this.onCancel, true)
  }
}

module.exports = {TargetTapInteraction}
