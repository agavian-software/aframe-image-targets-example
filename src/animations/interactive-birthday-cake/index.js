const {getTargetVideoLayout} = require('../../target-size')
const {getBannerAnimation} = require('../banner-registry')
const {InteractiveBirthdayCakeEffect, DEFAULTS} = require('./InteractiveBirthdayCakeEffect')

const getCakePlacement = (targetSize, properties, video) => {
  const picture = getTargetVideoLayout({}, targetSize, properties, 1)
  return {x: picture.x, y: Math.min(picture.y - picture.height / 2, video.y - video.height / 2),
    width: Math.max(picture.width, video.width)}
}
const getCakeOptions = (options = {}) => {
  const result = {}
  for (const key of ['name', 'size', 'offsetX', 'offsetY', 'duration', 'speed', 'candleCount',
    'showHint', 'showMessage', 'showCelebration', 'showParticles', 'textColor', 'sparkleColor',
    'cakeTint', 'particleCount', 'maxTextureSize']) if (options[key] !== undefined) result[key] = options[key]
  return result
}

const registerInteractiveBirthdayCakeEffect = (window) => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-birthday-cake']) return
  const schema = {targetName: {default: ''}, text: {default: DEFAULTS.message},
    bannerType: {default: '0'}, bannerDesignType: {type: 'int', default: 4}}
  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (name === 'message') continue
    schema[name] = {default: value}
    if (typeof value === 'number') schema[name].type = ['candleCount', 'particleCount', 'maxTextureSize'].includes(name) ? 'int' : 'number'
  }
  AFRAME.registerComponent('magic-birthday-cake', {
    schema,
    init() {
      this.effect = new InteractiveBirthdayCakeEffect({THREE: AFRAME.THREE, document: window.document,
        parent: this.el.object3D, ...this.data, message: this.data.text, enabled: false,
        onCandleBlown: detail => this.el.emit('cakecandleblown', detail),
        onCelebrate: detail => this.el.emit('cakecelebration', detail)})
      this.el.setObject3D('interactive-birthday-cake', this.effect.group)
      this.onFound = (event) => {
        if (event.detail?.name === this.data.targetName) this.effect.start()
      }
      this.onLost = (event) => {
        if (event.detail?.name === this.data.targetName) this.effect.reset()
      }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    bindInteraction() {
      const scene = this.el.sceneEl
      const element = scene.canvas || scene.renderer?.domElement
      if (element) this.effect.attachInteraction({element, getCamera: () => scene.camera,
        allowed: () => scene.isPlaying !== false && window.document.querySelector('#videoPlayer')?.hidden !== false})
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'interactive-birthday-cake'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported})
      this.assetsReady = this.effect.load().catch((error) => {
        if (this.effect.disposed) return
        console.error('[magic] Cake artwork could not load:', error)
        this.el.emit('birthdaycakeerror', {error})
      })
      this.bindInteraction()
    },
    tick(time, delta) { this.bindInteraction(); this.effect.update(delta / 1000) },
    pause() { this.effect?.interaction?.reset() },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose()
      this.el.removeObject3D('interactive-birthday-cake')
    },
  })
}

module.exports = {InteractiveBirthdayCakeEffect, getCakePlacement, getCakeOptions, registerInteractiveBirthdayCakeEffect}
