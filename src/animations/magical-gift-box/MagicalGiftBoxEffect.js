const {acquireGiftAssets} = require('./assets')
const {DURATION, getEntranceEnd, getGiftBoxLayout, getGiftBoxFrame, getSparkleFrame} = require('./timeline')
const {mix} = require('../shared/easing')
const {TargetTapInteraction} = require('../shared/tap-interaction')

const MAX_PARTICLES = 96
const DEFAULTS = Object.freeze({
  enabled: true, width: 1, pictureHeight: 1, boundsTop: 0.5, duration: DURATION, size: 1, offsetX: 0, offsetY: 0.025,
  text: 'Happy Birthday!', name: '', sparkleColor: '#ffd36a', heartColor: '#ff64a9',
  textColor: '#79382f', particleCount: 64, maxTextureSize: 768,
  assetBase: './animations/magical-gift-box/assets',
})

const finite = (value, fallback, min, max) =>
  Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback

const normalizeOptions = (options = {}) => {
  const enabled = typeof options.enabled === 'string' ? options.enabled.trim().toLowerCase() : options.enabled
  const pictureHeight = finite(options.pictureHeight, DEFAULTS.pictureHeight, 0.001, 100)
  return {
    ...DEFAULTS, ...options, pictureHeight,
    enabled: enabled == null || [true, 1, '1', 'true'].includes(enabled),
    name: String(options.name ?? '').trim(),
    width: finite(options.width, DEFAULTS.width, 0.001, 100),
    boundsTop: finite(options.boundsTop, pictureHeight / 2, 0, 100),
    duration: finite(options.duration, DEFAULTS.duration, 0.5, 60),
    size: finite(options.size, DEFAULTS.size, 0.1, 3),
    offsetX: finite(options.offsetX, DEFAULTS.offsetX, -3, 3),
    offsetY: finite(options.offsetY, DEFAULTS.offsetY, 0, 3),
    particleCount: Math.round(finite(options.particleCount, DEFAULTS.particleCount, 0, MAX_PARTICLES)),
    maxTextureSize: Math.round(finite(options.maxTextureSize, DEFAULTS.maxTextureSize, 256, 1024)),
  }
}

const giftText = options => options.name || options.text

const drawGiftMessage = (canvas, message, color) => {
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  const text = String(message ?? '').slice(0, 180)
  const maxWidth = 950
  let lines = []
  let size = 216
  for (; size >= 16; size -= 2) {
    context.font = `bold ${size}px Georgia, serif`
    lines = []
    // Character wrapping also handles long names without spaces.
    for (const paragraph of text.split('\n').slice(0, 3)) {
      let line = ''
      for (const character of paragraph) {
        if (context.measureText(line + character).width > maxWidth && line) {
          const space = line.lastIndexOf(' ')
          if (space > 0) {
            lines.push(line.slice(0, space))
            line = line.slice(space + 1) + character
          } else {
            lines.push(line)
            line = character
          }
        } else line += character
      }
      lines.push(line)
    }
    if (lines.length <= 3 && lines.length * size * 1.1 <= canvas.height * 0.94) break
  }
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = color
  const lineHeight = size * 1.1
  lines.slice(0, 3).forEach((line, index) => {
    context.fillText(line, canvas.width / 2,
      canvas.height / 2 + (index - (Math.min(lines.length, 3) - 1) / 2) * lineHeight, maxWidth)
  })
}

class MagicalGiftBoxEffect {
  constructor({THREE, document, parent, onVideoOpacity, onVideoReady, ...options}) {
    this.THREE = THREE
    this.document = document
    this.parent = parent
    this.onVideoOpacity = onVideoOpacity
    this.onVideoReady = onVideoReady
    this.options = normalizeOptions(options)
    this.group = new THREE.Group()
    this.group.name = 'MagicalGiftBoxEffect'
    this.group.visible = false
    parent.add(this.group)
    this.materials = []
    this.geometries = []
    this.elapsed = 0
    this.opened = false
    this.videoReleased = false
    this.bypassed = false
    this.tracked = false
    this.ready = false
    this.disposed = false
  }

  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    if (this.loading) return this.loading
    const base = new URL(this.options.assetBase, this.document.baseURI).href
    this.assets = acquireGiftAssets(this.THREE, this.document, base, this.options.maxTextureSize)
    this.loading = this.assets.promise.then((textures) => {
      if (this.disposed) return false
      this.build(textures)
      this.ready = true
      this.artworkFailed = false
      this.seek(this.elapsed)
      return true
    }).catch((error) => {
      this.assets.release()
      this.assets = null
      this.loading = null
      if (!this.disposed) {
        this.artworkFailed = true
        this.seek(this.elapsed)
      }
      throw error
    })
    return this.loading
  }

  featherCrop(material, crop) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uGiftFadeTop = {value: crop.top}
      shader.uniforms.uGiftFadeWidth = {value: crop.feather}
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        '#include <common>\nuniform float uGiftFadeTop, uGiftFadeWidth;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' +
          'diffuseColor.a *= 1.0 - smoothstep(uGiftFadeTop - uGiftFadeWidth, uGiftFadeTop, vMapUv.y);')
    }
    material.customProgramCacheKey = () => 'magical-gift-feather-crop-v1'
  }

  sprite(texture, width, order, crop = {bottom: 0, top: 1}) {
    const THREE = this.THREE
    const left = crop.left || 0
    const right = crop.right ?? 1
    const height = width * texture.image.height / texture.image.width * (crop.top - crop.bottom) / (right - left)
    const geometry = new THREE.PlaneGeometry(width, height)
    const uv = geometry.attributes.uv
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, left + uv.getX(i) * (right - left))
      uv.setY(i, crop.bottom + uv.getY(i) * (crop.top - crop.bottom))
    }
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0, alphaTest: 0.012,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      forceSinglePass: true, toneMapped: false,
    })
    if (crop.feather) this.featherCrop(material, crop)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = order
    mesh.userData.height = height
    this.group.add(mesh)
    this.geometries.push(geometry)
    this.materials.push(material)
    return mesh
  }

  build(textures) {
    this.closed = this.sprite(textures[0], 0.52, 20)
    this.closedBody = this.sprite(textures[0], 0.52, 20, {bottom: 0, top: 0.49, feather: 0.008})
    this.lid = this.sprite(textures[1], 0.49, 22)
    this.explosion = this.sprite(textures[2], 0.92, 21)
    this.hearts = this.sprite(textures[5], 0.94, 21)
    this.stars = this.sprite(textures[6], 0.94, 21)
    // Reuse just the open box at the bottom of the explosion texture in the final pose.
    this.openBody = this.sprite(textures[2], 0.414, 20,
      {left: 0.24, right: 0.69, bottom: 0.025, top: 0.34, feather: 0.025})
    this.gifts = [this.sprite(textures[3], 0.27, 23), this.sprite(textures[4], 0.27, 23)]
    this.banner = this.sprite(textures[7], 0.9, 25)
    this.canvas = this.document.createElement('canvas')
    this.textTexture = new this.THREE.CanvasTexture(this.canvas)
    this.textTexture.colorSpace = this.THREE.SRGBColorSpace
    this.textTexture.minFilter = this.THREE.LinearMipmapLinearFilter
    this.textTexture.magFilter = this.THREE.LinearFilter
    this.textTexture.generateMipmaps = true
    drawGiftMessage(this.canvas, giftText(this.options), this.options.textColor)
    this.textPlane = this.sprite(this.textTexture, 0.64, 26)
    this.textTexture.needsUpdate = true
    this.buildHint()
    this.buildSparkles()
  }

  buildHint() {
    const canvas = this.document.createElement('canvas')
    canvas.width = 384
    canvas.height = 96
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff2d9'
    ctx.beginPath()
    ctx.arc(48, 48, 43, Math.PI / 2, 3 * Math.PI / 2)
    ctx.arc(336, 48, 43, -Math.PI / 2, Math.PI / 2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#602c32'
    ctx.font = 'bold 51px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Tap to open', 192, 49)
    this.hintTexture = new this.THREE.CanvasTexture(canvas)
    this.hintTexture.colorSpace = this.THREE.SRGBColorSpace
    this.hintTexture.minFilter = this.THREE.LinearFilter
    this.hintTexture.generateMipmaps = false
    this.hint = this.sprite(this.hintTexture, 0.44, 26)
  }

  buildSparkles() {
    const THREE = this.THREE
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setIndex([0, 1, 2, 2, 1, 3])
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
    ]), 3))
    this.sparkleAttributes = {}
    for (const [name, size] of [['aCenter', 3], ['aSize', 1], ['aOpacity', 1], ['aSpin', 1], ['aTint', 1]]) {
      const attribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * size), size)
      attribute.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute(name, attribute)
      this.sparkleAttributes[name] = attribute
    }
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: {
        uGold: {value: new THREE.Color(this.options.sparkleColor)},
        uPink: {value: new THREE.Color(this.options.heartColor)},
      },
      vertexShader: `
        attribute vec3 aCenter;
        attribute float aSize, aOpacity, aSpin, aTint;
        varying vec2 vPoint;
        varying float vAlpha, vTint;
        void main() {
          float c = cos(aSpin), s = sin(aSpin);
          vec2 rotated = mat2(c, s, -s, c) * position.xy * aSize;
          vec3 p = aCenter + vec3(rotated, 0.0);
          vPoint = position.xy;
          vAlpha = aOpacity;
          vTint = aTint;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uGold, uPink;
        varying vec2 vPoint;
        varying float vAlpha, vTint;
        void main() {
          float rays = max(0.0, 1.0 - abs(vPoint.x * vPoint.y) * 70.0 - length(vPoint) * 1.8);
          float core = exp(-dot(vPoint, vPoint) * 42.0);
          float alpha = min(1.0, core + rays * 0.8) * vAlpha;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(mix(uGold, uPink, vTint), alpha);
          #include <colorspace_fragment>
        }`,
    })
    this.sparkles = new THREE.Mesh(geometry, material)
    this.sparkles.frustumCulled = false
    this.sparkles.renderOrder = 24
    this.group.add(this.sparkles)
    this.geometries.push(geometry)
    this.materials.push(material)
  }

  configure(options = {}) {
    const previous = this.options
    this.options = normalizeOptions({...previous, ...options})
    if (this.canvas && (giftText(previous) !== giftText(this.options) || previous.textColor !== this.options.textColor)) {
      drawGiftMessage(this.canvas, giftText(this.options), this.options.textColor)
      this.textTexture.needsUpdate = true
    }
    if (this.sparkles) {
      this.sparkles.material.uniforms.uGold.value.set(this.options.sparkleColor)
      this.sparkles.material.uniforms.uPink.value.set(this.options.heartColor)
    }
    if (!this.options.enabled) this.interaction?.reset()
    this.seek(this.elapsed * this.options.duration / previous.duration)
  }

  start() {
    if (this.disposed || this.tracked) return
    this.tracked = true
    this.seek(0)
  }

  reset() {
    this.tracked = false
    this.opened = false
    this.videoReleased = false
    this.bypassed = false
    this.interaction?.reset()
    this.seek(0)
  }

  get canOpen() {
    return this.group.visible && !this.opened && this.elapsed >= getEntranceEnd(this.options.duration)
  }

  open() {
    if (!this.canOpen) return false
    this.opened = true
    this.seek(this.elapsed)
    return true
  }

  attachInteraction({element, getCamera, allowed = () => true}) {
    if (!element || this.interaction?.element === element) return
    this.interaction?.dispose()
    const raycaster = new this.THREE.Raycaster()
    const pointer = new this.THREE.Vector2()
    this.interaction = new TargetTapInteraction({
      element, document: this.document,
      allowed: () => this.canOpen && allowed(),
      onTap: (x, y, rect) => {
        const camera = getCamera()
        if (!camera) return false
        pointer.set(2 * (x - rect.left) / rect.width - 1, 1 - 2 * (y - rect.top) / rect.height)
        camera.updateWorldMatrix(true, false)
        this.group.updateWorldMatrix(true, true)
        raycaster.setFromCamera(pointer, camera)
        return raycaster.intersectObjects([this.closed, this.hint], false).length > 0 && this.open()
      },
    })
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
    if (this.group.visible && !this.canOpen && !this.videoReleased) {
      this.seek(this.elapsed + Math.min(Math.max(deltaSeconds || 0, 0), 0.05))
    }
  }

  seek(elapsed) {
    if (this.disposed) return
    const o = this.options
    const limit = this.opened ? o.duration : getEntranceEnd(o.duration)
    this.elapsed = this.videoReleased && !this.bypassed
      ? o.duration : Math.min(limit, Math.max(0, Number.isFinite(elapsed) ? elapsed : 0))
    if (this.tracked && (!o.enabled || this.artworkFailed)) this.bypassed = true
    this.group.visible = this.ready && this.tracked && o.enabled && !this.bypassed
    if (!this.group.visible) {
      this.publishVideo(!o.enabled || this.bypassed)
      return
    }
    const frame = getGiftBoxFrame(this.elapsed, o.duration)
    const {x, y, scale, top, halfHeight} = getGiftBoxLayout(o)
    this.group.scale.setScalar(scale)
    const show = (mesh, opacity, x, y, size = 1, rotation = 0, z = 0) => {
      mesh.visible = opacity > 0.001
      mesh.material.opacity = opacity
      mesh.position.set(x, y, z)
      mesh.scale.setScalar(size)
      mesh.rotation.z = rotation
    }
    show(this.closed, frame.closed * frame.entranceOpacity, x, y + frame.entranceY, frame.entranceScale)
    show(this.closedBody, frame.closedBody, x, y - 0.1326)
    show(this.lid, frame.lidOpacity, x + 0.04 * Math.sin(frame.lidRotation), y + frame.lidY,
      frame.lidScale, frame.lidRotation, 0.02)
    const foot = y - 0.26
    show(this.explosion, frame.explosion * frame.artOpacity, x, foot + 0.46 * frame.pulse, frame.pulse)
    show(this.hearts, frame.hearts * frame.artOpacity, x, foot + 0.47)
    show(this.stars, frame.stars * frame.artOpacity, x, foot + 0.47)
    show(this.openBody, frame.openBody * frame.artOpacity, x - 0.0322, foot + 0.023 + this.openBody.userData.height / 2)
    this.gifts.forEach((gift, index) => {
      const side = index === 0 ? -1 : 1
      show(gift, frame.giftsOpacity * frame.artOpacity, x + side * frame.giftSpread * 0.57,
        y - 0.04 + frame.giftSpread * 0.39 + Math.sin(frame.time * 1.8 + index) * 0.012,
        0.5 + frame.giftSpread * 0.5, side * frame.giftSpread * 0.22 + Math.sin(frame.time + index) * 0.035,
        0.025)
    })
    const bannerScale = mix(0.73, 0.86, Math.max(frame.bannerOpacity * 0.35, frame.bannerLift))
    const bannerHalf = this.banner.userData.height * bannerScale / 2
    const bannerY = mix(Math.min(y + 0.17, halfHeight - bannerHalf), top + bannerHalf, frame.bannerLift)
    const bannerX = mix(x, 0, frame.bannerLift)
    show(this.banner, frame.bannerOpacity, bannerX, bannerY, bannerScale, 0, 0.04)
    show(this.textPlane, frame.bannerOpacity, bannerX, bannerY - 0.065 * bannerScale, bannerScale, 0, 0.045)
    const hintY = Math.min(y + 0.34, halfHeight - 0.061)
    show(this.hint, this.canOpen ? 1 : 0, x, hintY, 1, 0, 0.045)
    this.renderSparkles(frame, x, y)
    this.publishVideo(frame.videoReady)
  }

  renderSparkles(frame, x, y) {
    const count = this.options.particleCount
    this.sparkles.visible = count > 0 && frame.time >= 1.44 && frame.time < 3.7
    if (!this.sparkles.visible) return
    const attributes = this.sparkleAttributes
    this.sparkles.geometry.instanceCount = count
    for (let i = 0; i < count; i++) {
      const particle = getSparkleFrame(i, frame.time)
      attributes.aCenter.setXYZ(i, x + particle.x, y + particle.y, particle.z)
      attributes.aSize.setX(i, particle.size)
      attributes.aOpacity.setX(i, particle.opacity)
      attributes.aSpin.setX(i, particle.spin)
      attributes.aTint.setX(i, particle.tint)
    }
    Object.values(attributes).forEach(attribute => { attribute.needsUpdate = true })
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.group.visible = false
    this.interaction?.dispose()
    this.parent.remove(this.group)
    this.geometries.forEach(geometry => geometry.dispose())
    this.materials.forEach(material => material.dispose())
    this.textTexture?.dispose()
    this.hintTexture?.dispose()
    this.assets?.release()
    this.group.clear()
  }
}

module.exports = {MagicalGiftBoxEffect, DEFAULTS, normalizeOptions, drawGiftMessage}
