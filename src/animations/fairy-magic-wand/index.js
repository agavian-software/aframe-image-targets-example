const {getTargetVideoLayout} = require('../../target-size')
const {getBannerAnimation} = require('../banner-registry')
const {setTargetVideoOpacity} = require('../shared/video-reveal')
const {FairyMagicWandEffect, DEFAULTS, normalizeOptions} = require('./FairyMagicWandEffect')

const getFairyPlacement = (targetSize, properties, video) => {
  const picture = getTargetVideoLayout({}, targetSize, properties, 1)
  const left = Math.min(picture.x - picture.width / 2, video.x - video.width / 2)
  const right = Math.max(picture.x + picture.width / 2, video.x + video.width / 2)
  const top = Math.max(picture.y + picture.height / 2, video.y + video.height / 2)
  const bottom = Math.min(picture.y - picture.height / 2, video.y - video.height / 2)
  const x = (left + right) / 2
  return {x, y: top, width: right - left, componentOptions: {
    pictureHeight: top - bottom,
    centerOffsetX: picture.x - x,
    centerOffsetY: picture.y - (top + bottom) / 2,
  }}
}

const getInitialVideoOpacity = options => normalizeOptions(options).enabled ? 0 : 1

const getFairyOptions = (options = {}) => {
  const result = {}
  for (const key of ['size', 'fairySize', 'offsetX', 'offsetY', 'duration', 'speed',
    'showFairy', 'useHoverPose', 'showCircle', 'showParticles', 'showTrail', 'showBurst',
    'showStars', 'showMessage', 'showWandHighlight', 'sparkleColor', 'textColor',
    'fairyTint', 'ribbonTint', 'particleCount', 'maxTextureSize']) {
    if (options[key] !== undefined) result[key] = options[key]
  }
  if (options.enabled !== undefined) result.enabled = normalizeOptions(options).enabled
  return result
}

const registerFairyMagicWandEffect = (window) => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-fairy-wand']) return
  const schema = {targetName: {default: ''}, text: {default: DEFAULTS.message},
    bannerType: {default: '0'}, bannerDesignType: {type: 'int', default: 3}}
  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (name === 'message') continue
    schema[name] = {default: value}
    if (typeof value === 'number') schema[name].type = ['particleCount', 'maxTextureSize'].includes(name) ? 'int' : 'number'
  }
  AFRAME.registerComponent('magic-fairy-wand', {
    schema,
    init() {
      this.effect = new FairyMagicWandEffect({THREE: AFRAME.THREE, document: window.document,
        parent: this.el.object3D, ...this.data, message: this.data.text,
        onVideoOpacity: opacity => setTargetVideoOpacity(this.el, opacity),
        onVideoReady: () => this.el.emit('magicvideorevealready', {targetName: this.data.targetName}, false),
      })
      this.el.setObject3D('fairy-magic-wand', this.effect.group)
      this.onFound = (event) => {
        if (event.detail?.name === this.data.targetName) this.effect.start()
      }
      this.onLost = (event) => {
        if (event.detail?.name === this.data.targetName) this.effect.reset()
      }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'fairy-magic-wand'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported})
      if (!this.effect.options.enabled) return
      const loading = this.effect.load()
      if (loading === this.assetsPromise) return
      this.assetsPromise = loading
      this.assetsReady = loading.catch((error) => {
        if (this.effect.disposed) return
        console.error('[magic] Fairy artwork could not load:', error)
        this.el.emit('fairymagicerror', {error})
      })
    },
    tick(time, delta) { this.effect.update(delta / 1000) },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose()
      this.el.removeObject3D('fairy-magic-wand')
    },
  })
}

module.exports = {FairyMagicWandEffect, getFairyPlacement, getFairyOptions, getInitialVideoOpacity, registerFairyMagicWandEffect}
