const {getTargetVideoLayout} = require('../../target-size')
const {getBannerAnimation} = require('../banner-registry')
const {FlyingLoveLetterEffect, DEFAULTS} = require('./FlyingLoveLetterEffect')

const getLoveLetterPlacement = (targetSize, properties, video) => {
  const picture = getTargetVideoLayout({}, targetSize, properties, 1)
  const left = Math.min(picture.x - picture.width / 2, video.x - video.width / 2)
  const right = Math.max(picture.x + picture.width / 2, video.x + video.width / 2)
  return {x: (left + right) / 2,
    y: Math.max(picture.y + picture.height / 2, video.y + video.height / 2), width: right - left}
}
const getLoveLetterOptions = (options = {}) => {
  const result = {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!['message', 'width', 'assetBase'].includes(key) && options[key] !== undefined) result[key] = options[key]
  }
  return result
}
const registerFlyingLoveLetterEffect = (window) => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-love-letter']) return
  const schema = {targetName: {default: ''}, text: {default: DEFAULTS.message},
    bannerType: {default: '1'}, bannerDesignType: {type: 'int', default: 1}}
  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (name === 'message') continue
    schema[name] = {default: value}
    if (typeof value === 'number') schema[name].type = ['particleCount', 'petalCount', 'maxTextureSize'].includes(name) ? 'int' : 'number'
  }
  AFRAME.registerComponent('magic-love-letter', {
    schema,
    init() {
      this.effect = new FlyingLoveLetterEffect({THREE: AFRAME.THREE, document: window.document,
        parent: this.el.object3D, ...this.data, message: this.data.text, enabled: false})
      this.el.setObject3D('flying-love-letter', this.effect.group)
      this.onFound = event => { if (event.detail?.name === this.data.targetName) this.effect.start() }
      this.onLost = event => { if (event.detail?.name === this.data.targetName) this.effect.reset() }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    bindInteraction() {
      const scene = this.el.sceneEl
      const element = scene.canvas || scene.renderer?.domElement
      if (element) this.effect.attachInteraction({element, getCamera: () => scene.camera,
        allowed: () => scene.isPlaying !== false && window.document.querySelector('#videoPlayer')?.hidden !== false})
      if (window.document.querySelector('#videoPlayer')?.hidden === false) this.effect.closeReader()
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'flying-love-letter'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported})
      this.assetsReady = this.effect.load().catch(error => {
        if (this.effect.disposed) return
        console.error('[magic] Love letter artwork could not load:', error)
        this.el.emit('lovelettererror', {error})
      })
      this.bindInteraction()
    },
    tick(time, delta) { this.bindInteraction(); this.effect.update(delta / 1000) },
    pause() { this.effect?.closeReader(); this.effect?.interaction?.reset() },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose(); this.el.removeObject3D('flying-love-letter')
    },
  })
}

module.exports = {FlyingLoveLetterEffect, getLoveLetterPlacement, getLoveLetterOptions, registerFlyingLoveLetterEffect}
