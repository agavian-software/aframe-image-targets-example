const {getFlowerArchPlacement} = require('../magical-wedding-flower-arch')
const {getBannerAnimation} = require('../banner-registry')
const {TraditionalSouthIndianWeddingArchEffect, DEFAULTS, normalizeOptions, mapTempleOptions} = require('./TraditionalSouthIndianWeddingArchEffect')
const getTempleArchPlacement = (...args) => getFlowerArchPlacement(...args)
const getTempleArchOptions = (options = {}) => {
  const mapped = mapTempleOptions(options), result = {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!['message', 'width', 'pictureHeight', 'assetBase', 'closedVideoOpacity'].includes(key) && mapped[key] !== undefined) result[key] = mapped[key]
  }
  return result
}
const getInitialVideoOpacity = options => normalizeOptions(options).enabled ? 0 : 1
const registerTraditionalSouthIndianWeddingArchEffect = window => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-south-indian-wedding-arch']) return
  const schema = {targetName: {default: ''}, text: {default: DEFAULTS.message}, bannerType: {default: '2'}, bannerDesignType: {type: 'int', default: 2}}
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (['message', 'closedVideoOpacity'].includes(key)) continue
    schema[key] = {default: value}
    if (typeof value === 'number') schema[key].type = ['anniversaryNumber', 'particleCount', 'petalCount', 'maxTextureSize'].includes(key) ? 'int' : 'number'
  }
  AFRAME.registerComponent('magic-south-indian-wedding-arch', {
    schema,
    init() {
      this.effect = new TraditionalSouthIndianWeddingArchEffect({THREE: AFRAME.THREE, document: window.document,
        parent: this.el.object3D, ...this.data, message: this.data.text, onVideoOpacity: opacity => {
          const plane = this.el.parentElement?.querySelector('.magic-video-plane'), cover = plane?.components?.['magic-target-video-cover']
          if (cover) cover.setRevealOpacity(opacity)
          else if (plane) plane.setAttribute('magic-target-video-cover', 'revealOpacity', opacity)
        }})
      this.el.setObject3D('traditional-south-indian-wedding-arch', this.effect.group)
      this.onFound = event => { if (event.detail?.name === this.data.targetName) { this.effect.start(); this.loadAssets() } }
      this.onLost = event => { if (event.detail?.name === this.data.targetName) this.effect.reset() }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound); this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    loadAssets() {
      const loading = this.effect.load()
      if (this.assetsPromise === loading) return
      this.assetsPromise = loading
      this.assetsReady = loading.catch(error => {
        if (this.effect.disposed) return
        console.error('[magic] Temple arch artwork could not load:', error); this.el.emit('templearcherror', {error})
      })
    },
    bindInteraction() {
      const scene = this.el.sceneEl, element = scene.canvas || scene.renderer?.domElement
      if (element) this.effect.attachInteraction({element, getCamera: () => scene.camera,
        allowed: () => scene.isPlaying !== false && window.document.querySelector('#videoPlayer')?.hidden !== false})
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) {
        this.effect.tracked = false; this.effect.resetState()
      }
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'traditional-south-indian-wedding-arch'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported}); this.loadAssets(); this.bindInteraction()
    },
    tick(time, delta) { this.bindInteraction(); this.effect.update(delta / 1000) },
    pause() { this.effect?.interaction?.reset() },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound); this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose(); this.el.removeObject3D('traditional-south-indian-wedding-arch')
    },
  })
}
module.exports = {TraditionalSouthIndianWeddingArchEffect, getTempleArchPlacement, getTempleArchOptions, getInitialVideoOpacity, registerTraditionalSouthIndianWeddingArchEffect}
