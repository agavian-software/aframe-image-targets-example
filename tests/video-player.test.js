const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const {getMagicEntries} = require('../src/magic-entries')
const videoMask = require('../src/video-mask')

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

const createApp = ({play, fullscreen = 'standard', loadFailure = false} = {}) => {
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
