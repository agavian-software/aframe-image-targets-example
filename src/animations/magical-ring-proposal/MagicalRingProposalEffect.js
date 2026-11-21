const {SpriteBatch} = require('../shared/sprite-batch')
const {acquireProposalAssets} = require('./assets')
const {DEFAULT_MESSAGE, drawProposalMessage} = require('./text')
const {mix, smooth, getProposalFrame, getProposalLayout, getProposalSparkle, getProposalPetal} = require('./timeline')

const DEFAULTS = Object.freeze({
  enabled: true, message: DEFAULT_MESSAGE, coupleNames: '', width: 1, pictureHeight: 1,
  size: 1, boxSize: 0.4, ringSize: 0.26, bannerSize: 0.95,
  offsetX: 0, offsetY: 0, duration: 8, speed: 1,
  showMessage: true, showHeart: true, showPetals: true, showFireworks: true,
  showHearts: true, showSparkles: true, particleCount: 64, petalCount: 32,
  textColor: '#fff1b8', sparkleColor: '#ffd778', maxTextureSize: 768,
  assetBase: './animations/magical-ring-proposal/assets',
})
const bool = (value, fallback) => value == null ? fallback : value === true || value === 1 ||
  (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()))
const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback
const normalizeOptions = (input = {}) => {
  const result = {...DEFAULTS, ...input}
  for (const key of ['enabled', 'showMessage', 'showHeart', 'showPetals', 'showFireworks', 'showHearts', 'showSparkles']) {
    result[key] = bool(input[key], DEFAULTS[key])
  }
  for (const [key, min, max] of [['width', 0.001, 100], ['pictureHeight', 0.001, 100],
    ['size', 0.15, 3], ['boxSize', 0.15, 0.9], ['ringSize', 0.1, 0.6], ['bannerSize', 0.4, 1.5],
    ['offsetX', -3, 3], ['offsetY', -3, 0], ['duration', 0.5, 60], ['speed', 0.1, 3],
    ['particleCount', 0, 96], ['petalCount', 0, 48], ['maxTextureSize', 256, 1024]]) {
    result[key] = finite(result[key], DEFAULTS[key], min, max)
  }
  for (const key of ['particleCount', 'petalCount', 'maxTextureSize']) result[key] = Math.round(result[key])
  for (const key of ['message', 'coupleNames']) result[key] = String(result[key] ?? '')
  return result
}
const requiredAssets = (options) => {
  const names = ['closed', 'open', 'ring']
  for (const [flag, name] of [['showMessage', 'banner'], ['showHeart', 'heart'],
    ['showPetals', 'petals'], ['showFireworks', 'fireworks'], ['showHearts', 'hearts']]) {
    if (options[flag]) names.push(name)
  }
  return names
}

class MagicalRingProposalEffect {
  constructor({THREE, document, parent, ...options}) {
    this.THREE = THREE; this.document = document; this.parent = parent
    this.options = normalizeOptions(options)
    this.group = new THREE.Group()
    this.group.name = 'MagicalRingProposalEffect'
    this.group.visible = false
    parent.add(this.group)
    this.clip = {matrix: {value: new THREE.Matrix4()}, bounds: {value: new THREE.Vector4()}}
    this.sparkleColor = new THREE.Color()
    this.batches = {}; this.generatedTextures = []; this.textures = {}
    this.elapsed = 0; this.generation = 0; this.ready = false; this.tracked = false; this.disposed = false
    this.configure(options)
  }

  get time() { return this.elapsed * 8 / this.options.duration * this.options.speed }

  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    const names = requiredAssets(this.options)
    const base = new URL(this.options.assetBase, this.document.baseURI).href
    const key = `${base}|${this.options.maxTextureSize}|${names.join(',')}|${this.options.showSparkles}`
    if (this.assetKey === key && this.loading) return this.loading
    this.clearVisuals()
    const previous = this.assets
    const generation = ++this.generation
    this.assetKey = key
    const assets = acquireProposalAssets(this.THREE, this.document, base, this.options.maxTextureSize, names)
    this.assets = assets; previous?.release()
    this.loading = assets.promise.then((textures) => {
      if (this.disposed || generation !== this.generation) return false
      this.textures = textures
      this.build()
      this.ready = true
      this.seek(this.elapsed)
      return true
    }).catch((error) => {
      if (this.disposed || generation !== this.generation) return false
      this.clearVisuals(); assets.release(); this.assets = null; this.assetKey = null; this.loading = null
      throw error
    })
    return this.loading
  }

  batch(name, texture, capacity, order, additive = false) {
    return this.batches[name] = new SpriteBatch(this.THREE, this.group, texture, capacity, this.clip, order, additive)
  }

  canvasTexture(canvas) {
    const texture = new this.THREE.CanvasTexture(canvas)
    texture.colorSpace = this.THREE.SRGBColorSpace
    texture.minFilter = this.THREE.LinearFilter; texture.magFilter = this.THREE.LinearFilter
    texture.generateMipmaps = false; this.generatedTextures.push(texture)
    return texture
  }

  build() {
    for (const [name, texture] of Object.entries(this.textures)) {
      const capacity = ['hearts', 'fireworks'].includes(name) ? 2 : 1
      const order = ['heart', 'fireworks'].includes(name) ? 18 : name === 'banner' ? 27 : name === 'ring' ? 23 : 20
      this.batch(name, texture, capacity, order, name === 'fireworks')
    }
    if (this.textures.banner) {
      this.messageCanvas = this.document.createElement('canvas')
      this.drawMessage()
      this.messageTexture = this.canvasTexture(this.messageCanvas)
      this.batch('message', this.messageTexture, 1, 28)
    }
    if (this.options.showSparkles) {
      const canvas = this.document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d')
      const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.25, '#ffffffcc'); glow.addColorStop(1, '#ffffff00')
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64)
      ctx.fillStyle = '#ffffff'; ctx.beginPath()
      ctx.moveTo(32, 2); ctx.lineTo(36, 28); ctx.lineTo(62, 32); ctx.lineTo(36, 36)
      ctx.lineTo(32, 62); ctx.lineTo(28, 36); ctx.lineTo(2, 32); ctx.lineTo(28, 28)
      ctx.closePath(); ctx.fill()
      this.batch('sparkles', this.canvasTexture(canvas), 96, 25)
    }
    if (this.options.showPetals) {
      // Individual petals accompany the supplied burst instead of repeating the
      // complete explosion image for every particle. One atlas-free draw call.
      const canvas = this.document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d')
      const gradient = ctx.createLinearGradient(10, 5, 52, 58)
      gradient.addColorStop(0, '#ffbdcf'); gradient.addColorStop(0.4, '#e9406d'); gradient.addColorStop(1, '#8e103c')
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(12, 12)
      ctx.bezierCurveTo(48, -8, 68, 30, 49, 55)
      ctx.bezierCurveTo(30, 70, 26, 38, 12, 12); ctx.fill()
      this.batch('fallingPetals', this.canvasTexture(canvas), 48, 26)
    }
  }

  drawMessage() {
    drawProposalMessage(this.messageCanvas, this.options.message, this.options.coupleNames, this.options.textColor)
  }

  configure(input = {}) {
    const previous = this.options
    const canonicalTime = this.time
    this.options = normalizeOptions({...previous, ...input})
    this.elapsed = canonicalTime * this.options.duration / 8 / this.options.speed
    this.sparkleColor.set(this.options.sparkleColor)
    if (this.messageCanvas && ['message', 'coupleNames', 'textColor'].some(key => previous[key] !== this.options[key])) {
      this.drawMessage(); this.messageTexture.needsUpdate = true
    }
    if (!this.options.enabled || !previous.enabled) this.elapsed = 0
    this.seek(this.elapsed)
  }

  start() {
    if (this.disposed || this.tracked) return
    this.tracked = true; this.seek(0)
  }

  reset() { this.tracked = false; this.seek(0) }

  update(deltaSeconds) {
    if (this.ready && this.tracked && this.options.enabled && !this.disposed) {
      this.seek(this.elapsed + Math.min(Math.max(deltaSeconds || 0, 0), 0.1))
    }
  }

  seek(elapsed) {
    this.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
    this.group.visible = this.ready && this.tracked && this.options.enabled && !this.disposed
    if (!this.ready) return
    const o = this.options, frame = getProposalFrame(this.elapsed, o.duration, o.speed)
    const aspects = Object.fromEntries(Object.entries(this.textures).map(([name, texture]) =>
      [name, texture.image.height / texture.image.width]))
    const layout = getProposalLayout(o, aspects)
    this.group.scale.setScalar(o.width * o.size)
    this.group.position.set(o.width * o.offsetX, o.width * o.offsetY, 0)
    // Hide the entire upper half-plane, including oversized/offset entrances.
    // The shared shader evaluates these bounds in the tracked anchor's frame.
    this.clip.bounds.value.set(-1e6, -0.008, 1e6, 1e6)
    const sprite = (name, props, index = 0) => {
      const batch = this.batches[name]
      if (!batch) return
      batch.set(index, {...props, height: props.height ?? props.width * aspects[name]})
      if (!index) batch.commit(props.alpha > 0.001 ? 1 : 0)
    }
    const boxY = mix(layout.boxHeight / 2, layout.boxY, frame.entrance)
    const closedWidth = o.boxSize * mix(1, 0.9, frame.opening)
    sprite('closed', {x: 0, y: boxY - layout.boxHeight / 2 + closedWidth * aspects.closed / 2,
      width: closedWidth, rotation: (1 - frame.entrance) * 0.035, alpha: frame.boxAlpha * (1 - frame.opening)})
    const openWidth = o.boxSize * mix(0.82, 1, frame.opening)
    sprite('open', {y: layout.boxY - layout.boxHeight / 2 + openWidth * aspects.open / 2,
      width: openWidth, alpha: frame.opening})
    const ringY = mix(layout.boxY + 0.02, layout.ringY + frame.bob, frame.ringRise)
    sprite('ring', {y: ringY, width: o.ringSize * (1 + Math.sin(frame.time * 2.8) * 0.02 * frame.ringRise),
      rotation: Math.sin(frame.time * 1.2) * 0.055 * frame.ringRise, alpha: frame.ringAlpha, z: 0.012})
    sprite('heart', {y: layout.ringY, width: layout.heartWidth * mix(0.15, 1, frame.heart) * (1 + frame.bob * 0.4),
      alpha: frame.heartAlpha * (0.86 + Math.sin(frame.time * 2) * 0.1), z: -0.006})
    const bannerWidth = o.bannerSize * mix(0.82, 1, frame.message)
    const bannerY = layout.bannerY - (1 - frame.message) * 0.045 + frame.bob * 0.3
    sprite('banner', {y: bannerY, width: bannerWidth, alpha: frame.message, z: 0.02})
    if (this.batches.message) {
      this.batches.message.set(0, {y: bannerY - layout.bannerHeight * 0.02,
        width: bannerWidth * 0.61, height: bannerWidth * 0.61 / 4, alpha: frame.message, z: 0.025})
      this.batches.message.commit(frame.message > 0.001 ? 1 : 0)
    }
    sprite('petals', {y: layout.ringY, width: mix(0.15, 1.2, smooth(6, 7, frame.time)),
      alpha: frame.celebration * 0.7, rotation: (frame.time - 6) * 0.08, z: 0.018})
    if (this.batches.fireworks) {
      for (let i = 0; i < 2; i++) {
        const age = frame.time - 6 - i * 0.45
        sprite('fireworks', {x: (i ? 1 : -1) * (layout.heartWidth / 2 + 0.2), y: layout.ringY + 0.02,
          width: mix(0.05, 0.72, smooth(0, 1.15, age)), rotation: i * 0.5,
          alpha: smooth(0, 0.16, age) * (1 - smooth(0.6, 1.45, age)), z: -0.01}, i)
      }
      this.batches.fireworks.commit(frame.time >= 6 && frame.time < 8 ? 2 : 0)
    }
    if (this.batches.hearts) {
      for (let i = 0; i < 2; i++) {
        sprite('hearts', {x: (i ? 1 : -1) * (layout.heartWidth / 2 + 0.19) + Math.sin(frame.time * 0.8 + i * 3) * 0.025,
          y: layout.ringY - 0.05 + Math.sin(frame.time * 1.15 + i * 2) * 0.045,
          width: 0.22 + i * 0.025, rotation: Math.sin(frame.time + i) * 0.055, alpha: frame.hearts, z: 0.01}, i)
      }
      this.batches.hearts.commit(frame.hearts > 0.001 ? 2 : 0)
    }
    if (this.batches.fallingPetals) {
      const count = frame.time >= 6 && frame.time < 8.25 ? o.petalCount : 0
      for (let i = 0; i < count; i++) {
        const p = getProposalPetal(i, frame, layout)
        this.batches.fallingPetals.set(i, {...p, width: p.size * p.flutter, height: p.size, z: 0.025})
      }
      this.batches.fallingPetals.commit(count)
    }
    if (this.batches.sparkles) {
      const count = frame.time < 2.5 ? 0 : frame.time >= 8 ? Math.min(10, o.particleCount) : o.particleCount
      for (let i = 0; i < count; i++) {
        const p = getProposalSparkle(i, frame, layout)
        this.batches.sparkles.set(i, {...p, width: p.size, height: p.size, color: this.sparkleColor, z: 0.02})
      }
      this.batches.sparkles.commit(count)
    }
    this.parent.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.parent.matrixWorld).invert()
  }

  clearVisuals() {
    this.ready = false; this.group.visible = false
    Object.values(this.batches).forEach(batch => batch.dispose())
    this.generatedTextures.forEach(texture => texture.dispose())
    this.batches = {}; this.generatedTextures = []; this.textures = {}
    this.messageCanvas = null; this.messageTexture = null
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true; ++this.generation
    this.clearVisuals(); this.assets?.release(); this.parent.remove(this.group)
  }
}

module.exports = {MagicalRingProposalEffect, DEFAULTS, normalizeOptions, requiredAssets}
