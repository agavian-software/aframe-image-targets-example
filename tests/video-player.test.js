const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const {getMagicEntries} = require('../src/magic-entries')

class Element {
  constructor(hidden = false) {
    this.hidden = hidden
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
  setAttribute(name, value) { this.attributes.set(name, value) }
  removeAttribute(name) { this.attributes.delete(name) }
  focus() {}
}

const createApp = ({play, fullscreen = 'standard'} = {}) => {
  const ids = ['magic-video', 'videoPlayer', 'customLoader', 'scanOverlay', 'scanStatusText',
    'videoLoader', 'videoLoaderText', 'identificationTimeout', 'identificationTryAgain',
    'identificationExit', 'soundToggle', 'fullscreenToggle', 'videoMessage', 'videoMessageText',
    'videoScanAgain']
  const elements = Object.fromEntries(ids.map(id => [id, new Element(
    ['videoPlayer', 'soundToggle', 'fullscreenToggle', 'videoMessage', 'videoScanAgain'].includes(id))]))
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
  video.load = () => {}
  const fullscreenCalls = []
  if (fullscreen === 'standard') video.requestFullscreen = async () => fullscreenCalls.push('standard')
  if (fullscreen === 'ios') video.webkitEnterFullscreen = () => fullscreenCalls.push('ios')
  if (fullscreen === 'rejected') video.requestFullscreen = async () => { throw new Error('Denied') }

  const window = new Element()
  const events = []
  window.location = {search: '', assign() {}}
  window.dispatchEvent = event => { events.push(event.type); window.emit(event.type) }
  window.setTimeout = () => {}
  const scene = new Element()
  const body = new Element()
  const document = {
    body,
    querySelector: selector => selector === 'a-scene' ? scene : elements[selector.slice(1)],
    addEventListener: (name, callback) => { if (name === 'DOMContentLoaded') callback() },
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/app'), 'utf8'), {
    window, document, navigator: {userAgent: 'Chrome', platform: 'Win32', maxTouchPoints: 0},
    URLSearchParams, Event, console: {error() {}},
    // Any unexpected fetch/AR/target dependency fails this camera-free harness.
    require: name => name === './magic-entries' ? {getMagicEntries} : {},
  })
  const identify = (entries = [{targetName: 'gift', videoUrl: 'videos/gift.mp4', shape: 9}]) =>
    window.emit('imageidentified', {videoUrlV1: entries})
  return {elements, video, window, scene, body, events, fullscreenCalls, identify}
}

test('identification plays a normal video immediately without target JSON, masks or tracking', async () => {
  const app = createApp()
  assert.equal(app.elements.fullscreenToggle.hidden, true)
  await app.identify()
  assert.equal(app.video.src, 'https://d1y2o0xoe5yirl.cloudfront.net/videos/gift.mp4')
  assert.equal(app.video.playCalls, 1)
  assert.equal(app.elements.videoPlayer.hidden, false)
  assert.equal(app.elements.fullscreenToggle.hidden, false)
  assert.equal(app.body.classList.contains('is-playing-video'), true)
  assert.ok(app.events.includes('imageidentificationpause'))
  await app.scene.emit('xrimagelost', {name: 'gift'})
  assert.equal(app.video.paused, false)
  await app.identify()
  assert.equal(app.video.playCalls, 1)
})

test('fullscreen button uses standard API and iPhone native fallback', async () => {
  for (const fullscreen of ['standard', 'ios']) {
    const app = createApp({fullscreen})
    await app.identify([{targetName: 'gift', videoUrl: 'https://media.example/gift.mp4'}])
    assert.equal(app.video.src, 'https://media.example/gift.mp4')
    await app.elements.fullscreenToggle.emit('click')
    assert.deepEqual(app.fullscreenCalls, [fullscreen])
    assert.equal(app.video.playCalls, 1)
  }
})

test('fullscreen rejection or unavailable API keeps inline playback working with feedback', async () => {
  for (const fullscreen of ['rejected', 'none']) {
    const app = createApp({fullscreen})
    await app.identify()
    await app.elements.fullscreenToggle.emit('click')
    assert.equal(app.elements.videoMessage.hidden, false)
    assert.equal(app.elements.videoPlayer.hidden, false)
    assert.equal(app.video.paused, false)
  }
})

test('autoplay retries muted and offers native play when both attempts are blocked', async () => {
  const blocked = () => { const error = new Error('Autoplay blocked'); error.name = 'NotAllowedError'; throw error }
  const mutedApp = createApp({play: video => { if (!video.muted) blocked() }})
  await mutedApp.identify()
  assert.equal(mutedApp.video.playCalls, 2)
  assert.equal(mutedApp.video.muted, true)
  assert.equal(mutedApp.elements.fullscreenToggle.hidden, false)

  const blockedApp = createApp({play: blocked})
  await blockedApp.identify()
  assert.equal(blockedApp.elements.videoPlayer.hidden, false)
  assert.equal(blockedApp.elements.videoMessage.hidden, false)
  assert.match(blockedApp.elements.videoMessageText.textContent, /Tap the play button/)
  assert.equal(blockedApp.elements.fullscreenToggle.hidden, true)
  assert.equal(blockedApp.elements.videoLoader.classList.contains('is-visible'), false)
})

test('native volume changes sync the mute button and ending resumes a fresh scan', async () => {
  const app = createApp()
  await app.identify()
  app.video.muted = true
  await app.video.emit('volumechange')
  assert.equal(app.elements.soundToggle.attributes.get('aria-label'), 'Unmute video')
  await app.video.emit('pause')
  assert.equal(app.elements.videoPlayer.hidden, false)
  await app.video.emit('ended')
  assert.equal(app.elements.videoPlayer.hidden, true)
  assert.equal(app.elements.fullscreenToggle.hidden, true)
  assert.equal(app.elements.soundToggle.hidden, true)
  assert.equal(app.body.classList.contains('is-playing-video'), false)
  assert.ok(app.events.includes('imageidentificationresume'))
  await app.identify()
  assert.equal(app.video.playCalls, 2)
})

test('video load errors allow rescanning and stale playback failures cannot change the scanner', async () => {
  let rejectPlay
  const app = createApp({play: () => new Promise((resolve, reject) => { rejectPlay = reject })})
  const pending = app.identify()
  await app.video.emit('error')
  assert.equal(app.elements.videoScanAgain.hidden, false)
  await app.elements.videoScanAgain.emit('click')
  rejectPlay(new Error('Aborted'))
  await pending
  assert.equal(app.elements.videoMessage.hidden, true)
  assert.equal(app.elements.videoPlayer.hidden, true)
})
