// Reuse A-Frame's Three.js renderer: one GPU-animated point cloud per target.
const PARTICLE_COUNT = 240
const COLORS = ['#ff5478', '#ffd166', '#56e0cf', '#7aa7ff', '#bc83ff', '#ffffff']
const STOP_EVENTS = ['waiting', 'stalled', 'loadstart', 'emptied', 'error', 'abort']

const vertexShader = `
  attribute vec4 aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform vec2 uExtent;
  uniform float uViewportHeight;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vSpin;
  varying float vFlutter;
  varying float vAlpha;

  void main() {
    float unit = min(uExtent.x, uExtent.y);
    // Twin confetti cannons fire in short bursts, with a pause between volleys.
    float delay = aSeed.z * 0.28;
    float age = mod(max(0.0, uTime - delay), 4.6);
    float lifetime = 3.4 + aSeed.w * 0.6;
    float side = aSeed.x < 0.5 ? -1.0 : 1.0;
    float spread = fract(aSeed.x * 31.7);
    vec3 origin = vec3(side * uExtent.x * 0.48, -uExtent.y * 0.32, unit * 0.06);
    vec3 velocity = vec3(side * (0.10 + spread * 0.65),
      1.9 + aSeed.y * 1.3, (aSeed.z - 0.3) * 0.22);

    // Air drag slows the initial blast. Individual flakes then settle under
    // gravity, with small sideways flutter instead of a shared circular path.
    float drag = 1.1 + aSeed.z * 0.45;
    float travel = (1.0 - exp(-drag * age)) / drag;
    float flutter = smoothstep(0.0, 0.5, age);
    vec3 offset = velocity * travel;
    offset.x += sin(age * (3.0 + aSeed.y * 3.0) + aSeed.w * 30.0) * 0.07 * flutter;
    offset.z += sin(age * 2.3 + aSeed.x * 20.0) * 0.035 * flutter;
    vec4 viewPosition = modelViewMatrix * vec4(origin + offset * unit, 1.0);
    // Fall towards the bottom of the camera view even if the target is tilted.
    float targetScale = length(modelViewMatrix[1].xyz);
    viewPosition.y -= unit * targetScale * (1.7 / drag) * (age - travel);
    gl_Position = projectionMatrix * viewPosition;
    float size = unit * (0.065 + aSeed.w * 0.045);
    gl_PointSize = clamp(size * projectionMatrix[1][1] * uViewportHeight
      * targetScale * 0.5 / max(0.01, -viewPosition.z), 14.0 * uPixelRatio, 56.0 * uPixelRatio);
    vColor = aColor;
    vSpin = aSeed.x * 20.0 + age * (2.0 + aSeed.w * 5.0);
    vFlutter = 0.45 + 0.55 * abs(sin(age * (2.0 + aSeed.y * 3.0) + aSeed.z * 40.0));
    vAlpha = step(delay, uTime) * smoothstep(0.0, 0.07, age)
      * (1.0 - smoothstep(lifetime - 0.6, lifetime, age));
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying float vSpin;
  varying float vFlutter;
  varying float vAlpha;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float c = cos(vSpin);
    float s = sin(vSpin);
    point = mat2(c, -s, s, c) * point;
    // Rectangular paper flakes with soft edges and a tumbling silhouette.
    vec2 bounds = vec2(0.34 * vFlutter, 0.39);
    vec2 edge = smoothstep(bounds - vec2(0.025), bounds, abs(point));
    float alpha = (1.0 - max(edge.x, edge.y)) * vAlpha;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(vColor * (0.9 + 0.1 * vFlutter), alpha);
    #include <colorspace_fragment>
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
      this.onStopped = (event) => {
        this.buffering = true
        if (event.type === 'loadstart' || event.type === 'emptied') {
          this.elapsed = 0
          this.material.uniforms.uTime.value = 0
        }
        this.syncVisibility()
      }
      this.onPlaybackChange = () => this.syncVisibility()

      const seeds = new Float32Array(PARTICLE_COUNT * 4)
      const colors = new Float32Array(PARTICLE_COUNT * 3)
      const palette = COLORS.map(color => new THREE.Color(color))
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Split the flakes between the two cannons; vary speed, delay, and size.
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
          uPixelRatio: {value: 1},
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
        this.material.uniforms.uPixelRatio.value = renderer.getPixelRatio()
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
