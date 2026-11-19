// Reuse A-Frame's Three.js renderer: one GPU-animated point cloud per target.
const PARTICLE_COUNT = 180
const COLORS = ['#ff5478', '#ffd166', '#56e0cf', '#7aa7ff', '#bc83ff', '#ffffff']
const STOP_EVENTS = ['waiting', 'stalled', 'loadstart', 'emptied', 'error', 'abort']

const vertexShader = `
  attribute vec4 aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform vec2 uExtent;
  uniform float uViewportHeight;
  varying vec3 vColor;
  varying float vSpin;
  varying float vFlutter;

  void main() {
    float unit = min(uExtent.x, uExtent.y);
    float angle = aSeed.x * 6.2831853 - uTime * (0.28 + aSeed.y * 0.32);
    vec2 direction = vec2(cos(angle), sin(angle));
    // Intersect a ray with the target rectangle, then add a flowing outer band.
    // This keeps the center clear, including on very wide or tall targets.
    vec2 halfExtent = uExtent * 0.5;
    vec2 edge = halfExtent / max(abs(direction), vec2(0.0001));
    float margin = unit * (0.08 + aSeed.z * 0.24
      + 0.025 * sin(uTime * 1.8 + aSeed.x * 30.0));
    vec2 orbit = direction * (min(edge.x, edge.y) + margin);
    float depth = unit * (0.035 + 0.08 * (0.5 + 0.5 * sin(angle * 2.0 + aSeed.w * 20.0)));
    vec4 viewPosition = modelViewMatrix * vec4(orbit, depth, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float size = unit * (0.018 + aSeed.w * 0.014);
    gl_PointSize = clamp(size * projectionMatrix[1][1] * uViewportHeight
      * 0.5 / max(0.01, -viewPosition.z), 1.0, 48.0);
    vColor = aColor;
    vSpin = aSeed.x * 20.0 + uTime * (1.0 + aSeed.w * 3.0);
    vFlutter = 0.28 + 0.72 * abs(sin(uTime * (2.0 + aSeed.y * 3.0) + aSeed.z * 40.0));
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying float vSpin;
  varying float vFlutter;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float c = cos(vSpin);
    float s = sin(vSpin);
    point = mat2(c, -s, s, c) * point;
    // Rectangular paper flakes with soft edges and a tumbling silhouette.
    vec2 bounds = vec2(0.29 * vFlutter, 0.39);
    vec2 edge = smoothstep(bounds - vec2(0.045), bounds, abs(point));
    float alpha = (1.0 - max(edge.x, edge.y)) * 0.95;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(vColor * (0.8 + 0.2 * vFlutter), alpha);
  }
`

const registerMagicTargetConfetti = (window) => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-target-confetti']) return

  AFRAME.registerComponent('magic-target-confetti', {
    schema: {
      video: {type: 'selector'},
      width: {type: 'number', default: 1},
      height: {type: 'number', default: 1},
      enabled: {default: false},
    },

    init() {
      const THREE = AFRAME.THREE
      this.elapsed = 0
      this.buffering = false
      this.viewport = new THREE.Vector2()
      this.onPlaying = () => { this.buffering = false; this.syncVisibility() }
      this.onStopped = () => { this.buffering = true; this.syncVisibility() }
      this.onPlaybackChange = () => this.syncVisibility()

      const seeds = new Float32Array(PARTICLE_COUNT * 4)
      const colors = new Float32Array(PARTICLE_COUNT * 3)
      const palette = COLORS.map(color => new THREE.Color(color))
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Stratified phases keep confetti spread around the entire perimeter.
        seeds.set([(i + Math.random()) / PARTICLE_COUNT, Math.random(), Math.random(), Math.random()], i * 4)
        const color = palette[i % palette.length]
        colors.set([color.r, color.g, color.b], i * 3)
      }

      this.geometry = new THREE.BufferGeometry()
      this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3))
      this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
      this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: {value: 0},
          uExtent: {value: new THREE.Vector2(1, 1)},
          uViewportHeight: {value: 1},
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      })
      this.points = new THREE.Points(this.geometry, this.material)
      // Positions are calculated in the shader, outside the static geometry bounds.
      this.points.frustumCulled = false
      this.points.visible = false
      this.points.renderOrder = 10
      this.points.onBeforeRender = (renderer) => {
        renderer.getDrawingBufferSize(this.viewport)
        this.material.uniforms.uViewportHeight.value = this.viewport.y
      }
      this.el.setObject3D('confetti', this.points)
    },

    update(oldData = {}) {
      if (oldData.video !== this.data.video) {
        this.bindVideo(oldData.video, false)
        this.bindVideo(this.data.video, true)
        this.buffering = false
      }
      this.material.uniforms.uExtent.value.set(
        Math.max(0.001, this.data.width), Math.max(0.001, this.data.height))
      this.syncVisibility()
    },

    bindVideo(video, bind) {
      if (!video) return
      const method = bind ? 'addEventListener' : 'removeEventListener'
      video[method]('playing', this.onPlaying)
      video[method]('pause', this.onPlaybackChange)
      video[method]('ended', this.onPlaybackChange)
      STOP_EVENTS.forEach(event => video[method](event, this.onStopped))
    },

    syncVisibility() {
      const video = this.data.video
      this.points.visible = Boolean(this.data.enabled && video && !video.paused &&
        !video.ended && !video.error && video.readyState >= 3 && !this.buffering)
    },

    tick(time, delta) {
      this.syncVisibility()
      if (!this.points.visible) return
      // Cap long frames after a background tab or tracking interruption.
      this.elapsed += Math.min(Math.max(delta || 0, 0), 50) / 1000
      this.material.uniforms.uTime.value = this.elapsed
    },

    remove() {
      this.bindVideo(this.data.video, false)
      this.el.removeObject3D('confetti')
      this.geometry.dispose()
      this.material.dispose()
    },
  })
}

module.exports = {registerMagicTargetConfetti}
