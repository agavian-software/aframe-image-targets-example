const {SpriteBatch} = require('../shared/sprite-batch')
const {acquireFairyAssets} = require('./assets')
const {drawFairyMessage} = require('./text')
const {mix, getFairyFrame, getFairyPose, getOrbitPoint, getMagicParticle} = require('./timeline')

const DEFAULTS = Object.freeze({
  enabled: true, message: 'Happy Birthday!', width: 1, pictureHeight: 1, centerOffsetX: 0, centerOffsetY: 0,
  size: 1, fairySize: 0.48, offsetX: 0, offsetY: 0, duration: 5, speed: 1,
  showFairy: true, useHoverPose: true, showCircle: true, showParticles: true,
  showTrail: true, showBurst: true, showStars: true, showMessage: true, showWandHighlight: false,
  sparkleColor: '#ffd778', textColor: '#78402d', fairyTint: '#ffffff', ribbonTint: '#ffffff',
  particleCount: 72, maxTextureSize: 768, assetBase: './animations/fairy-magic-wand/assets',
})
const bool = (value, fallback) => value == null ? fallback : value === true || value === 1 ||
  (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()))
const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback

const normalizeOptions = (input = {}) => {
  const result = {...DEFAULTS, ...input}
  for (const key of ['enabled', 'showFairy', 'useHoverPose', 'showCircle', 'showParticles',
    'showTrail', 'showBurst', 'showStars', 'showMessage', 'showWandHighlight']) {
    result[key] = bool(input[key], DEFAULTS[key])
  }
  for (const [key, min, max] of [['width', 0.001, 100], ['pictureHeight', 0.001, 100],
    ['centerOffsetX', -100, 100], ['centerOffsetY', -100, 100],
    ['size', 0.15, 3], ['fairySize', 0.15, 1], ['offsetX', -3, 3], ['offsetY', -3, 3],
    ['duration', 0.5, 60], ['speed', 0.1, 3], ['particleCount', 0, 96], ['maxTextureSize', 256, 1024]]) {
    result[key] = finite(result[key], DEFAULTS[key], min, max)
  }
  result.particleCount = Math.round(result.particleCount)
  result.maxTextureSize = Math.round(result.maxTextureSize)
  result.message = String(result.message ?? '')
  return result
}

const requiredAssets = (options) => {
  const names = []
  if (options.showFairy) {
    names.push('flying')
    if (options.useHoverPose) names.push('hover')
  }
  if (options.showWandHighlight) names.push('wand')
  if (options.showTrail) names.push('trail')
  if (options.showBurst) names.push('burst')
  if (options.showStars) names.push('stars')
  if (options.showMessage) names.push('ribbon')
  // Both complete characters already contain wings: never load duplicate wings.
  return names
}

class FairyMagicWandEffect {
  constructor({THREE, document, parent, onVideoOpacity, onVideoReady, ...options}) {
    this.THREE = THREE
    this.document = document
    this.parent = parent
    this.onVideoOpacity = onVideoOpacity
    this.onVideoReady = onVideoReady
    this.options = normalizeOptions(options)
    this.group = new THREE.Group()
    this.group.name = 'FairyMagicWandEffect'
    this.group.visible = false
    parent.add(this.group)
    this.clip = {matrix: {value: new THREE.Matrix4()}, bounds: {value: new THREE.Vector4()}}
    this.palette = {sparkle: new THREE.Color(), fairy: new THREE.Color(), ribbon: new THREE.Color()}
    this.batches = {}
    this.generatedTextures = []
    this.elapsed = 0
    this.generation = 0
    this.ready = false
    this.tracked = false
    this.videoReleased = false
    this.skipped = false
    this.disposed = false
    this.configure(options)
  }

  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    const names = requiredAssets(this.options)
    const base = new URL(this.options.assetBase, this.document.baseURI).href
    const key = `${base}|${this.options.maxTextureSize}|${names.join(',')}|${this.options.showCircle}|${this.options.showParticles}`
    if (this.assetKey === key && this.loading) return this.loading
    this.clearVisuals()
    const previous = this.assets
    this.assetKey = key
    const generation = ++this.generation
    const assets = acquireFairyAssets(this.THREE, this.document, base, this.options.maxTextureSize, names)
    this.assets = assets
    previous?.release()
    this.loading = assets.promise.then((textures) => {
      if (this.disposed || generation !== this.generation) return false
      this.textures = textures
      this.build()
      this.ready = true
      this.artworkFailed = false
      this.seek(this.elapsed)
      return true
    }).catch((error) => {
      if (this.disposed || generation !== this.generation) return false
      this.clearVisuals()
      assets.release()
      this.assets = null
      this.assetKey = null
      this.loading = null
      this.artworkFailed = true
      this.seek(this.elapsed)
      throw error
    })
    return this.loading
  }

  batch(name, texture, capacity, order, additive = false) {
    const batch = new SpriteBatch(this.THREE, this.group, texture, capacity, this.clip, order, additive)
    this.batches[name] = batch
    return batch
  }

  canvasTexture(canvas) {
    const texture = new this.THREE.CanvasTexture(canvas)
    texture.colorSpace = this.THREE.SRGBColorSpace
    texture.minFilter = this.THREE.LinearFilter
    texture.magFilter = this.THREE.LinearFilter
    texture.generateMipmaps = false
    this.generatedTextures.push(texture)
    return texture
  }

  build() {
    for (const [name, texture] of Object.entries(this.textures)) {
      this.batch(name, texture, name === 'stars' ? 14 : 1,
        name === 'ribbon' ? 25 : ['flying', 'hover'].includes(name) ? 22 : 23,
        name === 'trail' || name === 'burst')
    }
    if (this.textures.ribbon) {
      this.messageCanvas = this.document.createElement('canvas')
      drawFairyMessage(this.messageCanvas, this.options.message, this.options.textColor)
      this.messageTexture = this.canvasTexture(this.messageCanvas)
      this.batch('message', this.messageTexture, 1, 26)
    }
    if (this.options.showParticles) {
      const canvas = this.document.createElement('canvas')
      canvas.width = 64; canvas.height = 64
      const context = canvas.getContext('2d')
      const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
      gradient.addColorStop(0, '#ffffff')
      gradient.addColorStop(0.3, '#ffffffa0')
      gradient.addColorStop(1, '#ffffff00')
      context.fillStyle = gradient
      context.fillRect(0, 0, 64, 64)
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.moveTo(32, 2); context.lineTo(37, 27); context.lineTo(62, 32)
      context.lineTo(37, 37); context.lineTo(32, 62); context.lineTo(27, 37)
      context.lineTo(2, 32); context.lineTo(27, 27); context.closePath(); context.fill()
      this.batch('particles', this.canvasTexture(canvas), 96, 24)
    }
    if (this.options.showCircle) this.buildCircle()
  }

  buildCircle() {
    const THREE = this.THREE
    const geometry = new THREE.BufferGeometry()
    this.circlePositions = new THREE.BufferAttribute(new Float32Array(129 * 3), 3)
    this.circlePositions.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', this.circlePositions)
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      uniforms: {uToAnchor: this.clip.matrix, uBounds: this.clip.bounds,
        uColor: {value: this.palette.sparkle}, uAlpha: {value: 0}},
      vertexShader: `
        uniform mat4 uToAnchor;
        varying vec2 vAnchor;
        void main() {
          vAnchor = (uToAnchor * modelMatrix * vec4(position, 1.0)).xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec4 uBounds;
        uniform vec3 uColor;
        uniform float uAlpha;
        varying vec2 vAnchor;
        void main() {
          if (vAnchor.x > uBounds.x && vAnchor.x < uBounds.z &&
              vAnchor.y > uBounds.y && vAnchor.y < uBounds.w) discard;
          gl_FragColor = vec4(uColor, uAlpha);
          #include <colorspace_fragment>
        }`,
    })
    this.circle = new THREE.Line(geometry, material)
    this.circle.frustumCulled = false
    this.circle.renderOrder = 19
    this.group.add(this.circle)
  }

  configure(input = {}) {
    const previous = this.options
    this.options = normalizeOptions({...previous, ...input})
    this.palette.sparkle.set(this.options.sparkleColor)
    this.palette.fairy.set(this.options.fairyTint)
    this.palette.ribbon.set(this.options.ribbonTint)
    if (this.messageCanvas && (previous.message !== this.options.message || previous.textColor !== this.options.textColor)) {
      drawFairyMessage(this.messageCanvas, this.options.message, this.options.textColor)
      this.messageTexture.needsUpdate = true
    }
    if (!this.options.enabled || !previous.enabled) this.elapsed = 0
    this.seek(this.elapsed)
  }

  start() {
    if (this.disposed || this.tracked) return
    this.tracked = true
    this.seek(0)
  }

  reset() {
    this.tracked = false
    this.videoReleased = false
    this.skipped = false
    this.seek(0)
  }

  publishVideo(visible) {
    const opacity = visible ? 1 : 0
    if (this.videoOpacity !== opacity) {
      this.videoOpacity = opacity
      this.onVideoOpacity?.(opacity)
    }
    if (visible && this.tracked && !this.videoReleased) {
      this.videoReleased = true
      this.onVideoReady?.()
    }
  }

  update(deltaSeconds) {
    if (this.ready && this.tracked && this.options.enabled && !this.disposed) {
      this.seek(this.elapsed + Math.min(Math.max(deltaSeconds || 0, 0), 0.05))
    }
  }

  seek(elapsed) {
    if (this.disposed) return
    this.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
    const o = this.options
    if (this.tracked && (!o.enabled || this.artworkFailed)) this.skipped = true
    this.group.visible = this.ready && this.tracked && o.enabled && !this.skipped
    if (!this.group.visible) {
      this.publishVideo(!o.enabled || this.skipped || this.videoReleased)
      return
    }
    const frame = getFairyFrame(this.elapsed, o.duration, o.speed)
    const ratio = o.pictureHeight / o.width
    const videoVisible = frame.videoReady || this.videoReleased
    // Let the fairy cross the printed photo, then keep the playing video clear.
    if (videoVisible) {
      this.clip.bounds.value.set(-o.width / 2 - 0.008, -o.pictureHeight - 0.008, o.width / 2 + 0.008, 0.008)
    } else {
      this.clip.bounds.value.set(0, 0, 0, 0)
    }
    const anchorPoint = point => ({x: point.x * o.size + o.offsetX, y: point.y * o.size + o.offsetY})
    const groupPoint = point => ({x: (point.x - o.offsetX) / o.size, y: (point.y - o.offsetY) / o.size})
    const origin = groupPoint({x: o.centerOffsetX / o.width, y: o.centerOffsetY / o.width - ratio / 2})
    const pose = getFairyPose(frame, {pictureRatio: ratio, size: o.size, fairySize: o.fairySize,
      useHoverPose: o.useHoverPose, origin})
    this.group.scale.setScalar(o.width * o.size)
    this.group.position.set(o.width * o.offsetX, o.width * o.offsetY, 0)
    const tip = anchorPoint(pose.tip)
    const sprite = (name, props) => {
      const batch = this.batches[name]
      if (!batch) return
      const texture = this.textures[name]
      batch.set(0, {...props, height: props.height ?? props.width * texture.image.height / texture.image.width})
      batch.commit(props.alpha > 0.001 ? 1 : 0)
    }
    const common = {x: pose.x, y: pose.y, width: pose.width, rotation: pose.rotation,
      uv: [1, 0, -1, 1], color: this.palette.fairy}
    sprite('flying', {...common, alpha: frame.alpha * (1 - pose.hover)})
    sprite('hover', {...common, alpha: frame.alpha * pose.hover})
    const idlePhase = (frame.time - 5) % 3.6
    const idleGlow = frame.time >= 5 && idlePhase < 0.65 ? Math.sin(idlePhase / 0.65 * Math.PI) * 0.45 : 0
    // Optional highlight samples only the star head of asset 05, never a second handle.
    sprite('wand', {x: pose.tip.x, y: pose.tip.y, width: 0.075, height: 0.073,
      alpha: Math.max(Math.abs(frame.wave) * 0.35, idleGlow), uv: [0.28, 0.60, 0.72, 0.40],
      rotation: pose.rotation, z: 0.018})
    sprite('trail', {x: pose.tip.x - 0.09, y: pose.tip.y + 0.025, width: 0.25,
      alpha: frame.trailAlpha * 0.7, rotation: pose.rotation - 0.6, z: -0.006})
    sprite('burst', {x: pose.tip.x, y: pose.tip.y,
      width: frame.burstAlpha > 0 ? frame.burstScale : 0.12,
      alpha: Math.max(frame.burstAlpha, idleGlow), rotation: frame.time * 0.2, z: 0.02})
    const ribbonHeight = this.textures.ribbon ? 0.92 * this.textures.ribbon.image.height / this.textures.ribbon.image.width : 0
    const ribbonY = 0.065 + ribbonHeight / 2 + frame.bob * 0.5
    sprite('ribbon', {width: 0.92 * frame.messageScale, y: ribbonY,
      alpha: frame.messageAlpha, color: this.palette.ribbon, z: 0.025})
    if (this.batches.message) {
      this.batches.message.set(0, {width: 0.60 * frame.messageScale, height: 0.15 * frame.messageScale,
        y: ribbonY + 0.008, alpha: frame.messageAlpha, z: 0.03})
      this.batches.message.commit(frame.messageAlpha > 0.001 ? 1 : 0)
    }
    if (this.circle) {
      for (let i = 0; i <= 128; i++) {
        const point = groupPoint(getOrbitPoint(i / 128, ratio))
        this.circlePositions.setXYZ(i, point.x, point.y, -0.008)
      }
      this.circlePositions.needsUpdate = true
      this.circle.geometry.setDrawRange(0, Math.floor(frame.circle * 128) + 1)
      this.circle.material.uniforms.uAlpha.value = frame.circleAlpha * 0.55
      this.circle.visible = frame.circle > 0 && frame.circleAlpha > 0.001
    }
    if (this.batches.stars) {
      for (let i = 0; i < 14; i++) {
        const p = getMagicParticle(i * 3 + 2, frame, ratio, tip)
        const position = groupPoint(p)
        this.batches.stars.set(i, {...position, width: 0.09 + i % 3 * 0.02,
          height: (0.09 + i % 3 * 0.02) * this.textures.stars.image.height / this.textures.stars.image.width,
          rotation: p.rotation, alpha: p.alpha * 0.75, z: 0.012})
      }
      this.batches.stars.commit(frame.time >= 3 && frame.time < 4.3 ? 14 : 0)
    }
    if (this.batches.particles) {
      let active = false
      for (let i = 0; i < o.particleCount; i++) {
        const p = getMagicParticle(i, frame, ratio, tip)
        if (!o.showCircle && frame.time < 5 && i % 3 === 0) p.alpha = 0
        active ||= p.alpha > 0.001
        this.batches.particles.set(i, {...groupPoint(p), width: p.size / o.size, height: p.size / o.size,
          rotation: p.rotation, alpha: p.alpha, color: this.palette.sparkle, z: 0.016})
      }
      this.batches.particles.commit(active ? o.particleCount : 0)
    }
    this.parent.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.parent.matrixWorld).invert()
    this.publishVideo(videoVisible)
  }

  clearVisuals() {
    this.ready = false
    this.group.visible = false
    Object.values(this.batches).forEach(batch => batch.dispose())
    this.generatedTextures.forEach(texture => texture.dispose())
    if (this.circle) {
      this.circle.geometry.dispose()
      this.circle.material.dispose()
      this.circle.removeFromParent()
    }
    this.circle = null
    this.circlePositions = null
    this.messageCanvas = null
    this.messageTexture = null
    this.generatedTextures = []
    this.batches = {}
    this.textures = {}
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    ++this.generation
    this.clearVisuals()
    this.assets?.release()
    this.parent.remove(this.group)
  }
}

module.exports = {FairyMagicWandEffect, DEFAULTS, normalizeOptions, requiredAssets}
