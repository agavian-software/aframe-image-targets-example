const {SpriteBatch} = require('../shared/sprite-batch')
const {TargetTapInteraction} = require('../shared/tap-interaction')
const {acquireFlowerArchAssets} = require('./assets')
const {DEFAULT_MESSAGE, drawArchMessage} = require('./text')
const {mix, getFlowerArchFrame, getFlowerArchLayout, getScissorPose, getCutRibbonPose, getFlowerArchParticle} = require('./timeline')

const DEFAULTS = Object.freeze({
  enabled: true, message: DEFAULT_MESSAGE, coupleNames: '', anniversaryNumber: 0, startDate: '', endDate: '',
  width: 1, pictureHeight: 1, archScale: 1, ribbonSize: 1.08, scissorSize: 0.46, bannerSize: 1.4,
  duration: 6.5, speed: 1, closedVideoOpacity: 0, useFullArch: true,
  showMessage: true, showHint: true, showBloom: true, showOverlay: true, showSparkles: true, showPetals: true,
  particleCount: 48, petalCount: 24, textColor: '#744326', sparkleColor: '#ffd778', maxTextureSize: 768,
  assetBase: './animations/magical-wedding-flower-arch/assets',
})
const bool = (value, fallback) => value == null ? fallback : value === true || value === 1 ||
  (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()))
const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback
const normalizeOptions = (input = {}) => {
  const o = {...DEFAULTS, ...input}
  for (const key of ['enabled', 'useFullArch', 'showMessage', 'showHint', 'showBloom', 'showOverlay', 'showSparkles', 'showPetals']) o[key] = bool(o[key], DEFAULTS[key])
  for (const [key, min, max] of [['width', 0.001, 100], ['pictureHeight', 0.001, 100], ['archScale', 1, 1.8],
    ['ribbonSize', 0.8, 1.4], ['scissorSize', 0.2, 0.9], ['bannerSize', 0.6, 1.8],
    ['duration', 0.5, 60], ['speed', 0.1, 3], ['closedVideoOpacity', 0, 0.35], ['anniversaryNumber', 0, 1000],
    ['particleCount', 0, 72], ['petalCount', 0, 40], ['maxTextureSize', 256, 1024]]) o[key] = finite(o[key], DEFAULTS[key], min, max)
  for (const key of ['anniversaryNumber', 'particleCount', 'petalCount', 'maxTextureSize']) o[key] = Math.round(o[key])
  for (const key of ['message', 'coupleNames', 'startDate', 'endDate']) o[key] = String(o[key] ?? '')
  return o
}
const requiredAssets = o => {
  const names = ['leftArch', 'rightArch', 'ribbon', 'scissors', 'leftCut', 'rightCut']
  for (const [flag, name] of [['useFullArch', 'fullArch'], ['showBloom', 'bloom'], ['showMessage', 'banner'], ['showOverlay', 'overlay']]) if (o[flag]) names.push(name)
  return names
}
const isRibbonUvHit = (uv, alpha) => {
  const x = Math.floor(uv.x * alpha.width), y = Math.floor((1 - uv.y) * alpha.height)
  // The supplied bow has small transparent interior gaps. A local touch margin
  // bridges those gaps without accepting the empty corners of the sprite plane.
  const rx = Math.max(1, Math.ceil(alpha.width * 0.025)), ry = Math.max(1, Math.ceil(alpha.height * 0.06))
  for (const dx of [-rx, 0, rx]) for (const dy of [-ry, 0, ry]) {
    const px = Math.max(0, Math.min(alpha.width - 1, x + dx)), py = Math.max(0, Math.min(alpha.height - 1, y + dy))
    if (alpha.data[py * alpha.width + px] > 32) return true
  }
  return false
}
// Three nonoverlapping regions of one supplied sprite: fixed handles and two
// blade regions which rotate about the pin. This never draws extra scissors.
const maskScissorRegion = (batch, region) => {
  const cut = region === 0 ? 'if (blade) discard;' : region === 1 ? 'if (!blade || diagonal < 0.0) discard;' : 'if (!blade || diagonal >= 0.0) discard;'
  batch.mesh.material.fragmentShader = batch.mesh.material.fragmentShader.replace('vec4 color = texture2D(uMap, vUv);', `
    bool blade = vUv.x > 0.56 && vUv.y > 0.60;
    float diagonal = (vUv.y - 0.60) - (vUv.x - 0.58) * 0.95;
    ${cut}
    vec4 color = texture2D(uMap, vUv);`)
}

class MagicalWeddingFlowerArchEffect {
  constructor({THREE, document, parent, onVideoOpacity, ...options}) {
    this.THREE = THREE; this.document = document; this.parent = parent; this.onVideoOpacity = onVideoOpacity
    this.options = normalizeOptions(options)
    this.group = new THREE.Group(); this.group.name = 'MagicalWeddingFlowerArchEffect'; this.group.visible = false; parent.add(this.group)
    const matrix = {value: new THREE.Matrix4()}
    this.clip = {matrix, bounds: {value: new THREE.Vector4(1, 1, -1, -1)}}
    this.frameClip = {matrix, bounds: {value: new THREE.Vector4()}}
    this.sparkleColor = new THREE.Color(); this.ribbonColor = new THREE.Color()
    this.raycaster = new THREE.Raycaster(); this.pointerVector = new THREE.Vector2()
    this.batches = {}; this.generatedTextures = []; this.textures = {}
    this.elapsed = 0; this.cutAt = null; this.generation = 0; this.ready = false
    this.tracked = false; this.disposed = false; this.failed = false
    this.configure(options)
  }
  get time() { return this.elapsed * 6.5 / this.options.duration * this.options.speed }
  get canInteract() { return this.ready && this.tracked && this.options.enabled && !this.disposed && !this.failed && this.cutAt === null }
  get videoOpacity() {
    if (this.disposed || !this.options.enabled || this.failed) return 1
    return getFlowerArchFrame(this.elapsed, this.cutAt, this.options.duration, this.options.speed, this.options.closedVideoOpacity).videoOpacity
  }
  publishVideoOpacity() {
    const value = this.videoOpacity
    if (this.lastOpacity !== value) { this.lastOpacity = value; this.onVideoOpacity?.(value) }
  }
  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    const names = requiredAssets(this.options), base = new URL(this.options.assetBase, this.document.baseURI).href
    const key = `${base}|${this.options.maxTextureSize}|${names.join(',')}|${this.options.showHint}|${this.options.showSparkles}|${this.options.showPetals}`
    if (this.assetKey === key && this.loading) return this.loading
    this.clearVisuals(); this.failed = false; this.publishVideoOpacity()
    const previous = this.assets, generation = ++this.generation
    this.assetKey = key
    const assets = acquireFlowerArchAssets(this.THREE, this.document, base, this.options.maxTextureSize, names)
    this.assets = assets; previous?.release()
    this.loading = assets.promise.then(textures => {
      if (this.disposed || generation !== this.generation) return false
      this.textures = textures; this.build(); this.ready = true; this.seek(this.elapsed); return true
    }).catch(error => {
      if (this.disposed || generation !== this.generation) return false
      this.clearVisuals(); assets.release(); this.assets = null; this.assetKey = null; this.loading = null
      this.failed = true; this.publishVideoOpacity(); throw error
    })
    return this.loading
  }
  batch(name, texture, capacity, order, outside = true, parent = this.group, additive = false) {
    return this.batches[name] = new SpriteBatch(this.THREE, parent, texture, capacity, outside ? this.frameClip : this.clip, order, additive)
  }
  canvasTexture(canvas) {
    const texture = new this.THREE.CanvasTexture(canvas)
    texture.colorSpace = this.THREE.SRGBColorSpace; texture.minFilter = this.THREE.LinearFilter; texture.magFilter = this.THREE.LinearFilter
    texture.generateMipmaps = false; this.generatedTextures.push(texture); return texture
  }
  build() {
    const t = this.textures, THREE = this.THREE
    for (const name of ['leftArch', 'rightArch', 'fullArch', 'ribbon', 'leftCut', 'rightCut', 'bloom', 'banner', 'overlay']) {
      if (!t[name]) continue
      const outside = !['ribbon', 'leftCut', 'rightCut'].includes(name)
      const order = name === 'ribbon' ? 30 : name.endsWith('Cut') ? 31 : name === 'banner' ? 27 : name === 'bloom' ? 25 : 20
      // The bloom includes colored flowers; normal blending preserves its gold
      // and rose colors instead of washing the artwork out on a bright camera view.
      this.batch(name, t[name], name === 'bloom' ? 3 : 1, order, outside)
    }
    this.scissorGroup = new THREE.Group(); this.group.add(this.scissorGroup)
    maskScissorRegion(this.batch('scissors', t.scissors, 1, 33, false, this.scissorGroup), 0)
    this.bladePivots = []
    for (let i = 0; i < 2; i++) {
      const pivot = new THREE.Group(); this.scissorGroup.add(pivot); this.bladePivots.push(pivot)
      maskScissorRegion(this.batch(`blade${i}`, t.scissors, 1, 34, false, pivot), i + 1)
    }
    if (t.banner) {
      this.messageCanvas = this.document.createElement('canvas'); drawArchMessage(this.messageCanvas, this.options)
      this.messageTexture = this.canvasTexture(this.messageCanvas); this.batch('message', this.messageTexture, 1, 28)
    }
    if (this.options.showHint) {
      const canvas = this.document.createElement('canvas'); canvas.width = 768; canvas.height = 128
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff6e4ee'; ctx.fillRect(0, 0, 768, 128)
      ctx.fillStyle = '#744326'; ctx.font = '600 48px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Tap ribbon to reveal', 384, 64, 720); this.batch('hint', this.canvasTexture(canvas), 1, 29)
    }
    if (this.options.showSparkles) {
      const canvas = this.document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d'), glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.25, '#ffffffcc'); glow.addColorStop(1, '#ffffff00')
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#ffffff'; ctx.beginPath()
      ctx.moveTo(32, 2); ctx.lineTo(36, 28); ctx.lineTo(62, 32); ctx.lineTo(36, 36)
      ctx.lineTo(32, 62); ctx.lineTo(28, 36); ctx.lineTo(2, 32); ctx.lineTo(28, 28); ctx.closePath(); ctx.fill()
      this.batch('sparkles', this.canvasTexture(canvas), 72, 26)
    }
    if (this.options.showPetals) {
      const canvas = this.document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(10, 5, 52, 58)
      gradient.addColorStop(0, '#ffc2d0'); gradient.addColorStop(0.4, '#e9406d'); gradient.addColorStop(1, '#9e1640')
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(12, 12)
      ctx.bezierCurveTo(48, -8, 68, 30, 49, 55); ctx.bezierCurveTo(30, 70, 26, 38, 12, 12); ctx.fill()
      this.batch('petals', this.canvasTexture(canvas), 40, 24)
    }
    this.hitGeometry = new THREE.PlaneGeometry(1, 1); this.hitMaterial = new THREE.MeshBasicMaterial({side: THREE.DoubleSide, visible: false})
    this.ribbonHit = new THREE.Mesh(this.hitGeometry, this.hitMaterial); this.group.add(this.ribbonHit)
    const image = t.ribbon.image, canvas = this.document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    this.ribbonAlpha = {width: canvas.width, height: canvas.height, data: new Uint8Array(canvas.width * canvas.height)}
    for (let i = 0; i < this.ribbonAlpha.data.length; i++) this.ribbonAlpha.data[i] = rgba[i * 4 + 3]
  }
  configure(input = {}) {
    const previous = this.options, time = this.time; this.options = normalizeOptions({...previous, ...input})
    this.elapsed = time * this.options.duration / 6.5 / this.options.speed; this.sparkleColor.set(this.options.sparkleColor)
    if (this.messageCanvas && ['message', 'coupleNames', 'anniversaryNumber', 'startDate', 'endDate', 'textColor'].some(key => previous[key] !== this.options[key])) {
      drawArchMessage(this.messageCanvas, this.options); this.messageTexture.needsUpdate = true
    }
    if (!this.options.enabled || !previous.enabled) this.resetState()
    this.seek(this.elapsed)
  }
  resetState() { this.elapsed = 0; this.cutAt = null; this.interaction?.reset() }
  start() { if (!this.disposed && !this.tracked) { this.tracked = true; this.resetState(); this.seek(0) } }
  reset() { this.tracked = false; this.resetState(); this.seek(0) }
  triggerCut() {
    if (!this.canInteract) return false
    this.cutAt = this.time; this.interaction?.reset(); this.seek(this.elapsed); return true
  }
  update(deltaSeconds) {
    if (this.ready && this.tracked && this.options.enabled && !this.disposed) this.seek(this.elapsed + (Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0))
  }
  handleTap(clientX, clientY, camera, rect) {
    if (!this.canInteract || !camera || !rect?.width || !rect?.height) return false
    if (clientX < rect.left || clientX > rect.left + rect.width || clientY < rect.top || clientY > rect.top + rect.height) return false
    this.pointerVector.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1)
    this.group.updateWorldMatrix(true, true); camera.updateWorldMatrix(true, false); this.raycaster.setFromCamera(this.pointerVector, camera)
    const hit = this.raycaster.intersectObject(this.ribbonHit, false).find(({uv}) => isRibbonUvHit(uv, this.ribbonAlpha))
    return hit ? this.triggerCut() : false
  }
  attachInteraction({element, getCamera, allowed = () => true}) {
    if (!element || this.interaction?.element === element) return
    this.interaction?.dispose()
    this.interaction = new TargetTapInteraction({element, document: this.document, allowed: () => this.canInteract && allowed(), onTap: (x, y, rect) => this.handleTap(x, y, getCamera(), rect)})
  }
  seek(elapsed) {
    this.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0; this.publishVideoOpacity()
    this.group.visible = this.ready && this.tracked && this.options.enabled && !this.disposed
    if (!this.ready) return
    const o = this.options, t = this.textures, f = getFlowerArchFrame(this.elapsed, this.cutAt, o.duration, o.speed, o.closedVideoOpacity)
    const aspects = Object.fromEntries(Object.entries(t).map(([key, texture]) => [key, texture.image.height / texture.image.width]))
    const l = getFlowerArchLayout(o, aspects); this.group.scale.setScalar(o.width)
    this.frameClip.bounds.value.set(-o.width / 2 - 0.008, -o.pictureHeight / 2 - 0.008, o.width / 2 + 0.008, o.pictureHeight / 2 + 0.008)
    const sprite = (name, props, textureName = name) => {
      if (!this.batches[name]) return
      this.batches[name].set(0, {...props, height: props.height ?? props.width * aspects[textureName]})
      this.batches[name].commit(props.alpha > 0.001 ? 1 : 0)
    }
    this.ribbonColor.setRGB(1 + f.highlight * 0.25, 1 + f.highlight * 0.14, 1)
    const ribbonWidth = l.ribbonWidth * (1 + Math.sin(f.time * 2) * 0.004 * (f.active ? 0 : 1))
    sprite('ribbon', {width: ribbonWidth, alpha: f.cut ? 0 : f.alpha, color: this.ribbonColor, z: 0.04})
    this.ribbonHit.position.set(0, 0, 0.05); this.ribbonHit.scale.set(ribbonWidth, ribbonWidth * aspects.ribbon, 1)
    sprite('hint', {width: 0.82, height: 0.82 / 6, y: -l.ratio / 2 - 0.15, alpha: f.alpha * (f.active ? 0 : 1), z: 0.025})
    const scissor = getScissorPose(f, o), scissorHeight = scissor.width * aspects.scissors
    this.scissorGroup.position.set(scissor.x, scissor.y, 0.06); this.scissorGroup.rotation.z = scissor.rotation
    sprite('scissors', {width: scissor.width, alpha: f.scissorAlpha})
    for (let i = 0; i < 2; i++) {
      const px = scissor.width * 0.08, py = scissorHeight * 0.10
      this.bladePivots[i].position.set(px, py, 0.001); this.bladePivots[i].rotation.z = (i ? -1 : 1) * f.bladeAngle
      sprite(`blade${i}`, {x: -px, y: -py, width: scissor.width, height: scissorHeight, alpha: f.scissorAlpha}, 'scissors')
    }
    for (const side of ['left', 'right']) sprite(`${side}Cut`, {...getCutRibbonPose(side, f, l), z: 0.04})
    const halfAlpha = f.growth > 0 ? (o.useFullArch ? 1 - f.complete : 1) : 0
    for (const [i, name] of ['leftArch', 'rightArch'].entries()) {
      const fullWidth = l.archHeight / aspects[name], visibleHeight = l.archHeight * f.growth
      sprite(name, {width: fullWidth, height: visibleHeight, x: (i ? 1 : -1) * (l.archWidth / 2 - fullWidth / 2 + (1 - f.growth) * 0.12),
        y: l.baseY + visibleHeight / 2, uv: [0, 0, 1, f.growth], alpha: halfAlpha, z: 0.01})
    }
    sprite('fullArch', {width: l.archWidth, y: l.archY, alpha: f.complete, z: 0.012})
    if (this.batches.bloom) {
      for (let i = 0; i < 3; i++) {
        const width = i ? 0.45 + f.growth * 0.2 : l.archWidth * mix(0.25, 0.9, f.growth)
        this.batches.bloom.set(i, {x: i ? (i === 1 ? -1 : 1) * 0.56 : 0,
          y: i ? mix(l.baseY + 0.1, l.archY + 0.3, f.growth) : l.baseY + width * 0.35,
          width, height: width * aspects.bloom, alpha: f.bloom * (i ? 0.5 : 0.85), z: 0.02})
      }
      this.batches.bloom.commit(f.bloom > 0.001 ? 3 : 0)
    }
    const bannerWidth = o.bannerSize * mix(0.88, 1, f.message), bannerY = l.bannerY - (1 - f.message) * 0.04 + Math.sin(f.time * 1.3) * 0.004 * f.message
    sprite('banner', {width: bannerWidth, y: bannerY, alpha: f.message, z: 0.025})
    sprite('message', {width: bannerWidth * 0.60, height: bannerWidth * 0.10, y: bannerY + l.bannerHeight * 0.02, alpha: f.message, z: 0.03})
    sprite('overlay', {width: Math.max(1.48, l.ratio * 1.2), y: l.archY * 0.65,
      rotation: Math.sin(f.time * 0.5) * 0.045, alpha: f.celebration * (0.32 + Math.sin(f.time) * 0.05), z: 0.018})
    const sparkleCount = f.bloom > 0 || f.celebration > 0 ? (f.sequence >= 6.5 ? Math.min(10, o.particleCount) : o.particleCount) : 0
    const petalCount = f.celebration > 0 ? (f.sequence >= 6.5 ? Math.min(4, o.petalCount) : o.petalCount) : 0
    for (const [name, kind, count] of [['sparkles', 'sparkle', sparkleCount], ['petals', 'petal', petalCount]]) {
      if (!this.batches[name]) continue
      for (let i = 0; i < count; i++) this.batches[name].set(i, {...getFlowerArchParticle(i, f, l, kind), ...(kind === 'sparkle' ? {color: this.sparkleColor} : {}), z: 0.023})
      this.batches[name].commit(count)
    }
    this.parent.updateWorldMatrix(true, false); this.clip.matrix.value.copy(this.parent.matrixWorld).invert()
  }
  clearVisuals() {
    this.ready = false; this.group.visible = false
    Object.values(this.batches).forEach(batch => batch.dispose()); this.generatedTextures.forEach(texture => texture.dispose())
    this.hitGeometry?.dispose(); this.hitMaterial?.dispose(); this.ribbonHit?.removeFromParent(); this.scissorGroup?.removeFromParent()
    this.batches = {}; this.generatedTextures = []; this.textures = {}; this.ribbonAlpha = null
    this.messageCanvas = null; this.messageTexture = null; this.hitGeometry = null; this.hitMaterial = null
    this.ribbonHit = null; this.scissorGroup = null; this.bladePivots = []
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; ++this.generation; this.publishVideoOpacity(); this.interaction?.dispose()
    this.clearVisuals(); this.assets?.release(); this.parent.remove(this.group)
  }
}
module.exports = {MagicalWeddingFlowerArchEffect, DEFAULTS, normalizeOptions, requiredAssets, isRibbonUvHit}
