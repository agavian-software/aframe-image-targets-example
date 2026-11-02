const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const {getVideoMaskConfig, getVideoSurfaceSize} = require('../src/video-mask')
const {getMagicEntries} = require('../src/magic-entries')

// Exercise the registered component, including metadata and dimension events,
// without requiring a camera or the remote XR runtime.
const createComponent = (config) => {
  const components = {}
  const vector = (x, y) => ({x, y, set(a, b) { this.x = a; this.y = b }})
  class Texture {
    constructor(image) {
      this.image = image
      this.repeat = vector(1, 1)
      this.offset = vector(0, 0)
    }
    dispose() { this.disposed = true }
  }
  class PlaneGeometry {
    constructor(width, height) { this.parameters = {width, height} }
    dispose() { this.disposed = true }
  }
  class Material {
    constructor(options) { Object.assign(this, options) }
    dispose() {}
  }
  class Mesh {
    constructor(geometry, material) { Object.assign(this, {geometry, material}) }
  }
  const listeners = new Map()
  const video = {
    videoWidth: 0, videoHeight: 0,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(callback)
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback) },
    emit(name) { listeners.get(name)?.forEach(callback => callback()) },
  }
  const window = {
    location: {search: ''},
    addEventListener() {},
    AFRAME: {
      components,
      registerComponent(name, definition) { components[name] = definition },
      THREE: {VideoTexture: Texture, CanvasTexture: Texture, PlaneGeometry,
        MeshBasicMaterial: Material, Mesh},
    },
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/app'), 'utf8'), {
    window, URLSearchParams, console,
    document: {
      addEventListener(name, callback) { if (name === 'DOMContentLoaded') callback() },
      querySelector() { return null },
    },
    require(name) {
      if (name === './video-mask') return {
        getVideoMaskConfig, getVideoSurfaceSize,
        prepareVideoMask: async () => ({width: 512, height: 512}),
      }
      if (name === './target-size') return require('../src/target-size')
      return {}
    },
  })
  const component = Object.assign({}, components['magic-target-video-cover'], {
    data: {video, width: 2, height: 1, ...config},
    el: {setObject3D() {}, removeObject3D() {}, emit() {}},
  })
  component.init()
  component.update()
  return {component, video, listeners}
}

test('portrait video covers backend custom square mask URLs without stretching the mask', async () => {
  const backendEntry = getMagicEntries({frameShape: 9, customShapeUrl: '/uploads/square.png',
    videoUrlV1: [{targetName: 'gift', videoUrl: 'portrait.mp4'}]})[0]
  for (const entry of [backendEntry, {shape: 9, customShapeUrl: '/uploads/square.png'},
    {shape: '9', customShapeUrl: '/uploads/square.png'}, {maskUrl: '/uploads/square.png'},
    {customShapeUrl: '/uploads/square.png'},
    {shape: {customShapeUrl: '/uploads/square.png'}},
    {frameShape: {customShapeUrl: '/uploads/square.png'}}]) {
    const config = getVideoMaskConfig(entry, url => `https://cdn.example${url}`)
    assert.equal(config.maskUrl, 'https://cdn.example/uploads/square.png')
    assert.equal(config.shape, '')
    const {component, video} = createComponent(config)
    await Promise.resolve()
    assert.deepEqual(component.mesh.geometry.parameters, {width: 1, height: 1})
    video.videoWidth = 1080
    video.videoHeight = 1920
    video.emit('loadedmetadata')
    assert.equal(component.videoTexture.repeat.x, 1)
    assert.equal(component.videoTexture.repeat.y, 9 / 16)
    assert.equal(component.videoTexture.offset.x, 0)
    assert.equal(component.videoTexture.offset.y, 7 / 32)
    assert.equal(component.material.opacity, 1)
    assert.equal(component.material.alphaMap, component.maskTexture)
    assert.equal(component.maskTexture.repeat.x, 1)
    assert.equal(component.maskTexture.repeat.y, 1)
    assert.equal(component.maskTexture.offset.x, 0)
    assert.equal(component.maskTexture.offset.y, 0)
    component.remove()
  }
})

test('changing decoded dimensions updates the crop and removal cleans up listeners', async () => {
  const {component, video, listeners} = createComponent(getVideoMaskConfig({maskUrl: 'square.png'}))
  await Promise.resolve()
  for (const [width, height, repeatX, repeatY] of [
    [1920, 1080, 9 / 16, 1], [1080, 1920, 1, 9 / 16], [1080, 1080, 1, 1],
  ]) {
    video.videoWidth = width
    video.videoHeight = height
    video.emit('resize')
    assert.equal(component.videoTexture.repeat.x, repeatX)
    assert.equal(component.videoTexture.repeat.y, repeatY)
    assert.equal(component.videoTexture.offset.x, (1 - repeatX) / 2)
    assert.equal(component.videoTexture.offset.y, (1 - repeatY) / 2)
  }
  component.remove()
  assert.equal(listeners.get('loadedmetadata').size, 0)
  assert.equal(listeners.get('resize').size, 0)
  assert.equal(component.maskTexture.disposed, true)
})

test('backend SquareMask portrait canvas is not squeezed into a square during playback', async () => {
  const config = getVideoMaskConfig({shape: {arShapeId: 9, shapeName: 'SquareMask',
    customShapeUrl: 'portrait-square-mask.webp'}})
  config.maskAspect = 945 / 1680
  const {component, video} = createComponent(config)
  await Promise.resolve()
  assert.deepEqual(component.mesh.geometry.parameters, {width: 9 / 16, height: 1})
  // The returned cropped_compressed video is actually 854x480 landscape.
  video.videoWidth = 854
  video.videoHeight = 480
  video.emit('loadedmetadata')
  const repeatX = (945 / 1680) / (854 / 480)
  assert.equal(component.videoTexture.repeat.x, repeatX)
  assert.equal(component.videoTexture.repeat.y, 1)
  assert.equal(component.videoTexture.offset.x, (1 - repeatX) / 2)
  assert.equal(component.maskTexture.repeat.x, 1)
  assert.equal(component.maskTexture.repeat.y, 1)
  const oldData = {...component.data}
  component.data.width = 1.5
  component.data.height = 1.5
  component.update(oldData)
  assert.equal(component.mesh.geometry.parameters.width / component.mesh.geometry.parameters.height, 9 / 16)
  assert.equal(component.videoTexture.repeat.x, repeatX)
  component.remove()
})
