const {SpriteBatch} = require('../shared/sprite-batch')
const {acquireCakeAssets} = require('./assets')
const {CakeTapInteraction} = require('./interaction')
const {CakeCandleState, getCakeFrame, getCandleLayout, getCandleFrame, getCakeParticle, smooth, mix} = require('./timeline')
const {getBirthdayMessage, drawCakeMessage, drawCakeHint} = require('./text')

const DEFAULTS = Object.freeze({
  enabled: true, message: 'Happy Birthday!', name: '', width: 1, size: 1,
  offsetX: 0, offsetY: 0.025, duration: 5, speed: 1, candleCount: 5,
  showHint: true, showMessage: true, showCelebration: true, showParticles: true,
  textColor: '#783a32', sparkleColor: '#ffd777', cakeTint: '#ffffff',
  particleCount: 64, maxTextureSize: 768, assetBase: './animations/interactive-birthday-cake/assets',
})
const bool = (value, fallback) => value == null ? fallback : value === true || value === 1 ||
  (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()))
const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback
const normalizeOptions = (input = {}) => {
  const result = {...DEFAULTS, ...input}
  for (const key of ['enabled', 'showHint', 'showMessage', 'showCelebration', 'showParticles']) result[key] = bool(input[key], DEFAULTS[key])
  for (const [key, min, max] of [['width', 0.001, 100], ['size', 0.15, 3], ['offsetX', -3, 3],
    ['offsetY', -3, 3], ['duration', 0.5, 60], ['speed', 0.1, 3], ['candleCount', 1, 12],
    ['particleCount', 0, 96], ['maxTextureSize', 256, 1024]]) result[key] = finite(result[key], DEFAULTS[key], min, max)
  for (const key of ['candleCount', 'particleCount', 'maxTextureSize']) result[key] = Math.round(result[key])
  result.message = String(result.message ?? '')
  result.name = String(result.name ?? '')
  return result
}
const requiredAssets = (options) => {
  const names = ['cake', 'lit', 'off', 'flame', 'smoke']
  if (options.showMessage) names.push('ribbon')
  if (options.showCelebration) names.push('confetti', 'fireworks', 'hearts', 'balloons', 'ring')
  return names
}

class InteractiveBirthdayCakeEffect {
  constructor({THREE, document, parent, onCandleBlown, onCelebrate, ...options}) {
    this.THREE = THREE; this.document = document; this.parent = parent
    this.onCandleBlown = onCandleBlown; this.onCelebrate = onCelebrate
    this.options = normalizeOptions(options)
    this.state = new CakeCandleState(this.options.candleCount)
    this.group = new THREE.Group()
    this.group.name = 'InteractiveBirthdayCakeEffect'
    this.group.visible = false
    parent.add(this.group)
    this.clip = {matrix: {value: new THREE.Matrix4()}, bounds: {value: new THREE.Vector4()}}
    this.palette = {sparkle: new THREE.Color(), cake: new THREE.Color()}
    this.raycaster = new THREE.Raycaster()
    this.pointerVector = new THREE.Vector2()
    this.batches = {}; this.generatedTextures = []
    this.elapsed = 0; this.generation = 0; this.ready = false; this.tracked = false; this.disposed = false
    this.configure(options)
  }

  get time() { return this.elapsed * 5 / this.options.duration * this.options.speed }
  get canInteract() { return this.ready && this.tracked && this.options.enabled && !this.disposed && this.time >= 2.5 && this.state.remaining > 0 }

  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    const names = requiredAssets(this.options)
    const base = new URL(this.options.assetBase, this.document.baseURI).href
    const key = `${base}|${this.options.maxTextureSize}|${names.join(',')}|${this.options.showParticles}|${this.options.showHint}`
    if (this.assetKey === key && this.loading) return this.loading
    this.clearVisuals()
    const previous = this.assets
    const generation = ++this.generation
    this.assetKey = key
    const assets = acquireCakeAssets(this.THREE, this.document, base, this.options.maxTextureSize, names)
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
      const capacity = ['lit', 'off', 'flame', 'smoke'].includes(name) ? 12 : ['hearts', 'balloons'].includes(name) ? 2 : 1
      const order = name === 'cake' ? 20 : name === 'ribbon' ? 27 : ['lit', 'off'].includes(name) ? 22 :
        name === 'flame' ? 23 : name === 'smoke' ? 25 : 18
      this.batch(name, texture, capacity, order, name === 'fireworks' || name === 'ring')
    }
    if (this.options.showMessage) {
      this.messageCanvas = this.document.createElement('canvas')
      drawCakeMessage(this.messageCanvas, getBirthdayMessage(this.options.message, this.options.name), this.options.textColor)
      this.messageTexture = this.canvasTexture(this.messageCanvas)
      this.batch('message', this.messageTexture, 1, 28)
    }
    if (this.options.showHint) {
      this.hintCanvas = this.document.createElement('canvas')
      drawCakeHint(this.hintCanvas, this.options.textColor)
      this.hintTexture = this.canvasTexture(this.hintCanvas)
      this.batch('hint', this.hintTexture, 1, 26)
    }
    if (this.options.showParticles) {
      const canvas = this.document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const context = canvas.getContext('2d')
      const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32)
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.35, '#ffffffbb'); glow.addColorStop(1, '#ffffff00')
      context.fillStyle = glow; context.fillRect(0, 0, 64, 64)
      context.fillStyle = '#ffffff'; context.beginPath()
      context.moveTo(32, 1); context.lineTo(37, 27); context.lineTo(63, 32); context.lineTo(37, 37)
      context.lineTo(32, 63); context.lineTo(27, 37); context.lineTo(1, 32); context.lineTo(27, 27)
      context.closePath(); context.fill()
      this.batch('particles', this.canvasTexture(canvas), 96, 24)
    }
    this.buildHitTargets()
  }

  buildHitTargets() {
    const THREE = this.THREE
    this.hitGeometry = new THREE.PlaneGeometry(1, 1)
    // The hit planes never draw, but remain real meshes for Three.js raycasting.
    this.hitMaterial = new THREE.MeshBasicMaterial({side: THREE.DoubleSide, visible: false})
    const make = (kind, index) => {
      const mesh = new THREE.Mesh(this.hitGeometry, this.hitMaterial)
      mesh.userData = {kind, index}
      this.group.add(mesh)
      return mesh
    }
    this.cakeHit = make('cake')
    this.candleHits = Array.from({length: 12}, (_, index) => make('candle', index))
    const image = this.textures.cake.image
    const canvas = this.document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    this.cakeAlpha = {width: canvas.width, height: canvas.height, data: new Uint8Array(canvas.width * canvas.height)}
    for (let i = 0; i < this.cakeAlpha.data.length; i++) this.cakeAlpha.data[i] = pixels[i * 4 + 3]
  }

  configure(input = {}) {
    const previous = this.options
    const canonicalTime = this.time
    this.options = normalizeOptions({...previous, ...input})
    this.elapsed = canonicalTime * this.options.duration / 5 / this.options.speed
    this.palette.sparkle.set(this.options.sparkleColor); this.palette.cake.set(this.options.cakeTint)
    if (this.messageCanvas && (previous.message !== this.options.message || previous.name !== this.options.name || previous.textColor !== this.options.textColor)) {
      drawCakeMessage(this.messageCanvas, getBirthdayMessage(this.options.message, this.options.name), this.options.textColor)
      this.messageTexture.needsUpdate = true
    }
    if (this.hintCanvas && previous.textColor !== this.options.textColor) {
      drawCakeHint(this.hintCanvas, this.options.textColor); this.hintTexture.needsUpdate = true
    }
    if (previous.candleCount !== this.options.candleCount || !this.options.enabled || !previous.enabled) this.resetState()
    this.seek(this.elapsed)
  }

  resetState() {
    this.elapsed = 0
    this.state.reset(this.options.candleCount)
    this.interaction?.reset()
  }
  start() {
    if (this.disposed || this.tracked) return
    this.tracked = true; this.resetState(); this.seek(0)
  }
  reset() { this.tracked = false; this.resetState(); this.seek(0) }
  update(deltaSeconds) {
    if (this.ready && this.tracked && this.options.enabled && !this.disposed) {
      this.seek(this.elapsed + Math.min(Math.max(deltaSeconds || 0, 0), 0.05))
    }
  }

  blowCandle(index) {
    if (!this.canInteract || !this.state.blow(index, this.time)) return false
    this.onCandleBlown?.({index, remaining: this.state.remaining})
    if (this.state.celebrationAt !== null) this.onCelebrate?.({candleCount: this.options.candleCount})
    this.seek(this.elapsed)
    return true
  }
  blowAllCandles() {
    let changed = 0
    for (let i = 0; i < this.options.candleCount; i++) if (this.blowCandle(i)) changed++
    return changed
  }

  handleTap(clientX, clientY, camera, rect) {
    if (!this.canInteract || !camera || !rect.width || !rect.height) return null
    this.pointerVector.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1)
    this.group.updateWorldMatrix(true, true); camera.updateWorldMatrix(true, false)
    this.raycaster.setFromCamera(this.pointerVector, camera)
    const outsidePicture = hit => this.parent.worldToLocal(hit.point.clone()).y < -0.001
    const candles = this.raycaster.intersectObjects(this.candleHits.slice(0, this.options.candleCount), false)
    const candle = candles.find(outsidePicture)
    if (candle) {
      const index = candle.object.userData.index
      // An already extinguished candle consumes its hit without falling through to cake.
      return {kind: 'candle', index, changed: this.blowCandle(index)}
    }
    const hits = this.raycaster.intersectObject(this.cakeHit, false)
    const cake = hits.find(hit => {
      if (!outsidePicture(hit)) return false
      const x = Math.max(0, Math.min(this.cakeAlpha.width - 1, Math.floor(hit.uv.x * this.cakeAlpha.width)))
      const y = Math.max(0, Math.min(this.cakeAlpha.height - 1, Math.floor((1 - hit.uv.y) * this.cakeAlpha.height)))
      return this.cakeAlpha.data[y * this.cakeAlpha.width + x] > 24
    })
    return cake ? {kind: 'cake', changed: this.blowAllCandles()} : null
  }

  attachInteraction({element, getCamera, allowed = () => true}) {
    if (!element || this.interaction?.element === element) return
    this.interaction?.dispose()
    this.interaction = new CakeTapInteraction({element, document: this.document,
      allowed: () => this.canInteract && allowed(),
      onTap: (x, y, rect) => this.handleTap(x, y, getCamera(), rect)})
  }

  seek(elapsed) {
    this.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
    this.group.visible = this.ready && this.tracked && this.options.enabled && !this.disposed
    if (!this.ready) return
    const o = this.options, time = this.time
    const frame = getCakeFrame(time, this.state.celebrationAt)
    this.group.scale.setScalar(o.width * o.size)
    this.group.position.set(o.width * o.offsetX, -o.width * o.offsetY, 0)
    // The whole effect stays below the bottom edge, even outside the picture's sides.
    this.clip.bounds.value.set(-1000000, -0.001, 1000000, 1000000)
    const sprite = (name, props) => {
      const batch = this.batches[name]
      if (!batch) return
      const texture = this.textures[name]
      batch.set(0, {...props, height: props.height ?? props.width * texture.image.height / texture.image.width})
      batch.commit(props.alpha > 0.001 ? 1 : 0)
    }
    const cakeWidth = 0.82 * frame.scale
    const cakeHeight = cakeWidth * this.textures.cake.image.height / this.textures.cake.image.width
    sprite('cake', {width: cakeWidth, y: frame.cakeY, alpha: 1, color: this.palette.cake})
    this.cakeHit.position.set(0, frame.cakeY, 0)
    this.cakeHit.scale.set(cakeWidth, cakeHeight, 1)
    let activeSmoke = false, activeFlame = false
    const layout = getCandleLayout(o.candleCount)
    layout.forEach((item, index) => {
      const candle = getCandleFrame(index, o.candleCount, time, this.state.blownAt[index])
      const width = item.width * frame.scale
      const height = width * 690 / 320
      const base = frame.cakeY + item.baseY * frame.scale
      const x = item.x * frame.scale
      const centerY = base + height * (642 / 690 - 0.5)
      const wickY = base + height * (642 - 172) / 690
      const alpha = frame.candlesAlpha
      this.batches.off.set(index, {width, height, x, y: centerY, z: 0.025, alpha: alpha * (1 - candle.lit)})
      // Asset 02 contains a flame: sample only its wax/neck and animate asset 04 independently.
      this.batches.lit.set(index, {width, height: height * 0.72, x,
        y: centerY - height * 0.14, z: 0.026, alpha: alpha * candle.lit, uv: [0, 0, 1, 0.72]})
      const flameWidth = width * 0.87 * candle.flicker
      const flameHeight = flameWidth * this.textures.flame.image.height / this.textures.flame.image.width
      this.batches.flame.set(index, {width: flameWidth, height: flameHeight,
        x: x + Math.sin(time * 13 + index) * width * 0.02,
        y: wickY + flameHeight * 0.224, rotation: Math.sin(time * 11 + index) * 0.035,
        alpha: alpha * candle.lit, z: 0.029})
      const smokeWidth = 0.19 * (0.7 + candle.smokeProgress * 0.5)
      this.batches.smoke.set(index, {width: smokeWidth, height: smokeWidth * this.textures.smoke.image.height / this.textures.smoke.image.width,
        x: x + Math.sin(time + index) * candle.smokeProgress * 0.025,
        y: wickY + 0.08 + candle.smokeProgress * 0.22,
        alpha: candle.smoke, rotation: candle.smokeProgress * 0.08, z: 0.035})
      activeSmoke ||= candle.smoke > 0.001; activeFlame ||= candle.lit > 0.001
      this.candleHits[index].position.set(x, centerY, 0.04)
      this.candleHits[index].scale.set(item.hitWidth * frame.scale, height, 1)
    })
    this.batches.off.commit(frame.candlesAlpha > 0 ? o.candleCount : 0)
    this.batches.lit.commit(activeFlame ? o.candleCount : 0)
    this.batches.flame.commit(activeFlame ? o.candleCount : 0)
    this.batches.smoke.commit(activeSmoke ? o.candleCount : 0)
    if (this.batches.hint) {
      this.batches.hint.set(0, {width: 0.76, height: 0.106875, y: -0.28, alpha: frame.hintAlpha, z: 0.04})
      this.batches.hint.commit(frame.hintAlpha > 0.001 ? 1 : 0)
    }
    const c = frame.celebration ?? 0
    sprite('fireworks', {width: mix(0.25, 1.1, smooth(0, 1.1, c)), y: -0.62, alpha: frame.burstAlpha, z: -0.015})
    sprite('confetti', {width: mix(0.3, 1.4, smooth(0, 1.4, c)), y: -0.66, alpha: frame.burstAlpha * 0.85, z: -0.01})
    sprite('ring', {width: 1.12 + Math.sin(c * 5) * 0.03, y: -0.92,
      rotation: Math.sin(c * 1.4) * 0.09, alpha: frame.ringAlpha * 0.65, z: -0.01})
    for (const [name, alpha, width] of [['hearts', frame.heartsAlpha, 0.34], ['balloons', frame.balloonAlpha, 0.46]]) {
      if (!this.batches[name]) continue
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1
        this.batches[name].set(i, {width, height: width * this.textures[name].image.height / this.textures[name].image.width,
          x: side * (0.40 + smooth(0, 2, c) * 0.22),
          y: -0.75 + smooth(0, 2, c) * 0.27 + Math.sin(time + i) * 0.012,
          rotation: side * smooth(0, 2, c) * 0.15, alpha, z: -0.01})
      }
      this.batches[name].commit(alpha > 0.001 ? 2 : 0)
    }
    sprite('ribbon', {width: 0.92 * frame.messageScale, y: -0.235 + frame.float,
      alpha: frame.messageAlpha, z: 0.045})
    if (this.batches.message) {
      this.batches.message.set(0, {width: 0.60 * frame.messageScale, height: 0.15 * frame.messageScale,
        y: -0.227 + frame.float, alpha: frame.messageAlpha, z: 0.05})
      this.batches.message.commit(frame.messageAlpha > 0.001 ? 1 : 0)
    }
    if (this.batches.particles) {
      let active = false
      for (let i = 0; i < o.particleCount; i++) {
        const p = getCakeParticle(i, frame.celebration)
        this.batches.particles.set(i, {x: p.x, y: p.y, width: p.size, height: p.size,
          rotation: p.rotation, alpha: p.alpha, color: this.palette.sparkle, z: 0.036})
        active ||= p.alpha > 0.001
      }
      this.batches.particles.commit(active ? o.particleCount : 0)
    }
    this.parent.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.parent.matrixWorld).invert()
  }

  clearVisuals() {
    this.ready = false; this.group.visible = false
    Object.values(this.batches).forEach(batch => batch.dispose())
    this.generatedTextures.forEach(texture => texture.dispose())
    this.cakeHit?.removeFromParent(); this.candleHits?.forEach(mesh => mesh.removeFromParent())
    this.hitGeometry?.dispose(); this.hitMaterial?.dispose()
    this.batches = {}; this.generatedTextures = []; this.textures = {}
    this.cakeHit = null; this.candleHits = null; this.hitGeometry = null; this.hitMaterial = null; this.cakeAlpha = null
    this.messageCanvas = null; this.messageTexture = null; this.hintCanvas = null; this.hintTexture = null
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; ++this.generation
    this.interaction?.dispose(); this.interaction = null
    this.clearVisuals(); this.assets?.release(); this.parent.remove(this.group)
  }
}

module.exports = {InteractiveBirthdayCakeEffect, DEFAULTS, normalizeOptions, requiredAssets}
