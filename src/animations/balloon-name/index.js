const {getTargetVideoLayout} = require('../../target-size')
const {getBannerAnimation} = require('../banner-registry')
const {BalloonNameEffect, DEFAULTS} = require('./BalloonNameEffect')

const getBalloonPlacement = (targetSize, properties, video) => {
  const picture = getTargetVideoLayout({}, targetSize, properties, 1)
  const left = Math.min(picture.x - picture.width / 2, video.x - video.width / 2)
  const right = Math.max(picture.x + picture.width / 2, video.x + video.width / 2)
  const top = Math.max(picture.y + picture.height / 2, video.y + video.height / 2)
  const bottom = Math.min(picture.y - picture.height / 2, video.y - video.height / 2)
  return {x: (left + right) / 2, y: top, width: right - left, componentOptions: {pictureHeight: top - bottom}}
}

const getBalloonOptions = (options = {}) => {
  const result = {}
  for (const name of ['name', 'duration', 'size', 'offsetX', 'offsetY', 'letterColor', 'outlineColor',
    'messageColor', 'sparkleColor', 'pinkTint', 'goldTint', 'particleCount', 'maxTextureSize',
    'showBouquets', 'showLetters', 'showBanner', 'showCenterBouquet', 'showCelebration']) {
    if (options[name] !== undefined) result[name] = options[name]
  }
  return result
}

const registerBalloonNameEffect = (window) => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-balloon-name']) return
  const schema = {
    targetName: {default: ''}, text: {default: DEFAULTS.message},
    bannerType: {default: '0'}, bannerDesignType: {type: 'int', default: 2},
  }
  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (name === 'message') continue
    schema[name] = {default: value}
    if (typeof value === 'number') schema[name].type = ['particleCount', 'maxTextureSize'].includes(name) ? 'int' : 'number'
  }
  AFRAME.registerComponent('magic-balloon-name', {
    schema,
    init() {
      this.effect = new BalloonNameEffect({
        THREE: AFRAME.THREE, document: window.document, parent: this.el.object3D,
        ...this.data, message: this.data.text, enabled: false,
      })
      this.el.setObject3D('balloon-name', this.effect.group)
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
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'balloon-name'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported})
      this.assetsReady = this.effect.load().catch((error) => {
        if (this.effect.disposed) return
        console.error('[magic] Balloon artwork could not load:', error)
        this.el.emit('balloonnameerror', {error})
      })
    },
    tick(time, delta) { this.effect.update(delta / 1000) },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose()
      this.el.removeObject3D('balloon-name')
    },
  })
}

module.exports = {BalloonNameEffect, getBalloonPlacement, getBalloonOptions, registerBalloonNameEffect}
