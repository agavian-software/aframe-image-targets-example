const {getTargetVideoLayout} = require('../../target-size')
const {getBannerAnimation} = require('../banner-registry')
const {GoldenRingsAnniversaryEffect, DEFAULTS} = require('./GoldenRingsAnniversaryEffect')
const getAnniversaryPlacement = (targetSize, properties, video) => {
  const picture = getTargetVideoLayout({}, targetSize, properties, 1)
  const left = Math.min(picture.x - picture.width / 2, video.x - video.width / 2)
  const right = Math.max(picture.x + picture.width / 2, video.x + video.width / 2)
  const top = Math.max(picture.y + picture.height / 2, video.y + video.height / 2)
  const bottom = Math.min(picture.y - picture.height / 2, video.y - video.height / 2)
  return {x: (left + right) / 2, y: top, width: right - left, componentOptions: {pictureHeight: top - bottom}}
}
const getAnniversaryOptions = (options = {}) => {
  const result = {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!['message', 'width', 'pictureHeight', 'assetBase'].includes(key) && options[key] !== undefined) result[key] = options[key]
  }
  return result
}
const registerGoldenRingsAnniversaryEffect = window => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-golden-rings-anniversary']) return
  const schema = {targetName: {default: ''}, text: {default: DEFAULTS.message},
    bannerType: {default: '2'}, bannerDesignType: {type: 'int', default: 0}}
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (key === 'message') continue
    schema[key] = {default: value}
    if (typeof value === 'number') schema[key].type = ['anniversaryNumber', 'particleCount', 'petalCount', 'heartParticleCount', 'maxTextureSize'].includes(key) ? 'int' : 'number'
  }
  AFRAME.registerComponent('magic-golden-rings-anniversary', {
    schema,
    init() {
      this.effect = new GoldenRingsAnniversaryEffect({THREE: AFRAME.THREE, document: window.document,
        parent: this.el.object3D, ...this.data, message: this.data.text, enabled: false})
      this.el.setObject3D('golden-rings-anniversary', this.effect.group)
      this.onFound = event => { if (event.detail?.name === this.data.targetName) this.effect.start() }
      this.onLost = event => { if (event.detail?.name === this.data.targetName) this.effect.reset() }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'golden-rings-anniversary'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported})
      this.assetsReady = this.effect.load().catch(error => {
        if (this.effect.disposed) return
        console.error('[magic] Anniversary artwork could not load:', error)
        this.el.emit('anniversaryringserror', {error})
      })
    },
    tick(time, delta) { this.effect.update(delta / 1000) },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose(); this.el.removeObject3D('golden-rings-anniversary')
    },
  })
}
module.exports = {GoldenRingsAnniversaryEffect, getAnniversaryPlacement, getAnniversaryOptions, registerGoldenRingsAnniversaryEffect}
