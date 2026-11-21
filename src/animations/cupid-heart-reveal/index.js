const {getTargetVideoLayout} = require('../../target-size')
const {getBannerAnimation} = require('../banner-registry')
const {CupidHeartRevealEffect, DEFAULTS, normalizeOptions} = require('./CupidHeartRevealEffect')
const getCupidPlacement = (targetSize, properties, video) => {
  const picture = getTargetVideoLayout({}, targetSize, properties, 1)
  return {x: picture.x, y: picture.y, width: picture.width, componentOptions: {
    pictureHeight: picture.height,
    boundsLeft: Math.min(picture.x - picture.width / 2, video.x - video.width / 2) - picture.x,
    boundsRight: Math.max(picture.x + picture.width / 2, video.x + video.width / 2) - picture.x,
    boundsBottom: Math.min(picture.y - picture.height / 2, video.y - video.height / 2) - picture.y,
    boundsTop: Math.max(picture.y + picture.height / 2, video.y + video.height / 2) - picture.y,
  }}
}
const getCupidOptions = (options = {}) => {
  const result = {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!['message', 'width', 'pictureHeight', 'assetBase'].includes(key) && !key.startsWith('bounds') && options[key] !== undefined) result[key] = options[key]
  }
  return result
}
const getInitialVideoOpacity = options => normalizeOptions(options).enabled ? 0 : 1
const registerCupidHeartRevealEffect = window => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-cupid-reveal']) return
  const schema = {targetName: {default: ''}, text: {default: DEFAULTS.message},
    bannerType: {default: '1'}, bannerDesignType: {type: 'int', default: 2}}
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (key === 'message') continue
    schema[key] = {default: value}
    if (typeof value === 'number') schema[key].type = ['particleCount', 'petalCount', 'fragmentCount', 'maxTextureSize'].includes(key) ? 'int' : 'number'
  }
  AFRAME.registerComponent('magic-cupid-reveal', {
    schema,
    init() {
      this.applyVideoOpacity = opacity => {
        const plane = this.el.parentElement?.querySelector('.magic-video-plane')
        const cover = plane?.components?.['magic-target-video-cover']
        if (cover) cover.setRevealOpacity(opacity)
        else if (plane) plane.setAttribute('magic-target-video-cover', 'revealOpacity', opacity)
      }
      this.effect = new CupidHeartRevealEffect({THREE: AFRAME.THREE, document: window.document,
        parent: this.el.object3D, ...this.data, message: this.data.text, onVideoOpacity: this.applyVideoOpacity})
      this.el.setObject3D('cupid-heart-reveal', this.effect.group)
      this.onFound = event => {
        if (event.detail?.name !== this.data.targetName) return
        this.effect.start(); this.loadAssets()
      }
      this.onLost = event => { if (event.detail?.name === this.data.targetName) this.effect.reset() }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    loadAssets() {
      this.assetsReady = this.effect.load().catch(error => {
        if (this.effect.disposed) return
        console.error('[magic] Cupid artwork could not load:', error)
        this.el.emit('cupidrevealerror', {error})
      })
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'cupid-heart-reveal'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported})
      this.loadAssets()
    },
    tick(time, delta) { this.effect.update(delta / 1000) },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose(); this.el.removeObject3D('cupid-heart-reveal')
    },
  })
}
module.exports = {CupidHeartRevealEffect, getCupidPlacement, getCupidOptions, getInitialVideoOpacity, registerCupidHeartRevealEffect}
