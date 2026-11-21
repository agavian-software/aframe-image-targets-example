const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const {getMagicEntries} = require('../src/magic-entries')
const videoMask = require('../src/video-mask')
const {getBannerAnimation} = require('../src/animations/banner-registry')

class Element {
  constructor(hidden = false) {
    this.hidden = hidden
    this.children = []
    this.dataset = {}
    this.object3D = {position: {}, scale: {set() {}}}
    this.listeners = new Map()
    this.attributes = new Map()
    this.classes = new Set()
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name),
      toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name),
    }
  }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, [])
    this.listeners.get(name).push(callback)
  }
  async emit(name, detail) {
    await Promise.all((this.listeners.get(name) || []).map(callback => callback({detail})))
  }
  setAttribute(name, value, propertyValue) {
    this.attributes.set(name, propertyValue === undefined ? value : {...this.attributes.get(name), [value]: propertyValue})
  }
  appendChild(child) { this.children.push(child); child.parent = this }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this) }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(value => value.trim())
    const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')])
    return descendants.filter(child => selectors.some(value => value === '*' ||
      (value.startsWith('.') && child.classes.has(value.slice(1))) ||
      (value.startsWith('[') && child.attributes.has(value.slice(1, -1)))))
  }
  removeAttribute(name) { this.attributes.delete(name) }
  focus() {}
}

const createApp = ({play, fullscreen = 'standard', loadFailure = false,
  resolveBannerAnimation = getBannerAnimation} = {}) => {
  const ids = ['magic-video', 'videoPlayer', 'customLoader', 'scanOverlay', 'scanStatusText',
    'videoLoader', 'videoLoaderText', 'identificationTimeout', 'identificationTryAgain',
    'identificationExit', 'soundToggle', 'fullscreenToggle', 'videoMessage', 'videoMessageText',
    'videoScanAgain', 'videoPlay', 'videoBackToTarget', 'magic-image-target']
  const elements = Object.fromEntries(ids.map(id => [id, new Element(
    ['videoPlayer', 'soundToggle', 'fullscreenToggle', 'videoMessage', 'videoScanAgain', 'videoPlay', 'videoBackToTarget'].includes(id))]))
  Object.entries(elements).forEach(([id, element]) => { element.id = id })
  const video = elements['magic-video']
  video.playCalls = 0
  video.paused = true
  video.play = async () => {
    video.playCalls++
    if (play) await play(video)
    video.paused = false
    await video.emit('playing')
  }
  video.pause = () => { video.paused = true }
  video.loadCalls = 0
  video.load = () => { video.loadCalls++ }
  const fullscreenCalls = []
  if (fullscreen === 'standard') video.requestFullscreen = async () => fullscreenCalls.push('standard')
  if (fullscreen === 'ios') video.webkitEnterFullscreen = () => fullscreenCalls.push('ios')
  if (fullscreen === 'rejected') video.requestFullscreen = async () => { throw new Error('Denied') }

  const window = new Element()
  const timers = new Map()
  let timerId = 0
  const configurations = []
  const requests = []
  const events = []
  window.location = {search: '', assign() {}}
  window.dispatchEvent = event => { events.push(event.type); window.emit(event.type) }
  window.setTimeout = (callback, delay) => { timers.set(++timerId, {callback, delay}); return timerId }
  window.clearTimeout = id => timers.delete(id)
  const scene = new Element()
  const body = new Element()
  const document = new Element()
  document.body = body
  document.querySelector = selector => selector === 'a-scene' ? scene : elements[selector.slice(1)]
  document.createElement = () => new Element()
  document.addEventListener = (name, callback) => {
    if (name === 'DOMContentLoaded') callback()
    else Element.prototype.addEventListener.call(document, name, callback)
  }
  const xr = {addCameraPipelineModule() {}, XrController: {configure(value) { configurations.push(value) }}}
  // Avoid automatic runtime startup in this camera-free test while still loading target data.
  const sandbox = {
    window, document, navigator: {userAgent: 'Chrome', platform: 'Win32', maxTouchPoints: 0},
    URLSearchParams, Event, console: {error() {}, log() {}},
    Image: class {
      constructor() { this.naturalWidth = 1; this.naturalHeight = 1 }
      set src(value) { this.onload() }
    },
    fetch: async url => {
      requests.push(url)
      return {ok: !loadFailure, status: loadFailure ? 404 : 200,
        json: async () => ({properties: {width: 100, height: 100, originalWidth: 100, originalHeight: 100}})}
    },
  }
  const targetModule = {exports: {}}
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/image-target-playback'), 'utf8'), {
    ...sandbox, module: targetModule,
    require: name => name === './video-mask'
      ? {...videoMask, prepareVideoMaskConfig: async config => config}
      : name === './animations/banner-registry' ? {getBannerAnimation: resolveBannerAnimation}
      : require(`../src/${name.slice(2)}`),
  })
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/app'), 'utf8'), {
    ...sandbox,
    require: name => name === './magic-entries' ? {getMagicEntries}
      : name === './image-target-playback' ? targetModule.exports : {},
  })
  window.XR8 = xr
  const identify = (entries = [{targetName: 'gift', videoUrl: 'videos/gift.mp4', shape: 'circle'}]) =>
    window.emit('imageidentified', {videoUrlV1: entries})
  const start = async entries => {
    await identify(entries)
    await scene.emit('xrimagefound', {name: 'gift'})
  }
  const plane = () => elements['magic-image-target'].querySelector('.magic-video-plane')
  const runLostTimers = () => {
    for (const [id, timer] of [...timers]) {
      if (timer.delay === 2500) { timers.delete(id); timer.callback() }
    }
  }
  return {elements, video, window, scene, document, body, events, fullscreenCalls,
    identify, start, plane, runLostTimers, requests, configurations}
}

test('matched video first plays on its tracked image and never opens the webpage player automatically', async () => {
  const app = createApp()
  assert.equal(app.elements.fullscreenToggle.hidden, true)
  await app.identify()
  assert.equal(app.video.playCalls, 0)
  assert.equal(app.elements.videoPlayer.hidden, true)
  assert.equal(app.requests.length, 1)
  assert.equal(app.configurations[0].imageTargetData[0].name, 'gift')
  await app.scene.emit('xrimagefound', {name: 'gift'})
  assert.equal(app.video.src, 'https://d1y2o0xoe5yirl.cloudfront.net/videos/gift.mp4')
  assert.equal(app.video.playCalls, 1)
  assert.equal(app.plane().attributes.get('visible'), true)
  assert.equal(app.plane().attributes.get('magic-target-video-cover').shape, 'circle')
  assert.equal(app.elements.videoPlayer.hidden, true)
  assert.equal(app.video.controls, false)
  assert.equal(app.elements.fullscreenToggle.hidden, false)
  assert.deepEqual(app.fullscreenCalls, [])
  await app.identify()
  assert.equal(app.video.playCalls, 1)
})

test('fullscreen button uses standard API and iPhone native fallback', async () => {
  for (const fullscreen of ['standard', 'ios']) {
    const app = createApp({fullscreen})
    await app.start([{targetName: 'gift', videoUrl: 'https://media.example/gift.mp4'}])
    assert.equal(app.video.src, 'https://media.example/gift.mp4')
    await app.elements.fullscreenToggle.emit('click')
    assert.deepEqual(app.fullscreenCalls, [fullscreen])
    assert.equal(app.video.playCalls, 1)
    assert.equal(app.elements.videoPlayer.hidden, false)
    assert.equal(app.video.controls, true)
    assert.equal(app.plane().attributes.get('visible'), false)
  }
})

test('switching to webpage fullscreen keeps time and sound and cancels target-loss recovery', async () => {
  const app = createApp()
  await app.start()
  app.video.currentTime = 12.5
  app.video.muted = true
  const loads = app.video.loadCalls
  await app.scene.emit('xrimagelost', {name: 'gift'})
  await app.elements.fullscreenToggle.emit('click')
  app.runLostTimers()
  await app.video.emit('canplay')
  await app.video.emit('playing')
  await app.scene.emit('xrimagelost', {name: 'gift'})
  app.runLostTimers()
  assert.equal(app.video.currentTime, 12.5)
  assert.equal(app.video.muted, true)
  assert.equal(app.video.playCalls, 1)
  assert.equal(app.video.loadCalls, loads)
  assert.equal(app.video.paused, false)
  assert.equal(app.elements.videoPlayer.hidden, false)
  assert.equal(app.plane().attributes.get('visible'), false)
  assert.equal(app.events.includes('imageidentificationresume'), false)
})

test('exiting fullscreen or choosing Back to image restores target playback', async () => {
  for (const exit of ['standard', 'ios', 'back']) {
    const app = createApp()
    await app.start()
    app.video.currentTime = 8
    await app.elements.fullscreenToggle.emit('click')
    if (exit === 'standard') await app.document.emit('fullscreenchange')
    if (exit === 'ios') await app.video.emit('webkitendfullscreen')
    if (exit === 'back') await app.elements.videoBackToTarget.emit('click')
    assert.equal(app.elements.videoPlayer.hidden, true)
    assert.equal(app.elements.videoBackToTarget.hidden, true)
    assert.equal(app.video.controls, false)
    assert.equal(app.plane().attributes.get('visible'), true)
    assert.equal(app.video.currentTime, 8)
    assert.equal(app.video.playCalls, 1)
    assert.equal(app.events.includes('imageidentificationresume'), false)
  }
})

test('target loss keeps the original grace period and reacquisition preserves playback', async () => {
  const app = createApp()
  await app.start()
  await app.scene.emit('xrimagelost', {name: 'gift'})
  await app.scene.emit('xrimagefound', {name: 'gift'})
  app.runLostTimers()
  assert.equal(app.video.playCalls, 1)
  assert.equal(app.video.paused, false)
  await app.scene.emit('xrimagelost', {name: 'gift'})
  app.runLostTimers()
  assert.equal(app.video.paused, true)
  assert.equal(app.events.includes('imageidentificationresume'), true)
  assert.equal(app.elements.videoPlayer.hidden, true)
})

test('failed target downloads resume scanning without opening webpage playback', async () => {
  const app = createApp({loadFailure: true})
  await app.identify()
  assert.equal(app.video.playCalls, 0)
  assert.equal(app.elements.videoPlayer.hidden, true)
  assert.equal(app.events.includes('imageidentificationresume'), true)
})

test('fullscreen rejection or unavailable API keeps inline playback working with feedback', async () => {
  for (const fullscreen of ['rejected', 'none']) {
    const app = createApp({fullscreen})
    await app.start()
    await app.elements.fullscreenToggle.emit('click')
    assert.equal(app.elements.videoMessage.hidden, false)
    assert.equal(app.elements.videoPlayer.hidden, false)
    assert.equal(app.video.paused, false)
  }
})

test('scanning stays paused while playing, buffering, paused or entering fullscreen', async () => {
  const app = createApp()
  await app.start()
  const pauses = () => app.events.filter(name => name === 'imageidentificationpause').length
  assert.equal(pauses(), 2)
  await app.video.emit('waiting')
  await app.video.emit('pause')
  await app.elements.fullscreenToggle.emit('click')
  await app.video.emit('playing')
  assert.equal(pauses(), 4)
  assert.equal(app.events.includes('imageidentificationresume'), false)
  assert.equal(app.elements.scanOverlay.classList.contains('is-hidden'), true)
})

test('autoplay retries muted and offers native play when both attempts are blocked', async () => {
  const blocked = () => { const error = new Error('Autoplay blocked'); error.name = 'NotAllowedError'; throw error }
  const mutedApp = createApp({play: video => { if (!video.muted) blocked() }})
  await mutedApp.start()
  assert.equal(mutedApp.video.playCalls, 2)
  assert.equal(mutedApp.video.muted, true)
  assert.equal(mutedApp.elements.fullscreenToggle.hidden, false)

  const blockedApp = createApp({play: blocked})
  await blockedApp.start()
  assert.equal(blockedApp.elements.videoPlayer.hidden, true)
  assert.equal(blockedApp.elements.videoPlay.hidden, false)
  assert.equal(blockedApp.elements.videoMessage.hidden, false)
  assert.match(blockedApp.elements.videoMessageText.textContent, /Tap Play/)
  assert.equal(blockedApp.elements.fullscreenToggle.hidden, true)
  assert.equal(blockedApp.elements.videoLoader.classList.contains('is-visible'), false)
})

test('native volume changes sync the mute button and ending resumes a fresh scan', async () => {
  const app = createApp()
  await app.start()
  app.video.muted = true
  await app.video.emit('volumechange')
  assert.equal(app.elements.soundToggle.attributes.get('aria-label'), 'Unmute video')
  await app.video.emit('pause')
  assert.equal(app.elements.videoPlayer.hidden, true)
  await app.video.emit('ended')
  assert.equal(app.elements.videoPlayer.hidden, true)
  assert.equal(app.elements.fullscreenToggle.hidden, true)
  assert.equal(app.elements.soundToggle.hidden, true)
  assert.equal(app.body.classList.contains('is-playing-video'), false)
  assert.ok(app.events.includes('imageidentificationresume'))
  await app.start()
  assert.equal(app.video.playCalls, 2)
})

test('video load errors allow rescanning and stale playback failures cannot change the scanner', async () => {
  let rejectPlay
  const app = createApp({play: () => new Promise((resolve, reject) => { rejectPlay = reject })})
  await app.identify()
  const pending = app.scene.emit('xrimagefound', {name: 'gift'})
  await app.video.emit('error')
  assert.equal(app.elements.videoScanAgain.hidden, false)
  await app.elements.videoScanAgain.emit('click')
  rejectPlay(new Error('Aborted'))
  await pending
  assert.equal(app.elements.videoMessage.hidden, true)
  assert.equal(app.elements.videoPlayer.hidden, true)
})

test('confetti follows the active tracked target through loss, fullscreen, and rescan', async () => {
  const app = createApp()
  await app.identify()
  const confetti = () => app.plane().attributes.get('magic-target-confetti')
  assert.equal(confetti().enabled, false)
  await app.scene.emit('xrimagefound', {name: 'gift'})
  assert.equal(confetti().enabled, true)
  assert.equal(confetti().video, '#magic-video')
  assert.equal(confetti().width, app.plane().attributes.get('magic-target-video-cover').width)
  await app.scene.emit('xrimagelost', {name: 'gift'})
  assert.equal(confetti().enabled, false)
  await app.scene.emit('xrimagefound', {name: 'gift'})
  assert.equal(confetti().enabled, true)
  await app.elements.fullscreenToggle.emit('click')
  assert.equal(confetti().enabled, false)
  await app.elements.videoBackToTarget.emit('click')
  assert.equal(confetti().enabled, true)
  await app.video.emit('ended')
  assert.equal(app.plane(), null)
})

test('birthday banner is a separate target child above the video and clears with the target', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'videos/gift.mp4', birthdayText: 'Happy Birthday!\nMia'}])
  const target = app.elements['magic-image-target']
  const birthday = target.querySelector('.magic-birthday-banner')
  assert.ok(birthday)
  assert.equal(birthday.parent, target)
  assert.equal(birthday.attributes.get('magic-birthday-banner').text, 'Happy Birthday!\nMia')
  assert.equal(birthday.attributes.get('magic-birthday-banner').targetName, 'gift')
  const video = app.plane().attributes.get('magic-target-video-cover')
  const position = app.plane().attributes.get('position')
  assert.ok(birthday.attributes.get('position').y >= position.y + video.height / 2)
  await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
  assert.ok(birthday.object3D.position.y >= app.plane().object3D.position.y +
    app.plane().attributes.get('magic-target-video-cover').height / 2)
  await app.elements.fullscreenToggle.emit('click')
  assert.equal(app.video.paused, false)
  assert.equal(app.video.playCalls, 1)
  await app.video.emit('ended')
  assert.equal(target.querySelector('.magic-birthday-banner'), null)
})

test('enableBanner is checked before looking up or loading any banner design', async () => {
  for (const enableBanner of [false, 0, 'false', '0']) {
    const app = createApp({resolveBannerAnimation() {
      assert.fail('Disabled banners must not reach the animation registry')
    }})
    await app.start([{targetName: 'gift', videoUrl: 'gift.mp4',
      enableBanner, bannerType: 0, bannerDesignType: 0}])
    assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
    assert.equal(app.video.paused, false)
    await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
    await app.scene.emit('xrimagelost', {name: 'gift'})
    await app.scene.emit('xrimagefound', {name: 'gift'})
    await app.elements.fullscreenToggle.emit('click')
    await app.elements.videoBackToTarget.emit('click')
    assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
  }

  let lookups = 0
  let loads = 0
  const app = createApp({resolveBannerAnimation(...args) {
    lookups++
    const definition = getBannerAnimation(...args)
    return {...definition, load() { loads++; return definition.load() }}
  }})
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4',
    enableBanner: true, bannerType: 0, bannerDesignType: 0}])
  assert.equal(lookups, 1)
  assert.equal(loads, 1)
  assert.ok(app.elements['magic-image-target'].querySelector('.magic-birthday-banner'))
})

test('backend flags independently control decorations through resizing, tracking, and fullscreen', async () => {
  for (const enableConfetti of [false, true]) {
    for (const enableBanner of [false, true]) {
      const app = createApp()
      await app.start([{targetName: 'gift', videoUrl: 'gift.mp4',
        enableConfetti, enableBanner, bannerMessage: 'Happy Birthday!\nAarav', bannerType: 0}])
      const target = app.elements['magic-image-target']
      const checkEffects = () => {
        assert.equal(app.plane().attributes.has('magic-target-confetti'), enableConfetti)
        assert.equal(Boolean(target.querySelector('.magic-birthday-banner')), enableBanner)
      }
      checkEffects()
      if (enableBanner) {
        const banner = target.querySelector('.magic-birthday-banner').attributes.get('magic-birthday-banner')
        assert.equal(banner.text, 'Happy Birthday!\nAarav')
        assert.equal(banner.bannerType, '0')
        assert.equal(banner.bannerDesignType, 0)
      }
      await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
      checkEffects()
      await app.scene.emit('xrimagelost', {name: 'gift'})
      await app.scene.emit('xrimagefound', {name: 'gift'})
      checkEffects()
      if (enableConfetti) assert.equal(app.plane().attributes.get('magic-target-confetti').enabled, true)
      await app.elements.fullscreenToggle.emit('click')
      await app.elements.videoBackToTarget.emit('click')
      checkEffects()
      assert.equal(app.video.paused, false)
      assert.equal(app.video.playCalls, 1)
      await app.video.emit('ended')
      assert.equal(target.querySelector('.magic-birthday-banner'), null)
    }
  }
})

test('unmapped or invalid category/design pairs keep video playing without a banner', async () => {
  const pairs = [
    ...[1, 2, 3, 4, 5, 6, '1', '6', -1, 7, 'invalid'].map(bannerType => [bannerType, 0]),
    ...[5, '5', 12, -1, 0.5, 'invalid', '', true].map(bannerDesignType => [0, bannerDesignType]),
  ]
  for (const [bannerType, bannerDesignType] of pairs) {
    const app = createApp()
    await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: true,
      enableConfetti: false, bannerType, bannerDesignType}])
    assert.equal(app.elements['magic-image-target'].querySelector('.magic-birthday-banner'), null)
    await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
    assert.equal(app.video.paused, false)
    assert.equal(app.plane().attributes.get('visible'), true)
    assert.equal(app.plane().attributes.has('magic-target-confetti'), false)
  }
})

test('response selection defaults and entry design overrides decide each targets banner', async () => {
  const app = createApp()
  await app.window.emit('imageidentified', {
    bannerType: 0, bannerDesignType: 5,
    videoUrlV1: [
      {targetName: 'gift', videoUrl: 'one.mp4'},
      {targetName: 'second', videoUrl: 'two.mp4', bannerDesignType: '0'},
    ],
  })
  assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
  const second = app.scene.children.find(child => child.id === 'magic-image-target-1')
  const banner = second.querySelector('.magic-banner-animation')
  assert.ok(banner)
  assert.equal(banner.attributes.get('magic-birthday-banner').bannerDesignType, 0)
  await app.scene.emit('xrimagefound', {name: 'second'})
  assert.equal(app.video.src.endsWith('/two.mp4'), true)
  await app.video.emit('ended')
  assert.equal(second.parent.children.includes(second), false)
})

test('different matched targets keep their own effects when switching videos', async () => {
  const app = createApp()
  await app.start([
    {targetName: 'gift', videoUrl: 'one.mp4', enableConfetti: true, enableBanner: false},
    {targetName: 'second', videoUrl: 'two.mp4', enableConfetti: false, enableBanner: true, bannerMessage: 'Second gift', bannerType: 0},
  ])
  const second = app.scene.children.find(child => child.id === 'magic-image-target-1')
  assert.equal(app.elements['magic-image-target'].querySelector('.magic-birthday-banner'), null)
  assert.equal(second.querySelector('.magic-birthday-banner').attributes.get('magic-birthday-banner').text, 'Second gift')
  await app.scene.emit('xrimagefound', {name: 'second'})
  assert.equal(second.querySelector('.magic-video-plane').attributes.has('magic-target-confetti'), false)
  assert.equal(app.plane().attributes.get('magic-target-confetti').enabled, false)
  assert.equal(app.video.src.endsWith('/two.mp4'), true)
  assert.equal(app.video.playCalls, 2)
})

test('gift design stays below the image, resizes, and preserves independent video and confetti controls', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: true,
    enableConfetti: false, bannerType: 0, bannerDesignType: 1,
    bannerMessage: 'Happy Birthday Priya', bannerOptions: {duration: 7, size: 0.9, particleCount: 40,
      width: 99, assetBase: 'https://untrusted.example/', targetName: 'wrong'}}])
  const target = app.elements['magic-image-target']
  const gift = target.querySelector('.magic-gift-box')
  assert.ok(gift)
  assert.equal(target.querySelector('.magic-birthday-banner'), null)
  const options = gift.attributes.get('magic-gift-box')
  assert.equal(options.text, 'Happy Birthday Priya')
  assert.equal(options.targetName, 'gift')
  assert.equal(options.duration, 7)
  assert.equal(options.size, 0.9)
  assert.equal(options.particleCount, 40)
  assert.equal(options.width, 1.04)
  assert.equal(options.assetBase, undefined)
  const video = app.plane().attributes.get('magic-target-video-cover')
  assert.ok(gift.attributes.get('position').y <= -video.height / 2)
  await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
  assert.equal(gift.attributes.get('magic-gift-box').width, 2.08)
  assert.ok(gift.object3D.position.y <= -app.plane().attributes.get('magic-target-video-cover').height / 2)
  await app.elements.fullscreenToggle.emit('click')
  await app.elements.videoBackToTarget.emit('click')
  assert.equal(app.video.paused, false)
  assert.equal(app.video.playCalls, 1)
  assert.equal(app.plane().attributes.has('magic-target-confetti'), false)
  await app.video.emit('ended')
  assert.equal(target.querySelector('.magic-gift-box'), null)
})

test('disabled banners do not resolve the gift design or create its entity', async () => {
  const app = createApp({resolveBannerAnimation() { assert.fail('Banner master switch must win') }})
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: false,
    enableConfetti: true, bannerType: 0, bannerDesignType: 1}])
  assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
  assert.equal(app.plane().attributes.get('magic-target-confetti').enabled, true)
  assert.equal(app.video.paused, false)
})

test('balloon names receive picture bounds and resize without changing video or other designs', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: true,
    enableConfetti: false, bannerType: 0, bannerDesignType: 2, bannerMessage: 'HAPPY BIRTHDAY',
    bannerOptions: {name: 'PRIYA', showCenterBouquet: false, pictureHeight: 100, width: 99}}])
  const target = app.elements['magic-image-target']
  const balloon = target.querySelector('.magic-balloon-name')
  assert.ok(balloon)
  assert.equal(target.querySelector('.magic-birthday-banner'), null)
  assert.equal(target.querySelector('.magic-gift-box'), null)
  const options = balloon.attributes.get('magic-balloon-name')
  assert.equal(options.name, 'PRIYA')
  assert.equal(options.text, 'HAPPY BIRTHDAY')
  assert.equal(options.width, 1.04)
  assert.equal(options.pictureHeight, 1.04)
  assert.ok(balloon.attributes.get('position').y >= 0.52)
  await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
  const resized = balloon.attributes.get('magic-balloon-name')
  assert.equal(resized.name, 'PRIYA')
  assert.equal(resized.width, 2.08)
  assert.equal(resized.pictureHeight, 2.08)
  assert.ok(balloon.object3D.position.y >= 1.04)
  await app.elements.fullscreenToggle.emit('click')
  await app.elements.videoBackToTarget.emit('click')
  assert.equal(app.video.paused, false)
  assert.equal(app.video.playCalls, 1)
  await app.video.emit('ended')
  assert.equal(target.querySelector('.magic-balloon-name'), null)
})

test('disabled banners skip the balloon registry and leave confetti independent', async () => {
  const app = createApp({resolveBannerAnimation() { assert.fail('Disabled balloons must not be resolved') }})
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: false,
    enableConfetti: true, bannerType: 0, bannerDesignType: 2, bannerOptions: {name: 'PRIYA'}}])
  assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
  assert.equal(app.plane().attributes.get('magic-target-confetti').enabled, true)
  assert.equal(app.video.paused, false)
})

test('fairy bounds resize while video controls and all other designs keep their behavior', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: true,
    enableConfetti: false, bannerType: 0, bannerDesignType: 3, bannerMessage: 'Happy Birthday Priya',
    bannerOptions: {fairySize: 0.5, speed: 1.2, width: 99, pictureHeight: 99}}])
  const target = app.elements['magic-image-target']
  const fairy = target.querySelector('.magic-fairy-wand')
  assert.ok(fairy)
  for (const other of ['.magic-birthday-banner', '.magic-gift-box', '.magic-balloon-name']) assert.equal(target.querySelector(other), null)
  const options = fairy.attributes.get('magic-fairy-wand')
  assert.equal(options.text, 'Happy Birthday Priya')
  assert.equal(options.fairySize, 0.5)
  assert.equal(options.speed, 1.2)
  assert.equal(options.width, 1.04)
  assert.equal(options.pictureHeight, 1.04)
  await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
  assert.equal(fairy.attributes.get('magic-fairy-wand').width, 2.08)
  assert.equal(fairy.attributes.get('magic-fairy-wand').pictureHeight, 2.08)
  assert.equal(fairy.attributes.get('magic-fairy-wand').text, 'Happy Birthday Priya')
  await app.elements.fullscreenToggle.emit('click')
  await app.elements.videoBackToTarget.emit('click')
  assert.equal(app.video.paused, false)
  assert.equal(app.video.playCalls, 1)
  await app.video.emit('ended')
  assert.equal(target.querySelector('.magic-fairy-wand'), null)
})

test('interactive cake receives options below the picture and preserves video controls', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: true,
    enableConfetti: false, bannerType: 0, bannerDesignType: 4, bannerMessage: 'Happy Birthday Priya',
    bannerOptions: {candleCount: 7, name: 'Priya', speed: 1.2, width: 99}}])
  const target = app.elements['magic-image-target']
  const cake = target.querySelector('.magic-birthday-cake')
  assert.ok(cake)
  for (const other of ['.magic-birthday-banner', '.magic-gift-box', '.magic-balloon-name', '.magic-fairy-wand']) assert.equal(target.querySelector(other), null)
  assert.equal(cake.attributes.get('magic-birthday-cake').text, 'Happy Birthday Priya')
  assert.equal(cake.attributes.get('magic-birthday-cake').candleCount, 7)
  assert.equal(cake.attributes.get('magic-birthday-cake').width, 1.04)
  assert.ok(cake.attributes.get('position').y <= -0.52)
  await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
  assert.equal(cake.attributes.get('magic-birthday-cake').width, 2.08)
  assert.equal(cake.attributes.get('magic-birthday-cake').candleCount, 7)
  assert.ok(cake.object3D.position.y <= -1.04)
  await app.elements.fullscreenToggle.emit('click')
  await app.elements.videoBackToTarget.emit('click')
  assert.equal(app.video.paused, false)
  assert.equal(app.video.playCalls, 1)
  await app.video.emit('ended')
  assert.equal(target.querySelector('.magic-birthday-cake'), null)
})

test('ring proposal stays below the photo, resizes and leaves video playback independent', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: true,
    enableConfetti: false, bannerType: 1, bannerDesignType: 0,
    bannerOptions: {coupleNames: 'Aarav & Priya', duration: 8, width: 99, pictureHeight: 99}}])
  const target = app.elements['magic-image-target']
  const proposal = target.querySelector('.magic-ring-proposal')
  assert.ok(proposal)
  assert.equal(target.querySelectorAll('.magic-banner-animation').length, 1)
  const options = proposal.attributes.get('magic-ring-proposal')
  assert.equal(options.text, 'Will You Marry Me? ❤️')
  assert.equal(options.coupleNames, 'Aarav & Priya')
  assert.equal(options.width, 1.04)
  assert.equal(options.pictureHeight, 1.04)
  assert.ok(proposal.attributes.get('position').y <= -0.52)
  await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
  assert.equal(proposal.attributes.get('magic-ring-proposal').width, 2.08)
  assert.ok(proposal.object3D.position.y <= -1.04)
  await app.elements.fullscreenToggle.emit('click')
  await app.elements.videoBackToTarget.emit('click')
  assert.equal(app.video.paused, false)
  assert.equal(app.video.playCalls, 1)
  assert.equal(app.plane().attributes.has('magic-target-confetti'), false)
  await app.video.emit('ended')
  assert.equal(target.querySelector('.magic-ring-proposal'), null)
})

test('love letter uses its own tracked child and preserves video, confetti, options and resizing', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: true,
    enableConfetti: false, bannerType: 1, bannerDesignType: 1,
    bannerOptions: {senderName: 'Aarav', recipientName: 'Priya', entranceSide: 'right', width: 99}}])
  const target = app.elements['magic-image-target']
  const letter = target.querySelector('.magic-love-letter')
  assert.ok(letter)
  assert.equal(target.querySelectorAll('.magic-banner-animation').length, 1)
  assert.equal(target.querySelector('.magic-ring-proposal'), null)
  const options = letter.attributes.get('magic-love-letter')
  assert.ok(options.text.startsWith('My Love'))
  assert.equal(options.recipientName, 'Priya')
  assert.equal(options.senderName, 'Aarav')
  assert.equal(options.entranceSide, 'right')
  assert.equal(options.width, 1.04)
  assert.ok(letter.attributes.get('position').y >= 0.52)
  await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
  assert.equal(letter.attributes.get('magic-love-letter').width, 2.08)
  assert.ok(letter.object3D.position.y >= 1.04)
  await app.elements.fullscreenToggle.emit('click')
  await app.elements.videoBackToTarget.emit('click')
  assert.equal(app.video.paused, false)
  assert.equal(app.video.playCalls, 1)
  assert.equal(app.plane().attributes.has('magic-target-confetti'), false)
  await app.video.emit('ended')
  assert.equal(target.querySelector('.magic-love-letter'), null)
})

test('Cupid gates only its existing video surface, stays photo-centered and preserves video controls', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'love.mp4', enableBanner: true,
    enableConfetti: false, bannerType: 1, bannerDesignType: 2,
    bannerOptions: {cupidX: -0.9, arrowSpeed: 1.2, breakDuration: 1.5, width: 99}}])
  const target = app.elements['magic-image-target'], cupid = target.querySelector('.magic-cupid-reveal')
  assert.ok(cupid)
  assert.equal(target.querySelectorAll('.magic-banner-animation').length, 1)
  assert.equal(app.plane().attributes.get('magic-target-video-cover').revealOpacity, 0)
  assert.equal(cupid.attributes.get('position').x, 0)
  assert.equal(cupid.attributes.get('position').y, 0)
  const options = cupid.attributes.get('magic-cupid-reveal')
  assert.equal(options.text, 'You Stole My Heart ❤️')
  assert.equal(options.arrowSpeed, 1.2)
  assert.equal(options.breakDuration, 1.5)
  assert.equal(options.width, 1.04)
  assert.equal(options.boundsLeft, -0.52)
  await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
  assert.equal(cupid.attributes.get('magic-cupid-reveal').width, 2.08)
  assert.equal(cupid.attributes.get('magic-cupid-reveal').boundsRight, 1.04)
  await app.elements.fullscreenToggle.emit('click'); await app.elements.videoBackToTarget.emit('click')
  assert.equal(app.video.paused, false)
  assert.equal(app.video.playCalls, 1)
  assert.equal(app.plane().attributes.has('magic-target-confetti'), false)
  await app.video.emit('ended')
  assert.equal(target.querySelector('.magic-cupid-reveal'), null)
})

test('anniversary rings use the top target bounds and leave the video visible through resizing and fullscreen', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'anniversary.mp4', enableBanner: true, enableConfetti: false,
    bannerType: 2, bannerDesignType: 0, bannerOptions: {anniversaryNumber: 25, coupleNames: 'Eswaran ❤️ Priya',
      startDate: '09/12/2001', endDate: '09/12/2026', ringSize: 0.45, width: 99, pictureHeight: 99}}])
  const target = app.elements['magic-image-target'], rings = target.querySelector('.magic-golden-rings-anniversary')
  assert.ok(rings)
  assert.equal(target.querySelectorAll('.magic-banner-animation').length, 1)
  const options = rings.attributes.get('magic-golden-rings-anniversary')
  assert.equal(options.text, 'Happy Wedding Anniversary')
  assert.equal(options.anniversaryNumber, 25); assert.equal(options.coupleNames, 'Eswaran ❤️ Priya')
  assert.equal(options.startDate, '09/12/2001'); assert.equal(options.endDate, '09/12/2026')
  assert.equal(options.width, 1.04); assert.equal(options.pictureHeight, 1.04)
  assert.ok(rings.attributes.get('position').y >= 0.52)
  assert.equal(app.plane().attributes.get('magic-target-video-cover').revealOpacity, undefined)
  await app.scene.emit('xrimageupdated', {name: 'gift', scaledWidth: 2, scaledHeight: 2})
  assert.equal(rings.attributes.get('magic-golden-rings-anniversary').width, 2.08)
  assert.ok(rings.object3D.position.y >= 1.04)
  await app.elements.fullscreenToggle.emit('click'); await app.elements.videoBackToTarget.emit('click')
  assert.equal(app.video.paused, false); assert.equal(app.video.playCalls, 1)
  assert.equal(app.plane().attributes.has('magic-target-confetti'), false)
  await app.video.emit('ended'); assert.equal(target.querySelector('.magic-golden-rings-anniversary'), null)
})

test('disabled anniversary banners skip registry lookup and leave video and confetti independent', async () => {
  const app = createApp({resolveBannerAnimation() { assert.fail('Disabled anniversary must not resolve') }})
  await app.start([{targetName: 'gift', videoUrl: 'anniversary.mp4', enableBanner: false, enableConfetti: true, bannerType: 2, bannerDesignType: 0}])
  assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
  assert.equal(app.plane().attributes.get('magic-target-video-cover').revealOpacity, undefined)
  assert.equal(app.plane().attributes.get('magic-target-confetti').enabled, true)
  assert.equal(app.video.paused, false)
})

test('disabled Cupid does not hide the video through either master or design flags', async () => {
  const app = createApp()
  await app.start([{targetName: 'gift', videoUrl: 'love.mp4', bannerType: 1, bannerDesignType: 2,
    bannerOptions: {enabled: 'false'}}])
  assert.equal(app.plane().attributes.get('magic-target-video-cover').revealOpacity, 1)
  const off = createApp({resolveBannerAnimation() { assert.fail('Disabled Cupid must not resolve') }})
  await off.start([{targetName: 'gift', videoUrl: 'love.mp4', enableBanner: false, bannerType: 1, bannerDesignType: 2}])
  assert.equal(off.plane().attributes.get('magic-target-video-cover').revealOpacity, undefined)
  assert.equal(off.video.paused, false)
})

test('disabled letters skip registry lookup and keep confetti independent', async () => {
  const app = createApp({resolveBannerAnimation() { assert.fail('Disabled letters must not resolve') }})
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: false,
    enableConfetti: true, bannerType: 1, bannerDesignType: 1}])
  assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
  assert.equal(app.plane().attributes.get('magic-target-confetti').enabled, true)
  assert.equal(app.video.paused, false)
})

test('disabled ring proposals skip registry lookup and preserve independent confetti', async () => {
  const app = createApp({resolveBannerAnimation() { assert.fail('Disabled proposals must not resolve') }})
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: false,
    enableConfetti: true, bannerType: 1, bannerDesignType: 0}])
  assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
  assert.equal(app.plane().attributes.get('magic-target-confetti').enabled, true)
  assert.equal(app.video.paused, false)
})

test('enableBanner is checked before resolving interactive cake assets', async () => {
  const app = createApp({resolveBannerAnimation() { assert.fail('Disabled cakes must not resolve') }})
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: false,
    enableConfetti: true, bannerType: 0, bannerDesignType: 4}])
  assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
  assert.equal(app.plane().attributes.get('magic-target-confetti').enabled, true)
  assert.equal(app.video.paused, false)
})

test('enableBanner is checked before resolving the fairy or loading its artwork', async () => {
  const app = createApp({resolveBannerAnimation() { assert.fail('Disabled fairy must not resolve') }})
  await app.start([{targetName: 'gift', videoUrl: 'gift.mp4', enableBanner: false,
    enableConfetti: true, bannerType: 0, bannerDesignType: 3}])
  assert.equal(app.elements['magic-image-target'].querySelector('.magic-banner-animation'), null)
  assert.equal(app.plane().attributes.get('magic-target-confetti').enabled, true)
  assert.equal(app.video.paused, false)
})
