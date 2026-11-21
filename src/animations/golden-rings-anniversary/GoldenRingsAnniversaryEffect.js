const {SpriteBatch} = require('../shared/sprite-batch')
const {acquireAnniversaryAssets} = require('./assets')
const {DEFAULT_MESSAGE, drawAnniversaryText} = require('./text')
const {mix, getAnniversaryFrame, getAnniversaryLayout, getRingPose, getAnniversarySparkle, getAnniversaryPetal} = require('./timeline')

const DEFAULTS = Object.freeze({
  enabled: true, message: DEFAULT_MESSAGE, coupleNames: '', anniversaryNumber: 0, startDate: '', endDate: '',
  width: 1, pictureHeight: 1, size: 1, ringSize: 0.42, bannerSize: 1.4,
  offsetX: 0, offsetY: 0, duration: 7.5, speed: 1,
  showMessage: true, showBurst: true, showHeart: true, showPetals: true, showOrbit: true, showSparkles: true,
  particleCount: 56, petalCount: 24, heartParticleCount: 12,
  textColor: '#744326', sparkleColor: '#ffd778', maxTextureSize: 768,
  assetBase: './animations/golden-rings-anniversary/assets',
})
const bool = (value, fallback) => value == null ? fallback : value === true || value === 1 ||
  (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()))
const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback
const normalizeOptions = (input = {}) => {
  const o = {...DEFAULTS, ...input}
  for (const key of ['enabled', 'showMessage', 'showBurst', 'showHeart', 'showPetals', 'showOrbit', 'showSparkles']) o[key] = bool(o[key], DEFAULTS[key])
  for (const [key, min, max] of [['width', 0.001, 100], ['pictureHeight', 0.001, 100], ['size', 0.15, 3],
    ['ringSize', 0.15, 0.9], ['bannerSize', 0.5, 1.8], ['offsetX', -3, 3], ['offsetY', 0, 3],
    ['duration', 0.5, 60], ['speed', 0.1, 3], ['anniversaryNumber', 0, 1000],
    ['particleCount', 0, 80], ['petalCount', 0, 40], ['heartParticleCount', 0, 24], ['maxTextureSize', 256, 1024]]) {
    o[key] = finite(o[key], DEFAULTS[key], min, max)
  }
  for (const key of ['anniversaryNumber', 'particleCount', 'petalCount', 'heartParticleCount', 'maxTextureSize']) o[key] = Math.round(o[key])
  for (const key of ['message', 'coupleNames', 'startDate', 'endDate']) o[key] = String(o[key] ?? '')
  return o
}
const requiredAssets = o => {
  const names = ['left', 'right', 'joined']
  for (const [flag, name] of [['showBurst', 'burst'], ['showHeart', 'heart'], ['showPetals', 'petals'],
    ['showMessage', 'banner'], ['showOrbit', 'orbit']]) if (o[flag]) names.push(name)
  return names
}

class GoldenRingsAnniversaryEffect {
  constructor({THREE, document, parent, ...options}) {
    this.THREE = THREE; this.document = document; this.parent = parent
    this.options = normalizeOptions(options)
    this.group = new THREE.Group(); this.group.name = 'GoldenRingsAnniversaryEffect'; this.group.visible = false
    parent.add(this.group)
    this.clip = {matrix: {value: new THREE.Matrix4()}, bounds: {value: new THREE.Vector4()}}
    this.sparkleColor = new THREE.Color()
    this.batches = {}; this.generatedTextures = []; this.textures = {}
    this.elapsed = 0; this.generation = 0; this.ready = false; this.tracked = false; this.disposed = false
    this.configure(options)
  }
  get time() { return this.elapsed * 7.5 / this.options.duration * this.options.speed }
  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    const names = requiredAssets(this.options)
    const base = new URL(this.options.assetBase, this.document.baseURI).href
    const key = `${base}|${this.options.maxTextureSize}|${names.join(',')}|${this.options.showSparkles}`
    if (this.assetKey === key && this.loading) return this.loading
    this.clearVisuals()
    const previous = this.assets, generation = ++this.generation
    this.assetKey = key
    const assets = acquireAnniversaryAssets(this.THREE, this.document, base, this.options.maxTextureSize, names)
    this.assets = assets; previous?.release()
    this.loading = assets.promise.then(textures => {
      if (this.disposed || generation !== this.generation) return false
      this.textures = textures; this.build(); this.ready = true; this.seek(this.elapsed)
      return true
    }).catch(error => {
      if (this.disposed || generation !== this.generation) return false
      this.clearVisuals(); assets.release(); this.assets = null; this.assetKey = null; this.loading = null
      throw error
    })
    return this.loading
  }
  batch(name, texture, count, order, additive = false) {
    return this.batches[name] = new SpriteBatch(this.THREE, this.group, texture, count, this.clip, order, additive)
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
      const order = name === 'heart' ? 18 : name === 'orbit' ? 20 : name === 'burst' ? 24 : name === 'banner' ? 26 : 22
      this.batch(name, texture, name === 'petals' ? 2 : 1, order, name === 'burst')
    }
    if (this.textures.banner) {
      this.messageCanvas = this.document.createElement('canvas')
      drawAnniversaryText(this.messageCanvas, this.options)
      this.messageTexture = this.canvasTexture(this.messageCanvas)
      this.batch('message', this.messageTexture, 1, 27)
    }
    if (this.options.showSparkles) {
      const canvas = this.document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d'), glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.3, '#ffffffbb'); glow.addColorStop(1, '#ffffff00')
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64)
      ctx.fillStyle = '#ffffff'; ctx.beginPath()
      ctx.moveTo(32, 2); ctx.lineTo(36, 28); ctx.lineTo(62, 32); ctx.lineTo(36, 36)
      ctx.lineTo(32, 62); ctx.lineTo(28, 36); ctx.lineTo(2, 32); ctx.lineTo(28, 28); ctx.closePath(); ctx.fill()
      this.batch('sparkles', this.canvasTexture(canvas), 80, 28)
    }
    if (this.options.showPetals) {
      const canvas = this.document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(10, 5, 52, 58)
      gradient.addColorStop(0, '#ffc2d0'); gradient.addColorStop(0.4, '#e9406d'); gradient.addColorStop(1, '#9e1640')
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(12, 12)
      ctx.bezierCurveTo(48, -8, 68, 30, 49, 55); ctx.bezierCurveTo(30, 70, 26, 38, 12, 12); ctx.fill()
      this.batch('fallingPetals', this.canvasTexture(canvas), 40, 25)
    }
    if (this.options.showOrbit) {
      const canvas = this.document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d')
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 5
      ctx.beginPath(); ctx.moveTo(32, 53)
      ctx.bezierCurveTo(24, 44, 7, 33, 7, 20); ctx.bezierCurveTo(7, 5, 24, 5, 32, 18)
      ctx.bezierCurveTo(40, 5, 57, 5, 57, 20); ctx.bezierCurveTo(57, 33, 40, 44, 32, 53); ctx.stroke()
      this.batch('heartParticles', this.canvasTexture(canvas), 24, 21)
    }
  }
  configure(input = {}) {
    const previous = this.options, time = this.time
    this.options = normalizeOptions({...previous, ...input})
    this.elapsed = time * this.options.duration / 7.5 / this.options.speed
    this.sparkleColor.set(this.options.sparkleColor)
    if (this.messageCanvas && ['message', 'coupleNames', 'anniversaryNumber', 'startDate', 'endDate', 'textColor'].some(key => previous[key] !== this.options[key])) {
      drawAnniversaryText(this.messageCanvas, this.options); this.messageTexture.needsUpdate = true
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
      this.seek(this.elapsed + (Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0))
    }
  }
  seek(elapsed) {
    this.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
    this.group.visible = this.ready && this.tracked && this.options.enabled && !this.disposed
    if (!this.ready) return
    const o = this.options, t = this.textures, f = getAnniversaryFrame(this.elapsed, o.duration, o.speed)
    const aspects = Object.fromEntries(Object.entries(t).map(([name, texture]) => [name, texture.image.height / texture.image.width]))
    const layout = getAnniversaryLayout(o, aspects), ratio = o.pictureHeight / o.width
    this.group.scale.setScalar(o.width * o.size)
    this.group.position.set(o.width * o.offsetX, o.width * o.offsetY, 0)
    const margin = Math.min(0.008, o.width * 0.008)
    // Clip the union of photo and video in the anchor's coordinates. This leaves
    // the side entrance visible while protecting the video at every scale/offset.
    this.clip.bounds.value.set(-o.width / 2 - margin, -o.pictureHeight - margin, o.width / 2 + margin, margin)
    const sprite = (name, props) => {
      if (!this.batches[name]) return
      this.batches[name].set(0, {...props, height: props.height ?? props.width * aspects[name]})
      this.batches[name].commit(props.alpha > 0.001 ? 1 : 0)
    }
    for (const side of ['left', 'right']) sprite(side, {...getRingPose(side, f, layout, o), z: side === 'left' ? 0.006 : 0.01})
    sprite('joined', {y: layout.ringY + f.bob, width: layout.joinedWidth * (1 + Math.sin(f.time * 2.4) * 0.009),
      rotation: Math.sin(f.time * 1.1) * 0.022, alpha: f.joined, z: 0.012})
    sprite('burst', {y: layout.ringY, width: layout.heartWidth * f.burstScale,
      rotation: f.time * 0.12, alpha: f.burst * 0.88, z: 0.02})
    sprite('heart', {y: layout.ringY + f.bob * 0.7, width: layout.heartWidth * mix(0.25, 1, f.heart),
      alpha: f.heart * (0.84 + Math.sin(f.time * 1.8) * 0.07), z: -0.01})
    const bannerWidth = o.bannerSize * mix(0.86, 1, f.message)
    const bannerY = layout.bannerY - (1 - f.message) * 0.045 + Math.sin(f.time * 1.4) * 0.004 * f.message
    sprite('banner', {width: bannerWidth, y: bannerY, alpha: f.message, z: 0.02})
    if (this.batches.message) {
      this.batches.message.set(0, {width: bannerWidth * 0.66, height: bannerWidth * 0.08,
        y: bannerY + layout.bannerHeight * 0.037, alpha: f.message, z: 0.026})
      this.batches.message.commit(f.message > 0.001 ? 1 : 0)
    }
    sprite('orbit', {y: layout.ringY + Math.sin(f.time * 0.8) * 0.025,
      width: layout.heartWidth * 1.24, rotation: Math.sin(f.time * 0.4) * 0.12,
      alpha: f.celebration * (0.42 + Math.sin(f.time) * 0.07), z: 0.018})
    if (this.batches.petals) {
      for (let i = 0; i < 2; i++) this.batches.petals.set(i, {
        x: (i ? 1 : -1) * (0.5 / o.size + 0.19),
        y: -ratio / o.size * 0.35 + Math.sin(f.time * 0.8 + i * 2) * 0.06,
        width: 0.38, height: 0.38 * aspects.petals, rotation: Math.sin(f.time * 0.7 + i) * 0.18,
        alpha: f.celebration * (f.time >= 7.5 ? 0.36 : 0.7), z: 0.014})
      this.batches.petals.commit(f.celebration > 0.001 ? 2 : 0)
    }
    if (this.batches.fallingPetals) {
      const count = f.time < 6 ? 0 : f.time >= 7.5 ? Math.min(4, o.petalCount) : o.petalCount
      for (let i = 0; i < count; i++) this.batches.fallingPetals.set(i, {...getAnniversaryPetal(i, f, ratio / o.size, o.size), z: 0.025})
      this.batches.fallingPetals.commit(count)
    }
    if (this.batches.sparkles) {
      const count = f.time < 2.95 ? 0 : f.time >= 7.5 ? Math.min(8, o.particleCount) : o.particleCount
      for (let i = 0; i < count; i++) {
        const p = getAnniversarySparkle(i, f, layout)
        this.batches.sparkles.set(i, {...p, height: p.width, color: this.sparkleColor, z: 0.03})
      }
      this.batches.sparkles.commit(count)
    }
    if (this.batches.heartParticles) {
      const count = f.heart <= 0 ? 0 : f.time >= 7.5 ? Math.min(6, o.heartParticleCount) : o.heartParticleCount
      for (let i = 0; i < count; i++) {
        const angle = i * 2.39996 + f.time * 0.28, width = 0.027 + i % 3 * 0.008
        this.batches.heartParticles.set(i, {x: Math.cos(angle) * layout.heartWidth * 0.62,
          y: layout.ringY + Math.sin(angle) * layout.heartWidth * 0.38,
          width, height: width, rotation: Math.sin(f.time * 0.5 + i) * 0.16,
          alpha: f.heart * (0.4 + Math.sin(f.time + i) * 0.15), color: this.sparkleColor, z: 0.015})
      }
      this.batches.heartParticles.commit(count)
    }
    this.parent.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.parent.matrixWorld).invert()
  }
  clearVisuals() {
    this.ready = false; this.group.visible = false
    Object.values(this.batches).forEach(batch => batch.dispose())
    this.generatedTextures.forEach(texture => texture.dispose())
    this.batches = {}; this.generatedTextures = []; this.textures = {}; this.messageCanvas = null; this.messageTexture = null
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; ++this.generation
    this.clearVisuals(); this.assets?.release(); this.parent.remove(this.group)
  }
}
module.exports = {GoldenRingsAnniversaryEffect, DEFAULTS, normalizeOptions, requiredAssets}
