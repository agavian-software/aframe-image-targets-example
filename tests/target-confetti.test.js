const {test} = require('node:test')
const assert = require('node:assert/strict')
const {registerMagicTargetConfetti} = require('../src/target-confetti')

const createConfetti = (decorType = 0) => {
  class Vector2 {
    constructor(x, y) { this.set(x, y) }
    set(x, y) { this.x = x; this.y = y }
  }
  class Geometry {
    constructor() { this.attributes = {} }
    setIndex(indices) { this.index = indices }
    setAttribute(name, value) { this.attributes[name] = value }
    dispose() { this.disposed = true }
  }
  class Material {
    constructor(options) { Object.assign(this, options) }
    dispose() { this.disposed = true }
  }
  const AFRAME = {
    components: {},
    registerComponent(name, definition) { this.components[name] = definition },
    THREE: {
      Vector2, InstancedBufferGeometry: Geometry, ShaderMaterial: Material, DoubleSide: 2,
      BufferAttribute: class { constructor(array, itemSize) { Object.assign(this, {array, itemSize}) } },
      InstancedBufferAttribute: class { constructor(array, itemSize) { Object.assign(this, {array, itemSize}) } },
      Mesh: class { constructor(geometry, material) { Object.assign(this, {geometry, material}) } },
      Color: class { constructor() { this.r = 1; this.g = 0.5; this.b = 0.25 } },
    },
  }
  registerMagicTargetConfetti({AFRAME})
  const video = new EventTarget()
  Object.assign(video, {paused: true, ended: false, error: null, readyState: 4})
  const objects = new Map()
  const component = Object.assign({}, AFRAME.components['magic-target-confetti'], {
    data: {video, width: 0.8, height: 1.2, enabled: false, decorType},
    el: {setObject3D: (name, object) => objects.set(name, object), removeObject3D: name => objects.delete(name)},
  })
  component.init()
  component.update()
  const emit = event => video.dispatchEvent(new Event(event))
  const play = () => { video.paused = false; emit('playing') }
  return {component, video, emit, play, objects}
}

test('confetti runs only for enabled, playing target video and stops during buffering', () => {
  const {component, video, emit, play} = createConfetti()
  play()
  assert.equal(component.mesh.visible, false)
  component.data.enabled = true
  component.update()
  assert.equal(component.mesh.visible, true)
  component.tick(100, 16)
  assert.equal(component.material.uniforms.uTime.value, 0.016)

  for (const event of ['waiting', 'stalled', 'error', 'abort']) {
    emit(event)
    assert.equal(component.mesh.visible, false, event)
    component.tick(200, 16)
    assert.equal(component.material.uniforms.uTime.value, 0.016)
    play()
    assert.equal(component.mesh.visible, true)
  }
  video.paused = true
  emit('pause')
  assert.equal(component.mesh.visible, false)
  play()
  video.ended = true
  emit('ended')
  assert.equal(component.mesh.visible, false)
  video.ended = false
  video.readyState = 2
  component.tick(300, 16)
  assert.equal(component.mesh.visible, false)
  video.readyState = 4
  play()
  component.data.enabled = false
  component.update()
  assert.equal(component.mesh.visible, false)
})

test('target resizes reuse GPU buffers and render resolution controls particle size', () => {
  const {component, play, objects} = createConfetti()
  assert.equal(objects.get('confetti'), component.mesh)
  assert.equal(component.geometry.instanceCount, 184)
  assert.equal(component.geometry.attributes.aSeed.array.length, 184 * 4)
  // A shared subdivided strip has curved silhouettes without per-piece objects.
  assert.equal(component.geometry.attributes.position.array.length, 25 * 2 * 3)
  assert.equal(component.geometry.index.length, 24 * 6)
  const styles = component.geometry.attributes.aStyle.array
  let ribbons = 0
  let left = 0
  let right = 0
  for (let i = 0; i < styles.length; i += 4) {
    ribbons += styles[i]
    if (styles[i + 1] < 0) left++
    else right++
  }
  assert.equal(ribbons, 36)
  assert.equal(left, right)
  assert.equal(component.material.side, 2)
  const geometry = component.geometry
  const material = component.material
  component.data.width = 2
  component.data.height = 0.5
  component.data.enabled = true
  component.update()
  assert.equal(component.geometry, geometry)
  assert.equal(component.material, material)
  assert.equal(material.uniforms.uExtent.value.x, 2)
  assert.equal(material.uniforms.uExtent.value.y, 0.5)
  component.mesh.onBeforeRender({getDrawingBufferSize: size => size.set(1200, 2400), getPixelRatio: () => 3})
  assert.equal(material.uniforms.uViewportHeight.value, 2400)
  assert.equal(material.uniforms.uPixelRatio.value, 3)
  assert.equal(component.mesh.frustumCulled, false)
  assert.equal(material.depthWrite, false)
  play()
  component.tick(10000, 10000)
  assert.equal(material.uniforms.uTime.value, 0.05)
})

test('clearing a target disposes GPU resources and detaches media listeners', () => {
  const {component, video, play, objects} = createConfetti()
  component.data.enabled = true
  play()
  component.remove()
  assert.equal(objects.has('confetti'), false)
  assert.equal(component.geometry.disposed, true)
  assert.equal(component.material.disposed, true)
  let calls = 0
  component.syncVisibility = () => { calls++ }
  for (const event of ['playing', 'pause', 'ended', 'waiting', 'stalled', 'loadstart', 'emptied', 'error', 'abort']) {
    video.dispatchEvent(new Event(event))
  }
  assert.equal(calls, 0)
})

test('loading a new video restarts the blast but buffering preserves its progress', () => {
  const {component, emit, play} = createConfetti()
  component.data.enabled = true
  play()
  component.tick(100, 40)
  emit('waiting')
  play()
  assert.equal(component.material.uniforms.uTime.value, 0.04)
  for (const event of ['loadstart', 'emptied']) {
    emit(event)
    assert.equal(component.elapsed, 0)
    assert.equal(component.material.uniforms.uTime.value, 0)
    assert.equal(component.mesh.visible, false)
    play()
    component.tick(200, 20)
    assert.equal(component.material.uniforms.uTime.value, 0.02)
  }
})

test('heart bubbles pause, resume, resize, reset and release their resources with the video', () => {
  const {component, video, emit, play} = createConfetti(1)
  const geometry = component.geometry
  const material = component.material
  component.data.enabled = true
  play()
  component.tick(0, 40)
  assert.equal(component.mesh.visible, true)
  assert.equal(material.uniforms.uTime.value, 0.04)
  for (const event of ['waiting', 'stalled', 'pause', 'ended']) {
    video.paused = event === 'pause'
    video.ended = event === 'ended'
    emit(event)
    assert.equal(component.mesh.visible, false)
    component.tick(100, 50)
    assert.equal(material.uniforms.uTime.value, 0.04)
    video.ended = false
    play()
    assert.equal(component.mesh.visible, true)
  }
  component.data.width = 2
  component.data.height = 1
  component.update({...component.data})
  assert.equal(component.geometry, geometry)
  assert.equal(material.uniforms.uExtent.value.x, 2)
  emit('loadstart')
  assert.equal(material.uniforms.uTime.value, 0)
  assert.equal(component.mesh.visible, false)
  component.remove()
  assert.equal(geometry.disposed, true)
  assert.equal(material.disposed, true)
})

test('changing decoration replaces and disposes the old effect, while reserved IDs stay hidden', () => {
  const {component, play} = createConfetti()
  component.data.enabled = true
  play()
  for (const decorType of [1, 0, 2, -1, 99]) {
    const oldData = {...component.data}
    const {geometry, material} = component
    component.data.decorType = decorType
    component.update(oldData)
    assert.equal(geometry.disposed, true)
    assert.equal(material.disposed, true)
    assert.equal(component.elapsed, 0)
    assert.equal(component.mesh.visible, decorType === 0 || decorType === 1)
  }
})
