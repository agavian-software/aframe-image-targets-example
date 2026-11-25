const {getPhotoVideoPlacement, setTargetVideoOpacity} = require('../shared/video-reveal')
const {getBannerAnimation} = require('../banner-registry')
const {TeddyBearSorryEffect, DEFAULTS, ASSET_BASE, normalizeOptions} = require('./TeddyBearSorryEffect')

const COMPONENT = 'magic-teddy-bear-sorry'
const optionKeys = Object.keys(DEFAULTS).filter(key =>
  !['message', 'width', 'pictureHeight'].includes(key) && !key.startsWith('bounds'))
const getTeddyOptions = options => {
  const normalized = normalizeOptions(options)
  return Object.fromEntries(optionKeys.map(key => [key, normalized[key]]))
}

const getInitialVideoOpacity = options => {
  const {enabled, revealVideo} = normalizeOptions(options)
  return enabled && revealVideo ? 0 : 1
}

const registerTeddyBearSorryEffect = window => {
  const {AFRAME, document} = window
  if (!AFRAME || AFRAME.components[COMPONENT]) return
  const schema = {
    targetName: {default: ''}, text: {default: DEFAULTS.message}, assetBase: {default: ASSET_BASE},
    bannerType: {default: '3'}, bannerDesignType: {type: 'int', default: 1},
  }
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (key !== 'message') schema[key] = {default: value}
  }

  AFRAME.registerComponent(COMPONENT, {
    schema,
    init() {
      this.effect = new TeddyBearSorryEffect({
        THREE: AFRAME.THREE, document, ...this.data, message: this.data.text,
        onVideoOpacity: opacity => setTargetVideoOpacity(this.el, opacity),
        onVideoReady: () => this.el.emit('magicvideorevealready', {targetName: this.data.targetName}, false),
      })
      this.el.setObject3D(COMPONENT, this.effect.group)
      this.onFound = event => {
        if (event.detail?.name === this.data.targetName) this.effect.start()
      }
      this.onLost = event => {
        if (event.detail?.name === this.data.targetName) this.effect.reset()
      }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'teddy-bear-sorry'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported})
      if (this.effect.options.enabled && !this.assetsReady) {
        this.assetsReady = this.effect.load().catch(error => {
          console.error('[magic] Teddy apology artwork could not load:', error)
          this.el.emit('teddybearsorryerror', {error})
        })
      }
      if (!this.effect.options.enabled || !this.effect.options.interactiveLetter) {
        this.effect.interaction?.dispose()
        this.effect.interaction = null
      }
    },
    tick(time, delta) {
      const {options, interaction} = this.effect
      if (options.enabled && options.interactiveLetter && !interaction) {
        const scene = this.el.sceneEl
        const element = scene.canvas || scene.renderer?.domElement
        if (element) this.effect.attachInteraction({
          element, getCamera: () => scene.camera,
          allowed: () => scene.isPlaying !== false && document.querySelector('#videoPlayer')?.hidden !== false,
        })
      }
      this.effect.update(delta / 1000)
    },
    pause() { this.effect?.interaction?.reset() },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose()
      this.el.removeObject3D(COMPONENT)
    },
  })
}

module.exports = {TeddyBearSorryEffect, registerTeddyBearSorryEffect, getTeddyOptions, getInitialVideoOpacity,
  getTeddyPlacement: getPhotoVideoPlacement}
