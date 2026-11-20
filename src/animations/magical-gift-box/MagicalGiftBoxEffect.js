const {acquireGiftAssets} = require('./assets')
const {getGiftBoxFrame, getSparkleFrame} = require('./timeline')

const MAX_PARTICLES = 96
const DEFAULTS = Object.freeze({
  enabled: true, width: 1, duration: 5, size: 1, offsetX: 0, offsetY: 0.025,
  text: 'Happy Birthday!', sparkleColor: '#ffd36a', heartColor: '#ff64a9',
  textColor: '#79382f', particleCount: 64, maxTextureSize: 768,
  assetBase: './animations/magical-gift-box/assets',
})

const finite = (value, fallback, min, max) =>
  Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback

const normalizeOptions = (options) => ({
  ...DEFAULTS, ...options,
  enabled: options.enabled !== false,
  width: finite(options.width, DEFAULTS.width, 0.001, 100),
  duration: finite(options.duration, DEFAULTS.duration, 0.5, 60),
  size: finite(options.size, DEFAULTS.size, 0.1, 3),
  offsetX: finite(options.offsetX, DEFAULTS.offsetX, -3, 3),
  // Positive Y offsets move down, so customization cannot move the effect into the video.
  offsetY: finite(options.offsetY, DEFAULTS.offsetY, 0, 3),
  particleCount: Math.round(finite(options.particleCount, DEFAULTS.particleCount, 0, MAX_PARTICLES)),
  maxTextureSize: Math.round(finite(options.maxTextureSize, DEFAULTS.maxTextureSize, 256, 1024)),
})

const drawGiftMessage = (canvas, message, color) => {
  canvas.width = 1024
  canvas.height = 320
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  const text = String(message ?? '').slice(0, 180)
  let lines = []
  let size = 84
  for (; size >= 16; size -= 2) {
    context.font = `600 ${size}px Georgia, serif`
    lines = []
    // Character wrapping also handles long names without spaces.
    for (const paragraph of text.split('\n').slice(0, 3)) {
      let line = ''
      for (const character of paragraph) {
        if (context.measureText(line + character).width > 950 && line) {
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
    if (lines.length <= 3 && lines.length * size * 1.15 <= 280) break
  }
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = color
  const lineHeight = size * 1.15
  lines.slice(0, 3).forEach((line, index) => {
    context.fillText(line, 512, 160 + (index - (Math.min(lines.length, 3) - 1) / 2) * lineHeight, 950)
  })
}

class MagicalGiftBoxEffect {
  constructor({THREE, document, parent, ...options}) {
    this.THREE = THREE
    this.document = document
    this.parent = parent
    this.options = normalizeOptions(options)
    this.group = new THREE.Group()
    this.group.name = 'MagicalGiftBoxEffect'
    this.group.visible = false
    parent.add(this.group)
    this.edgeUniform = {value: new THREE.Matrix4()}
    this.materials = []
    this.geometries = []
    this.elapsed = 0
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
      this.seek(0)
      return true
    }).catch((error) => {
      this.assets.release()
      this.assets = null
      this.loading = null
      throw error
    })
    return this.loading
  }

  // Clip each fragment in the entity's coordinates, even when the tracked parent rotates.
  clipMaterial(material, crop) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uGiftToEdge = this.edgeUniform
      shader.uniforms.uGiftFadeTop = {value: crop.top}
      shader.uniforms.uGiftFadeWidth = {value: crop.feather || 0}
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nuniform mat4 uGiftToEdge;\nvarying float vGiftEdgeY;\nvarying float vGiftUvY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n' +
          'vGiftEdgeY = (uGiftToEdge * modelMatrix * vec4(transformed, 1.0)).y;\nvGiftUvY = uv.y;')
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        '#include <common>\nvarying float vGiftEdgeY;\nvarying float vGiftUvY;\nuniform float uGiftFadeTop, uGiftFadeWidth;')
        .replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif (vGiftEdgeY > -0.001) discard;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' +
          'if (uGiftFadeWidth > 0.0) diffuseColor.a *= 1.0 - smoothstep(uGiftFadeTop - uGiftFadeWidth, uGiftFadeTop, vGiftUvY);')
    }
    material.customProgramCacheKey = () => 'magical-gift-bottom-edge-v1'
    return material
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
    const material = this.clipMaterial(new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0, alphaTest: 0.012,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      forceSinglePass: true, toneMapped: false,
    }), crop)
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
    this.textTexture.minFilter = this.THREE.LinearFilter
    this.textTexture.magFilter = this.THREE.LinearFilter
    this.textTexture.generateMipmaps = false
    drawGiftMessage(this.canvas, this.options.text, this.options.textColor)
    this.textPlane = this.sprite(this.textTexture, 0.64, 26)
    this.textTexture.needsUpdate = true
    this.buildSparkles()
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
        uGiftToEdge: this.edgeUniform,
        uGold: {value: new THREE.Color(this.options.sparkleColor)},
        uPink: {value: new THREE.Color(this.options.heartColor)},
      },
      vertexShader: `
        attribute vec3 aCenter;
        attribute float aSize, aOpacity, aSpin, aTint;
        uniform mat4 uGiftToEdge;
        varying vec2 vPoint;
        varying float vAlpha, vTint, vEdgeY;
        void main() {
          float c = cos(aSpin), s = sin(aSpin);
          vec2 rotated = mat2(c, s, -s, c) * position.xy * aSize;
          vec3 p = aCenter + vec3(rotated, 0.0);
          vPoint = position.xy;
          vAlpha = aOpacity;
          vTint = aTint;
          vEdgeY = (uGiftToEdge * modelMatrix * vec4(p, 1.0)).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uGold, uPink;
        varying vec2 vPoint;
        varying float vAlpha, vTint, vEdgeY;
        void main() {
          if (vEdgeY > -0.001) discard;
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
    if (this.canvas && (previous.text !== this.options.text || previous.textColor !== this.options.textColor)) {
      drawGiftMessage(this.canvas, this.options.text, this.options.textColor)
      this.textTexture.needsUpdate = true
    }
    if (this.sparkles) {
      this.sparkles.material.uniforms.uGold.value.set(this.options.sparkleColor)
      this.sparkles.material.uniforms.uPink.value.set(this.options.heartColor)
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
    this.seek(0)
  }

  update(deltaSeconds) {
    if (this.ready && this.tracked && this.options.enabled && !this.disposed) {
      this.seek(this.elapsed + Math.min(Math.max(deltaSeconds || 0, 0), 0.05))
    }
  }

  seek(elapsed) {
    this.elapsed = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0)
    this.group.visible = this.ready && this.tracked && this.options.enabled && !this.disposed
    if (!this.ready) return
    const frame = getGiftBoxFrame(this.elapsed, this.options.duration)
    const scale = this.options.width * this.options.size
    this.group.scale.setScalar(scale)
    this.group.position.set(this.options.width * this.options.offsetX, -this.options.width * this.options.offsetY, 0)
    const show = (mesh, opacity, x, y, size = 1, rotation = 0, z = 0) => {
      mesh.visible = opacity > 0.001
      mesh.material.opacity = opacity
      mesh.position.set(x, y, z)
      mesh.scale.setScalar(size)
      mesh.rotation.z = rotation
    }
    show(this.closed, frame.closed, 0, frame.giftY, frame.entranceScale)
    show(this.closedBody, frame.closedBody, 0, -0.9826)
    show(this.lid, frame.lidOpacity, 0.04 * Math.sin(frame.lidRotation), frame.lidY,
      frame.lidScale, frame.lidRotation, 0.02)
    const foot = -1.11 + frame.float
    show(this.explosion, frame.explosion, 0, foot + 0.46 * frame.pulse, frame.pulse)
    show(this.hearts, frame.hearts, 0, foot + 0.47 * frame.expansion, frame.expansion)
    show(this.stars, frame.stars, 0, foot + 0.47 * frame.expansion, frame.expansion)
    show(this.openBody, frame.openBody, -0.0322, foot + 0.023 + this.openBody.userData.height / 2)
    this.gifts.forEach((gift, index) => {
      const side = index === 0 ? -1 : 1
      show(gift, frame.giftsOpacity, side * frame.giftSpread * 0.57,
        -0.89 + frame.giftSpread * 0.39 + Math.sin(frame.time * 1.8 + index) * 0.012,
        0.5 + frame.giftSpread * 0.5, side * frame.giftSpread * 0.22 + Math.sin(frame.time + index) * 0.035,
        0.025)
    })
    show(this.banner, frame.bannerOpacity, 0, frame.bannerY, 1, 0, 0.04)
    show(this.textPlane, frame.bannerOpacity, 0, frame.bannerY - 0.065, 1, 0, 0.045)
    const attributes = this.sparkleAttributes
    this.sparkles.geometry.instanceCount = this.options.particleCount
    for (let i = 0; i < this.options.particleCount; i++) {
      const particle = getSparkleFrame(i, frame.time)
      attributes.aCenter.setXYZ(i, particle.x, particle.y, particle.z)
      attributes.aSize.setX(i, particle.size)
      attributes.aOpacity.setX(i, particle.opacity)
      attributes.aSpin.setX(i, particle.spin)
      attributes.aTint.setX(i, particle.tint)
    }
    Object.values(attributes).forEach(attribute => { attribute.needsUpdate = true })
    this.parent.updateWorldMatrix(true, false)
    this.edgeUniform.value.copy(this.parent.matrixWorld).invert()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.group.visible = false
    this.parent.remove(this.group)
    this.geometries.forEach(geometry => geometry.dispose())
    this.materials.forEach(material => material.dispose())
    this.textTexture?.dispose()
    this.assets?.release()
    this.group.clear()
  }
}

module.exports = {MagicalGiftBoxEffect, DEFAULTS, normalizeOptions, drawGiftMessage}
