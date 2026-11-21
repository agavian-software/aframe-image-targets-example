const {SpriteBatch} = require('../shared/sprite-batch')
const {TargetTapInteraction} = require('../shared/tap-interaction')
const {acquireLoveLetterAssets} = require('./assets')
const {LoveLetterReader} = require('./reader')
const {DEFAULT_MESSAGE, layoutLetterText, drawLoveLetterText} = require('./text')
const {mix, smooth, getLoveLetterFrame, getLoveLetterLayout, getFlightPose, getLovePetal, getLoveSparkle} = require('./timeline')

const DEFAULTS = Object.freeze({
  enabled: true, message: DEFAULT_MESSAGE, senderName: '', recipientName: '',
  width: 1, size: 1, envelopeSize: 0.52, letterSize: 0.78, wingSize: 0.36,
  offsetX: 0, offsetY: 0, entranceSide: 'left', duration: 9.5, speed: 1,
  allowRead: true, showWings: true, showSeal: true, showHeart: true,
  showPetals: true, showFireworks: true, showHearts: true, showSparkles: true,
  textColor: '#69392f', particleCount: 48, petalCount: 28, maxTextureSize: 768,
  assetBase: './animations/flying-love-letter/assets',
})
const bool = (value, fallback) => value == null ? fallback : value === true || value === 1 ||
  (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()))
const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback
const normalizeOptions = (input = {}) => {
  const result = {...DEFAULTS, ...input}
  for (const key of ['enabled', 'allowRead', 'showWings', 'showSeal', 'showHeart', 'showPetals', 'showFireworks', 'showHearts', 'showSparkles']) {
    result[key] = bool(input[key], DEFAULTS[key])
  }
  for (const [key, min, max] of [['width', 0.001, 100], ['size', 0.15, 3], ['envelopeSize', 0.25, 1],
    ['letterSize', 0.4, 1.5], ['wingSize', 0.15, 0.8], ['offsetX', -3, 3], ['offsetY', 0, 3],
    ['duration', 0.5, 60], ['speed', 0.1, 3], ['particleCount', 0, 72], ['petalCount', 0, 48], ['maxTextureSize', 256, 1024]]) {
    result[key] = finite(result[key], DEFAULTS[key], min, max)
  }
  for (const key of ['particleCount', 'petalCount', 'maxTextureSize']) result[key] = Math.round(result[key])
  for (const key of ['message', 'senderName', 'recipientName']) result[key] = String(result[key] ?? '')
  result.entranceSide = result.entranceSide === 'right' ? 'right' : 'left'
  return result
}
const requiredAssets = (options) => {
  const names = ['closed', 'open', 'letter']
  if (options.showWings) names.push('leftWing', 'rightWing')
  if (options.showSeal) names.push('seal')
  if (options.showHeart) names.push('heart')
  if (options.showPetals) names.push('petal', 'burst')
  if (options.showHearts) names.push('hearts')
  if (options.showFireworks) names.push('fireworks')
  if (options.showSparkles) names.push('sparkles')
  return names
}

class FlyingLoveLetterEffect {
  constructor({THREE, document, parent, ...options}) {
    this.THREE = THREE; this.document = document; this.parent = parent
    this.options = normalizeOptions(options)
    this.group = new THREE.Group(); this.group.name = 'FlyingLoveLetterEffect'; this.group.visible = false
    parent.add(this.group)
    this.clip = {matrix: {value: new THREE.Matrix4()}, bounds: {value: new THREE.Vector4()}}
    this.reader = new LoveLetterReader(document)
    this.raycaster = new THREE.Raycaster(); this.pointerVector = new THREE.Vector2()
    this.batches = {}; this.generatedTextures = []; this.textures = {}
    this.elapsed = 0; this.generation = 0; this.ready = false; this.tracked = false; this.disposed = false
    this.configure(options)
  }
  get time() { return this.elapsed * 9.5 / this.options.duration * this.options.speed }
  get canInteract() {
    return this.ready && this.tracked && this.options.enabled && this.options.allowRead && !this.disposed && this.time >= 5.5
  }

  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    const names = requiredAssets(this.options)
    const base = new URL(this.options.assetBase, this.document.baseURI).href
    const key = `${base}|${this.options.maxTextureSize}|${names.join(',')}`
    if (this.assetKey === key && this.loading) return this.loading
    this.clearVisuals()
    const previous = this.assets, generation = ++this.generation
    this.assetKey = key
    const assets = acquireLoveLetterAssets(this.THREE, this.document, base, this.options.maxTextureSize, names)
    this.assets = assets; previous?.release()
    this.loading = assets.promise.then((textures) => {
      if (this.disposed || generation !== this.generation) return false
      this.textures = textures; this.build(); this.ready = true; this.seek(this.elapsed)
      return true
    }).catch((error) => {
      if (this.disposed || generation !== this.generation) return false
      this.clearVisuals(); assets.release(); this.assets = null; this.assetKey = null; this.loading = null
      throw error
    })
    return this.loading
  }
  batch(name, texture, capacity, order, parent = this.group, additive = false) {
    return this.batches[name] = new SpriteBatch(this.THREE, parent, texture, capacity, this.clip, order, additive)
  }

  build() {
    const THREE = this.THREE, t = this.textures
    this.flightGroup = new THREE.Group(); this.group.add(this.flightGroup)
    this.batch('closed', t.closed, 1, 21, this.flightGroup)
    this.batch('open', t.open, 1, 17, this.flightGroup)
    this.batch('front', t.open, 1, 20, this.flightGroup)
    this.batch('letter', t.letter, 1, 18, this.flightGroup)
    this.wings = []
    for (const [index, name] of ['leftWing', 'rightWing'].entries()) {
      if (!t[name]) continue
      const pivot = new THREE.Group(); this.flightGroup.add(pivot)
      this.wings[index] = pivot; this.batch(name, t[name], 1, 10, pivot)
    }
    if (t.seal) this.batch('seal', t.seal, 1, 22, this.flightGroup)
    for (const [name, capacity, order] of [['heart', 1, 15], ['burst', 1, 23],
      ['petal', 48, 25], ['hearts', 2, 24], ['fireworks', 2, 14], ['sparkles', 72, 26]]) {
      if (t[name]) this.batch(name, t[name], capacity, order, this.group, name === 'fireworks')
    }
    this.textCanvas = this.document.createElement('canvas')
    this.textCanvas.width = 768; this.textCanvas.height = 1080
    this.textLayout = layoutLetterText(this.textCanvas.getContext('2d'), this.options)
    this.textTexture = new THREE.CanvasTexture(this.textCanvas)
    this.textTexture.colorSpace = THREE.SRGBColorSpace
    this.textTexture.minFilter = THREE.LinearFilter; this.textTexture.magFilter = THREE.LinearFilter
    this.textTexture.generateMipmaps = false; this.generatedTextures.push(this.textTexture)
    this.batch('text', this.textTexture, 1, 19, this.flightGroup)
    this.textKey = null
    this.hitGeometry = new THREE.PlaneGeometry(1, 1)
    this.hitMaterial = new THREE.MeshBasicMaterial({side: THREE.DoubleSide, visible: false})
    this.letterHit = new THREE.Mesh(this.hitGeometry, this.hitMaterial)
    this.flightGroup.add(this.letterHit)
  }

  configure(input = {}) {
    const previous = this.options, canonicalTime = this.time
    this.options = normalizeOptions({...previous, ...input})
    this.elapsed = canonicalTime * this.options.duration / 9.5 / this.options.speed
    const textChanged = ['message', 'recipientName', 'senderName', 'textColor'].some(key => previous[key] !== this.options[key])
    if (textChanged && this.textCanvas) {
      this.textLayout = layoutLetterText(this.textCanvas.getContext('2d'), this.options); this.textKey = null
    }
    this.reader.setContent(this.options)
    if (!this.options.enabled || !previous.enabled) { this.elapsed = 0; this.closeReader(); this.interaction?.reset() }
    if (!this.options.allowRead) this.closeReader()
    this.seek(this.elapsed)
  }
  start() {
    if (this.disposed || this.tracked) return
    this.tracked = true; this.seek(0)
  }
  reset() { this.tracked = false; this.closeReader(); this.interaction?.reset(); this.seek(0) }
  update(deltaSeconds) {
    if (this.ready && this.tracked && this.options.enabled && !this.disposed) {
      // Elapsed seconds, rather than per-frame increments, preserve real-time speed.
      const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
      this.seek(this.elapsed + delta)
    }
  }
  openReader() {
    if (!this.canInteract) return false
    this.reader.open(this.options); this.interaction?.reset(); return true
  }
  closeReader() { this.reader.close() }
  handleTap(clientX, clientY, camera, rect) {
    if (!this.canInteract || this.reader.isOpen || !camera || !rect?.width || !rect?.height) return false
    if (clientX < rect.left || clientX > rect.left + rect.width || clientY < rect.top || clientY > rect.top + rect.height) return false
    this.pointerVector.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1)
    this.group.updateWorldMatrix(true, true); camera.updateWorldMatrix(true, false)
    this.raycaster.setFromCamera(this.pointerVector, camera)
    const hit = this.raycaster.intersectObject(this.letterHit, false).find(intersection =>
      this.parent.worldToLocal(intersection.point.clone()).y > 0.008)
    return hit ? this.openReader() : false
  }
  attachInteraction({element, getCamera, allowed = () => true}) {
    if (!element || this.interaction?.element === element) return
    this.interaction?.dispose()
    this.interaction = new TargetTapInteraction({element, document: this.document,
      allowed: () => this.canInteract && !this.reader.isOpen && allowed(),
      onTap: (x, y, rect) => this.handleTap(x, y, getCamera(), rect)})
  }

  seek(elapsed) {
    this.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
    this.group.visible = this.ready && this.tracked && this.options.enabled && !this.disposed
    if (this.time < 5.5) this.closeReader()
    if (!this.ready) return
    const o = this.options, t = this.textures, f = getLoveLetterFrame(this.elapsed, o.duration, o.speed)
    const layout = getLoveLetterLayout(o, t.letter.image.height / t.letter.image.width)
    const pose = getFlightPose(f, layout, o.entranceSide)
    this.group.scale.setScalar(o.width * o.size)
    this.group.position.set(o.width * o.offsetX, o.width * o.offsetY, 0)
    // Never draw below the combined photo/video top, even at extreme sizes or tilts.
    this.clip.bounds.value.set(-1e6, -1e6, 1e6, 0.008)
    this.flightGroup.position.set(pose.x, pose.y, 0)
    this.flightGroup.rotation.z = pose.rotation
    const sprite = (name, props, textureName = name) => {
      const batch = this.batches[name]
      if (!batch) return
      const image = t[textureName].image
      batch.set(0, {...props, height: props.height ?? props.width * image.height / image.width})
      batch.commit(props.alpha > 0.001 ? 1 : 0)
    }
    sprite('closed', {width: o.envelopeSize, alpha: f.alpha * (1 - f.opening)})
    sprite('open', {width: o.envelopeSize, alpha: f.opening})
    const envelopeHeight = o.envelopeSize * t.open.image.height / t.open.image.width
    // A second draw of ONLY the lower front keeps the emerging letter inside
    // the envelope while leaving the open flap behind it. No distorted texture.
    sprite('front', {width: o.envelopeSize, height: envelopeHeight * 0.5,
      y: -envelopeHeight * 0.25, uv: [0, 0, 1, 0.5], alpha: f.opening, z: 0.015}, 'open')
    const letterWidth = o.letterSize * mix(0.84, 1, f.unfold)
    const fullHeight = letterWidth * t.letter.image.height / t.letter.image.width
    const visible = mix(0.025, 1, f.unfold)
    const bottom = mix(-o.envelopeSize * 0.28, layout.letterBottom, f.unfold)
    const letterY = bottom + fullHeight * visible / 2
    sprite('letter', {width: letterWidth, height: fullHeight * visible, y: letterY,
      uv: [0, 1 - visible, 1, visible], alpha: smooth(3.2, 3.5, f.time), z: 0.005})
    this.letterHit.position.set(0, bottom + fullHeight / 2, 0.02)
    // Target the readable center, avoiding the transparent outside parchment rim.
    this.letterHit.scale.set(letterWidth * 0.60, fullHeight * 0.86, 1)
    for (const [i, name] of ['leftWing', 'rightWing'].entries()) {
      if (!this.wings[i]) continue
      const sign = i === 0 ? -1 : 1
      this.wings[i].position.set(sign * o.envelopeSize * 0.28, -o.envelopeSize * 0.02, -0.015)
      this.wings[i].rotation.y = sign * (0.3 + pose.flap * 0.55)
      this.wings[i].rotation.z = sign * (0.06 + Math.sin(f.time * 8 + i * 0.15) * 0.13)
      sprite(name, {x: sign * o.wingSize * 0.38, y: o.wingSize * 0.32,
        width: o.wingSize, alpha: f.alpha * (1 - f.opening * 0.22)})
    }
    sprite('seal', {x: Math.sin(f.time * 1.4) * 0.015 * f.opening,
      y: -o.envelopeSize * 0.10, width: o.envelopeSize * 0.34, rotation: Math.sin(f.time) * 0.05,
      alpha: f.opening, z: 0.025})
    const lineCount = Math.floor(f.message * this.textLayout.lines.length + 1e-7)
    const textKey = `${lineCount}|${f.message >= 1}|${o.allowRead}`
    if (this.textKey !== textKey) {
      drawLoveLetterText(this.textCanvas, this.textLayout, f.message, o.textColor, o.allowRead)
      this.textTexture.needsUpdate = true; this.textKey = textKey
    }
    // The supplied parchment has broad transparent side margins and corner roses.
    // Keep the text inside its painted center, clear of both floral corners.
    this.batches.text.set(0, {width: letterWidth * 0.50, height: fullHeight * 0.60,
      y: bottom + fullHeight * 0.46, alpha: f.message > 0 ? 1 : 0, z: 0.01})
    this.batches.text.commit(f.message > 0 ? 1 : 0)
    sprite('heart', {width: layout.heartWidth * mix(0.35, 1, f.heart), y: layout.letterY + f.bob,
      alpha: f.heart * 0.72 * (0.94 + Math.sin(f.time * 2) * 0.06), z: -0.02})
    sprite('burst', {width: mix(0.15, 1.35, smooth(8, 9.1, f.time)), y: layout.letterY,
      alpha: f.burst * 0.6, rotation: (f.time - 8) * 0.08, z: 0.025})
    if (this.batches.hearts) {
      for (let i = 0; i < 2; i++) this.batches.hearts.set(i, {
        x: (i ? 1 : -1) * layout.heartWidth * 0.57 + Math.sin(f.time + i * 3) * 0.025,
        y: layout.letterY + Math.sin(f.time * 1.2 + i * 2) * 0.06,
        width: 0.22, height: 0.22 * t.hearts.image.height / t.hearts.image.width,
        rotation: Math.sin(f.time + i) * 0.04, alpha: f.heart, z: 0.015})
      this.batches.hearts.commit(f.heart > 0.001 ? 2 : 0)
    }
    if (this.batches.fireworks) {
      for (let i = 0; i < 2; i++) {
        const age = f.time - 8 - i * 0.3
        const width = mix(0.05, 0.70, smooth(0, 1.1, age))
        this.batches.fireworks.set(i, {x: (i ? 1 : -1) * layout.heartWidth * 0.58,
          y: layout.letterY + 0.24, width, height: width * t.fireworks.image.height / t.fireworks.image.width,
          rotation: i * 0.5, alpha: smooth(0, 0.15, age) * (1 - smooth(0.55, 1.2, age))})
      }
      this.batches.fireworks.commit(f.time >= 8 && f.time < 9.5 ? 2 : 0)
    }
    if (this.batches.petal) {
      const count = f.time < 8 ? 0 : f.time >= 10 ? Math.min(4, o.petalCount) : o.petalCount
      for (let i = 0; i < count; i++) this.batches.petal.set(i, {...getLovePetal(i, f, layout), z: 0.03})
      this.batches.petal.commit(count)
    }
    if (this.batches.sparkles) {
      const count = f.time >= 9.5 ? Math.min(10, o.particleCount) : o.particleCount
      for (let i = 0; i < count; i++) {
        const particle = getLoveSparkle(i, f, layout, o.entranceSide)
        this.batches.sparkles.set(i, {...particle,
          height: particle.width * t.sparkles.image.height / t.sparkles.image.width, z: 0.02})
      }
      this.batches.sparkles.commit(f.alpha > 0 ? count : 0)
    }
    this.parent.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.parent.matrixWorld).invert()
  }

  clearVisuals() {
    this.ready = false; this.group.visible = false; this.closeReader()
    Object.values(this.batches).forEach(batch => batch.dispose())
    this.generatedTextures.forEach(texture => texture.dispose())
    this.hitGeometry?.dispose(); this.hitMaterial?.dispose(); this.flightGroup?.removeFromParent()
    this.batches = {}; this.generatedTextures = []; this.textures = {}; this.wings = []
    this.flightGroup = null; this.letterHit = null; this.hitGeometry = null; this.hitMaterial = null
    this.textCanvas = null; this.textTexture = null; this.textKey = null
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; ++this.generation
    this.interaction?.dispose(); this.reader.dispose(); this.clearVisuals()
    this.assets?.release(); this.parent.remove(this.group)
  }
}

module.exports = {FlyingLoveLetterEffect, DEFAULTS, normalizeOptions, requiredAssets}
