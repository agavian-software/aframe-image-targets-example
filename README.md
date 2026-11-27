# A-Frame: Image Targets

The app scans a gift image, then plays its matched video on the tracked
image target. The viewer can switch to normal webpage video using the top-right
fullscreen button.

### Image-target playback and fullscreen

Once identification succeeds, the app loads each `videoUrlV1` entry's target and
mask. Video starts on the image when the tracker finds it, retaining the target's
shape, crop alignment, and sizing. The webpage player stays hidden.

Clicking the top-right fullscreen button switches the same video to a normal
webpage player and requests browser fullscreen (or iPhone native video fullscreen).
Playback position and sound are preserved. Webpage playback shows the full video
frame and continues if the image target leaves view. Exiting fullscreen or choosing
**Back to image** returns to target playback. If autoplay is blocked, playback
retries muted or offers a **Play** button.
Scanning stops as soon as a video is selected and stays paused during playback,
buffering, fullscreen, and manual video pauses. Pending customer-code lookups are cancelled
and stale scan results are ignored.
When the video finishes, scanning resumes. In image-target mode, losing the target
for more than 2.5 seconds also stops the video and resumes scanning. Video errors
offer a **Scan again** button.

![Preview of the experience showing a printed flyer with a 3D jellyfish and playable video aligned to the graphics](./src/assets/screenshot-flyer.jpg)

<details><summary>Try it out</summary>

https://8thwall.org/aframe-image-targets-example/

<img alt="QR Code for the preview link" src="https://8th.io/qr?v=2&url=https://8thwall.org/aframe-image-targets-example/" width=250 height=250 />

![Flyer design showing image targets](./src/assets/flyer.jpg)

</details>

## Usage

1. On this repository, click **Code** > **Download ZIP**. If you clone the repository instead, make sure you have Git LFS installed and run `git lfs pull`
2. Unzip the folder to the location you'd like to work in
3. `npm install`
4. `npm run serve`
5. To connect to a mobile device, follow [these instructions](https://8th.io/test-on-mobile)
6. Recommended: Track your files using [git](https://git-scm.com/about) to avoid losing progress

### Camera Focus

The camera requests continuous autofocus on startup and resume when the active lens
supports it. Tap the camera preview to request focus at that location. A white square
marks a requested point only when the browser reports accepting its coordinates;
it does not indicate that the image has finished focusing. Buttons and drag/pinch
gestures are excluded. Unsupported point controls fall back to autofocus, and
fixed-focus cameras keep their default behavior.

Chrome on iPhone uses WebKit, which does not currently expose `focusMode` or
`pointsOfInterest` controls. Native autofocus may still run, but JavaScript cannot
force a focus sweep or reproduce the Camera app's macro lens switching. If a tap
cannot request a focus point, the app displays guidance to move farther away;
this is a workaround for close-focus blur, not a software autofocus fix.

For device diagnosis, open the scanner URL with `?cameraDebug=1` (or append
`&cameraDebug=1` if it already has a query). A `focus-v2` panel shows the active
camera label, supported focus modes, reported mode, resolution, minimum focus
distance if exposed, and the last focus request result. This checks that the
updated bundle is deployed and distinguishes missing controls from rejected
requests. It cannot confirm optical focus. No diagnostic data is uploaded.

Support depends on the phone, lens, and browser. Test in Chrome on the actual phone:
move a detailed object nearer and farther, tap objects at different distances,
rotate the phone, and return after switching apps. Check that the sound/navigation
buttons still work. Very close objects may be inside the lens's minimum focus distance.

### Image Identification

The app crops the camera preview around the scan square and sends binary JPEG frames over
one WebSocket. The server sends `READY` to request a frame. Set the endpoint in
`src/index.html` or use the `imageWs` URL parameter.

```html
<meta name="image-identification-websocket" content="wss://example.com/ws/magic-scan">
```

A successful match emits `imageidentified` on `window`. The app loads the returned targets
and shape masks before activating image-target playback. Links with a `code` query
parameter look up the gift directly.

The scanner starts at 900 px. When two consecutive full-width frames take at least 120 ms
each to crop and encode, the scanner uses 720 px for the next three frames, then tries
900 px again. It keeps the full width if the server reports that a full-width frame
has started confirming a match. The default JPEG quality is 0.72 at both widths.

To compare two phones, open the same scanner page with `?scannerDebug=1`. Append
`&scannerDebug=1` if the URL already has query parameters. The **Scanner timing** panel
at the bottom of the screen shows the latest 20 events, newest first. Swipe inside the
panel to see older entries or tap its heading to collapse it. The same events are
available under `[image-identification] timing` in the browser console. Test with the
same target, lighting, and Wi-Fi.

- `frame-sent` shows the send gap, time since `READY`, quality check, crop and JPEG timings,
  queued socket bytes, JPEG dimensions and size, the largest XR update gap, and rejected
  frame counts since the previous send. `jpegEncoder` shows whether a worker or the browser
  canvas produced the JPEG. Worker frames also report snapshot and encode times separately.
- `ready` reports the elapsed time from send until the browser handles the next `READY`,
  plus the backend's processing time when supplied. `matched` reports elapsed scan time.
- Use `?scannerDebug=1&scanWidth=900` and `?scannerDebug=1&scanWidth=720` to compare fixed
  widths. Check both time to match and successful scans, especially on small or dim targets.
- To compare the encoders on one phone, use `?scannerDebug=1&scanWidth=900`, then repeat with
  `&scanEncoder=canvas` appended. Use the same printed target and compare `jpegMs` and time
  to `MATCHED`.

### Flying birthday banner

Each tracked image also has a separate Three.js birthday decoration. Two babies
and four shoulder-hinged wings carry a cream and gold banner above the picture.
The group rises from behind the top edge in 1.7 seconds, then floats gently while
the wings flap. Target-local clipping keeps the entrance clear of the video.
Tracking loss immediately hides and resets the decoration; reacquisition replays
the entrance. Video controls, playback, and tracking use their existing flow.

WebSocket `MATCHED` responses configure each `data.videoUrlV1[]` entry:

```json
{
  "targetName": "gift",
  "videoUrl": "videos/gift.mp4",
  "enableConfetti": true,
  "decorType": 0,
  "enableBanner": true,
  "bannerMessage": "Happy Birthday!\nAarav",
  "bannerType": 0,
  "bannerDesignType": 0
}
```

`enableConfetti` and `enableBanner` independently control their effects per target.
When `enableConfetti` is true, `decorType` selects the side decoration: `0` (the
default) uses the existing paper confetti and ribbons; `1` uses floating heart
bubbles. Hearts start small on both lower sides, grow as they rise, and pop into
small hearts and an expanding ring just above the picture. `2` is reserved and
currently shows no side decoration, as do unsupported or invalid IDs. Numeric
strings are accepted. Response-level defaults can be overridden per video entry.
Disabled effects are not created and stay disabled during resizing, tracking
reacquisition, and fullscreen transitions. Video playback continues normally.
`bannerType` identifies one of the seven categories from `0` to `6`.
`bannerDesignType` is a nonnegative integer selecting a design within the category
and defaults to `0`. Category `0` / design `0` selects this flying-baby banner;
category `0` / design `1` selects the tap-to-open magical gift box.
Category `0` / design `2` selects balloons carrying a personalized name.
Category `0` / design `3` selects the fairy with a magic wand.
Category `0` / design `4` selects the interactive birthday cake.
Category `1` / design `0` selects the magical ring proposal below the image.
Category `1` / design `1` selects the flying love letter above the image.
Category `1` / design `2` selects Cupid's heart break and video reveal.
Category `2` / design `0` selects golden rings joining for a wedding anniversary.
Category `2` / design `1` selects the interactive wedding ribbon and outer floral arch.
Category `2` / design `2` selects the traditional South Indian temple wedding arch.
Category `6` / design `1` selects the New Year 2027 Countdown.
Category `6` / design `2` selects Santa Flying with Reindeer.
Other pairs render no banner until their designs are implemented and
mapped; video and confetti continue normally. Invalid IDs also render no banner.
`bannerMessage` supplies the text, including line breaks; an empty string keeps
the banner blank.

For older responses, omitted flags default to enabled, and omitted category and
design IDs each default to `0`. The legacy `birthdayText` field is also accepted.
The message defaults to `Happy Birthday!` when neither message field is supplied. Entry settings override
response defaults. Boolean flags also accept `1`/`0` and `"true"`/`"false"`.
The transparent CanvasTexture wraps and scales the message to fit the banner.
At runtime, change the decoration entity's `magic-birthday-banner` `text` property
to update it without rebuilding textures or restarting the animation.

The animation's code and artwork live together:

```text
src/animations/
  banner-registry.js  # API category/design mapping
  birthday-banner/
    index.js       # Component, movement, text, and asset loading
    assets/        # Seven original transparent PNGs
  magical-gift-box/
    index.js       # A-Frame adapter and bottom-edge placement
    MagicalGiftBoxEffect.js # Reusable Three.js effect
    timeline.js    # Reveal stages and particle trajectories
    assets.js      # WebP filenames, shared loading, and disposal
    assets/        # Eight supplied WebP images
  balloon-name/
    index.js       # A-Frame adapter and picture bounds
    BalloonNameEffect.js # Reusable Three.js effect
    timeline.js    # Entrance, staggered name, reveal, and floating
    text.js        # Dynamic letter atlas and message CanvasTextures
    assets.js      # Selective WebP loading and shared texture leases
    assets/        # Eight supplied WebP images
  fairy-magic-wand/
    index.js       # A-Frame adapter and measured picture bounds
    FairyMagicWandEffect.js # Reusable Three.js effect
    timeline.js    # Flight, wand tip, magic circle, and particles
    text.js        # Dynamic ribbon CanvasTexture
    assets.js      # Selective shared WebP texture loading
    assets/        # Nine supplied WebP images
  shared/
    sprite-batch.js # Instanced sprites and video-area clipping
  interactive-birthday-cake/
    index.js       # A-Frame adapter and bottom-edge placement
    InteractiveBirthdayCakeEffect.js # Reusable Three.js effect and raycasting
    timeline.js    # Lighting, extinguishing state, smoke, celebration
    interaction.js # Single-pointer tap filtering and listener cleanup
    text.js        # Dynamic birthday message and tap hint
    assets.js      # Selective shared WebP texture loading
    assets/        # Eleven supplied WebP images
```

The PNGs retain their exact filenames and proportions. Webpack copies animation
asset folders to `dist/animations/<animation-name>/assets/`. The birthday component
requests its images only when an enabled, supported banner is created; copying
them into the deployment does not preload them in the browser.
Live targets share the PNG textures; geometry, materials, canvas textures, and
event listeners are released when their decoration is removed.

Add future designs in separate `src/animations/<animation-name>/` folders, each
with its own entry module and optional `assets/` folder. Each module owns its asset
list and behavior, so designs do not need the same number of images.

Register new designs in `src/animations/banner-registry.js`: the outer key is
`bannerType` and the inner key is `bannerDesignType`. Each mapping names the design
ID and A-Frame component, with a `load()` function returning `register(window)` and
`getPlacement(targetSize, targetProperties, videoLayout)`. Placements may also
return `componentOptions` for measured bounds needed by a design; these are
applied on creation and tracked geometry updates. Components receive
`targetName`, `width`, `text`, `bannerType`, and `bannerDesignType`, and handle their
own tracking and cleanup. Playback uses the mapping for creation and resizing, so
new designs do not require a category switch in the player. Entry-level API fields
override response defaults; numeric string IDs are accepted.

Only the selected, enabled design is registered and requests its artwork.
`enableBanner` is the master switch and is checked before any category/design
lookup or animation loading. When false, no banner is created, even for a mapped
pair such as `0` / `0`.
Animation JavaScript is currently bundled together; downloading code on demand
with dynamic imports can be added when multiple designs are available. Confetti
remains a separate procedural effect in `src/target-confetti.js` and needs no PNGs.

### Magical gift box (category 0 / design 1)

Set `enableBanner: true`, `bannerType: 0`, and `bannerDesignType: 1` in the matched
API entry. `enableBanner` remains the first check before design lookup or loading.
The existing flying-baby animation remains available as design `0`; confetti is
still independently controlled by `enableConfetti`.

```json
{
  "targetName": "gift",
  "videoUrl": "videos/gift.mp4",
  "enableBanner": true,
  "bannerType": 0,
  "bannerDesignType": 1,
  "bannerMessage": "Happy Birthday!",
  "bannerOptions": {
    "name": "Priya",
    "duration": 4.2,
    "size": 1,
    "offsetX": 0,
    "offsetY": 0.025,
    "sparkleColor": "#ffd36a",
    "heartColor": "#ff64a9",
    "textColor": "#79382f",
    "particleCount": 64,
    "maxTextureSize": 768
  }
}
```

The closed gift rises into the tracked image in about one second and waits.
Tapping the box or its “Tap to open” prompt pops the lid and reveals the name.
The banner moves above the full image and video surface, then the matched video
starts. Tracking loss resets the box so it can be opened again on reacquisition.

Set `bannerOptions.name` or `recipientName` for the reveal, or use
`bannerMessage` for a longer greeting. The name uses a CanvasTexture and can
be edited independently of the artwork. Set `bannerOptions.enabled` to
`false` to play the video on detection.

`duration` scales both animated portions (0.5–60 seconds). Waiting for a tap
adds time independently. `size` scales the gift within the picture bounds.
`offsetX` and `offsetY` adjust the landing point in picture-width units, with
positive Y moving down. The gift fits portrait and landscape targets, including
off-center tracking crops. The original WebP artwork uses shared textures capped
at 768 pixels per dimension by default. Opening sparkles use one instanced draw.

For standalone Three.js, pass `{THREE, document, parent}` with a tracked
`parent` at the picture center. Call `load()`, `start()` on detection,
`update(deltaSeconds)` per frame, and `reset()` on tracking loss.
`attachInteraction()` handles canvas taps, and `open()` starts the reveal after
the gift lands. Use `configure()` for live settings and `dispose()` on removal.
The optional `onVideoOpacity` and `onVideoReady` callbacks connect playback.
Artwork failures emit `giftboxerror` and release the video.

### Balloons carrying a name (category 0 / design 2)

```json
{
  "targetName": "gift",
  "videoUrl": "videos/gift.mp4",
  "enableBanner": true,
  "bannerType": 0,
  "bannerDesignType": 2,
  "bannerMessage": "HAPPY BIRTHDAY",
  "bannerOptions": {
    "name": "PRIYA",
    "duration": 6,
    "size": 1,
    "offsetX": 0,
    "offsetY": 0.025,
    "letterColor": "#fff8eb",
    "outlineColor": "#783a32",
    "messageColor": "#783a32",
    "sparkleColor": "#ffe099",
    "pinkTint": "#ffffff",
    "goldTint": "#ffffff",
    "showBouquets": true,
    "showLetters": true,
    "showBanner": true,
    "showCenterBouquet": false,
    "showCelebration": true,
    "particleCount": 48,
    "maxTextureSize": 768
  }
}
```

The default six-second sequence brings bouquets out from the left and right
edges (0-2s), releases alternating pink and gold letter balloons one by one
(2-4s), reveals the message plaque below them (4-5s), and celebrates with the
golden trail, balloon burst, and real-time sparkles (5-6s). Independent floating
and rotation continue afterward. `duration` scales the reveal and motion
(0.5-60 seconds). Each PNG's matching WebP is imported under its exact base name;
the original artwork proportions, including long ribbon tails, are preserved.

`bannerOptions.name` supplies the personalized name. The frontend creates one
dynamic letter per balloon using a single CanvasTexture atlas, with separate
instanced batches for pink balloons, gold balloons, and letters. Name layout is
centered and shrinks spacing/balloons for longer names, with a maximum of 32
Unicode graphemes (including spaces). Spaces leave gaps. Accented letters and
combined characters are kept together where `Intl.Segmenter` is supported. Very
long names become small to keep a single horizontal row. An empty name creates
no letter balloons and does not download their images. `bannerMessage` controls
the independently rendered plaque text; it is never baked into the source art.

`showCenterBouquet` is off by default; enabling it adds the optional pre-lettered
Happy Birthday bouquet above the name and loads its image only then. The other
visibility flags independently control side bouquets, letter balloons, plaque,
and celebration artwork/particles. Hidden features do not request their images.
Enabling a feature at runtime retains existing shared textures and loads only new
files. The default layout requests seven images, capped at 768 pixels per
dimension on upload with no mipmaps; `maxTextureSize` accepts 256-1024 at load.
Particles use one generated sparkle texture and one instanced draw, capped at 80
(48 by default); at most eight emit occasionally after the main celebration.

The effect is anchored at the top center of the combined picture/video bounds.
The side bouquets settle fully outside the sides, while name balloons and plaque
sit above the picture. Every sprite and particle clips against that full target
rectangle in tracked coordinates, including during entrance, rotation, resizing,
and configurable offsets. `size` scales the arrangement (0.15-3); `offsetX` moves
it horizontally and positive `offsetY` lifts it, in picture-width units. Tints
multiply the original pink/gold artwork; other colors control letters, outlines,
message, and sparkles. Leave space around the printed picture in the camera view
for the side bouquets and optional center bouquet.

The banner master switch is still checked before selecting/loading the effect.
Each target selects one banner design, so balloons do not instantiate the
flying-baby or gift-box effect on that target. Confetti and video retain their own
controls. Tracking loss hides and resets the animation; reacquisition replays it.

For standalone Three.js use, construct `BalloonNameEffect` with
`{THREE, document, parent, name, message, width, pictureHeight, ...options}`, where
`parent` follows the tracked transform at the top center of the picture bounds.
Call `load()`, `start()`, `update(deltaSeconds)`, `reset()` on target loss, and
`dispose()` on removal. `configure()` changes name, message, timing, colors,
position, scale, and enabled/visibility settings; call `load()` afterward to
reconcile any newly required optional images. `seek(seconds)` supports previews.
All geometry, materials, generated textures, shared artwork references, and
tracking listeners are released by the adapter on teardown, including pending
loads. Artwork errors emit `balloonnameerror` without stopping video playback.

### Fairy with a magic wand (category 0 / design 3)

```json
{
  "targetName": "gift",
  "videoUrl": "videos/gift.mp4",
  "enableBanner": true,
  "bannerType": 0,
  "bannerDesignType": 3,
  "bannerMessage": "Happy Birthday\nPriya",
  "bannerOptions": {
    "duration": 5,
    "speed": 1,
    "size": 1,
    "fairySize": 0.48,
    "offsetX": 0,
    "offsetY": 0,
    "sparkleColor": "#ffd778",
    "textColor": "#78402d",
    "fairyTint": "#ffffff",
    "ribbonTint": "#ffffff",
    "showFairy": true,
    "useHoverPose": true,
    "showCircle": true,
    "showParticles": true,
    "showTrail": true,
    "showBurst": true,
    "showStars": true,
    "showMessage": true,
    "showWandHighlight": false,
    "particleCount": 72,
    "maxTextureSize": 768
  }
}
```

The fairy appears at the center of the tracked photo and flies to its right side
(0–1.5s). She waves her wand as golden particles trace a circle (1.5–3s).
The video preloads while hidden and starts when the wand burst peaks at 3.12s
with the default timing. The personalized ribbon appears above the video (4–5s),
then the fairy floats with occasional wand glints. The generated ring fits both
portrait and landscape photos and clears all four corners.

Both complete poses already contain wings and a wand. A brief weighted crossfade
switches from the flying to hover pose; only one solid fairy is composited. Full
sprite rotation, scale, and bobbing simulate the wand wave and flight. The wand
tip is calculated from the mirrored artwork coordinates and follows that rotation.
This is 2.5D animation, with no independent arm or wing rig. The two standalone
wing images are preserved in `assets/` but not downloaded or rendered, avoiding
duplicated wings. True independent flapping needs a wingless body layer. The
optional `showWandHighlight` samples only the star head of the separate wand
texture; it does not add a second handle. It is disabled by default.

The default effect requests six WebP textures: the two complete poses, trail,
burst, stars, and ribbon. Visibility options exclude unused images; disabling
`useHoverPose` omits the alternate character. Shared leases retain existing
artwork when features change, and texture uploads are capped at 768 pixels per
dimension by default (configurable 256-1024), without mipmaps. Sprites sharing a
texture use one instanced draw. Real-time particles use one generated star/glow
texture and one instanced draw, capped at 96 (72 by default), with at most eight
idle glints. The circle uses a bounded 129-vertex line.

`duration` accepts 0.5-60 seconds; `speed` (0.1-3) multiplies the animation rate.
`size` scales the arrangement (0.15-3), while `fairySize` controls character width
within it (0.15-1). Offsets are in picture-width units: positive X moves right,
positive Y moves up. The ring continues to fit the measured picture even when
the other objects are repositioned or scaled. Colors control particles, text,
and artwork tints. The fairy can cross the printed photo during the entrance.
From the reveal onward, sprites, particles, and the ring clip against the
combined picture and video bounds so the playing video stays clear.

The existing `enableBanner` master switch runs before registry lookup or asset
loading. Designs 0, 1, and 2 remain available; one banner design is selected per
target, so the fairy does not also create babies, gifts, or balloon arrangements.
Set `bannerOptions.enabled` to `false` to play the video on detection. Tracking
loss resets the fairy and video. Reacquisition replays the reveal before the
video starts again.

For standalone Three.js use, construct `FairyMagicWandEffect` with
`{THREE, document, parent, width, pictureHeight, message, ...options}`. `parent`
should follow the tracked transform at the top center of the combined picture
bounds. Use `load()`, `start()`, `update(deltaSeconds)`, `reset()` on target loss,
and `dispose()` on teardown. `configure()` updates text, timing, colors, position,
scale, and enabled/visibility options. Call `load()` afterward to reconcile any
new images or procedural features. The optional `onVideoOpacity` and
`onVideoReady` callbacks connect playback. `seek(seconds)` supports previews. Geometry,
materials, generated textures, shared artwork leases, and adapter tracking
listeners are released on removal, including pending asset loads. Load failures
emit `fairymagicerror` on the decoration entity while video continues.

### Interactive birthday cake (category 0 / design 4)

```json
{
  "targetName": "gift",
  "videoUrl": "videos/gift.mp4",
  "enableBanner": true,
  "bannerType": 0,
  "bannerDesignType": 4,
  "bannerMessage": "Happy Birthday\nPriya",
  "bannerOptions": {
    "name": "Priya",
    "candleCount": 5,
    "duration": 5,
    "speed": 1,
    "size": 1,
    "offsetX": 0,
    "offsetY": 0.025,
    "textColor": "#783a32",
    "sparkleColor": "#ffd777",
    "cakeTint": "#ffffff",
    "showHint": true,
    "showMessage": true,
    "showCelebration": true,
    "showParticles": true,
    "particleCount": 64,
    "maxTextureSize": 768
  }
}
```

The cake emerges from behind the picture's bottom edge and moves down with smooth
scaling and a small bounce (0-1.5s). Independent candles light sequentially
(1.5-2.5s), then the effect waits for interaction with a **Tap to Blow Candles**
hint. Tap a candle to extinguish only that candle, fade its flame/glow, switch to
the off sprite, and release rising smoke. Tap the visible cake body to extinguish
every remaining candle. Tapping a candle that is already off consumes that hit
without triggering the cake underneath. No celebration starts until the last
candle is extinguished.

The celebration combines golden fireworks, colorful confetti, hearts, balloons,
the sparkle ring, and real-time particles. About 1.1 seconds after the final blow,
the personalized ribbon begins its scale-and-fade reveal above the cake. Temporary
celebration layers fade out, leaving the cake, extinguished candles, message,
gentle floating, and occasional sparkles. The waiting stage has no timeout;
`duration` (0.5-60) rescales the animation phases and `speed` (0.1-3) multiplies the
rate, including lighting, flame animation, smoke, and celebration. Changing timing
at runtime preserves the current phase.

`candleCount` defaults to five and accepts 1-12. Each candle has its own narrow
Three.js mesh hit target. Raycasting checks candles first, then the cake body;
the cake's alpha map rejects taps on transparent corners. There is no shader-only
sprite raycast: invisible ordinary mesh hit planes follow the rendered cake and
candle transforms. Only one primary pointer-up can trigger a candle. Drags over
10 CSS pixels, long holds, multitouch, canceled pointers, interface buttons,
webpage/fullscreen video playback, and untracked or disabled effects are ignored.
Synthetic click events do not duplicate a pointer tap. All tap listeners are
removed when the effect is disposed. Interaction starts after lighting completes.

The cake is anchored below both the full printed picture and enlarged video,
including off-center tracking crops. Every decoration fragment is clipped at the
picture's bottom edge, so custom positions and the entrance cannot cover the AR
video. `size` scales the arrangement (0.15-3); offsets use picture-width units,
with positive X moving right and positive Y moving down. Candle hit targets use
the same transforms and clipping boundary, including on tilted targets.

All eleven source WebP filenames are retained. Shared, reference-counted texture
leases load only the selected effect and skip celebration or message images when
their features are disabled. Texture upload dimensions are capped at 768 pixels
by default (configurable 256-1024), with no mipmaps. Lit/off candle images share the
same canvas dimensions. Because the lit image already includes a flame, only its
wax/neck portion is rendered; the separate flame texture supplies the animated
flame and glow, avoiding double flames. Candle copies share textures and instanced
draws. Real-time particles use one generated texture and one draw, capped at 96
(64 by default); at most eight glint in the final state.

`bannerMessage` supplies the ribbon text and preserves an explicit blank message.
When the message is the legacy default `Happy Birthday!`, `bannerOptions.name`
personalizes it as `Happy Birthday <name>`. Text wraps and scales on a CanvasTexture
without editing any artwork. The `enableBanner` master switch still runs before
design lookup or loading. Existing designs 0-3, video controls, tracking, and
independent confetti retain their existing behavior. Tracking loss hides the cake,
clears gestures, relights the state on replay, and resets the celebration.

For direct Three.js use, construct `InteractiveBirthdayCakeEffect` with
`{THREE, document, parent, width, message, name, candleCount, ...options}` where
`parent` is the tracked Object3D at the picture's bottom edge. Call `load()`,
`start()`, `update(deltaSeconds)`, and `reset()` on tracking loss. Attach taps with
`attachInteraction({element: renderer.domElement, getCamera: () => camera, allowed})`,
or call `handleTap(clientX, clientY, camera, canvasRect)` from an existing input
controller. `blowCandle(index)` and `blowAllCandles()` are also available after
lighting. `configure()` updates timing, position, count, colors, text, and enabled
state; call `load()` afterward if visibility or texture settings change. Changing
the candle count starts a new sequence. `seek(seconds)` supports previewing time
without automatically blowing candles.

Optional `onCandleBlown({index, remaining})` and `onCelebrate({candleCount})`
callbacks are available on the class. The adapter emits `cakecandleblown` and
`cakecelebration` on its decoration entity. Load errors emit `birthdaycakeerror`
without stopping video. `dispose()` releases hit geometry/materials, sprite batches,
generated textures, cached artwork leases, alpha data, and event listeners,
including pending loads. This implementation uses tap interaction; microphone
blowing is not enabled.

### Magical ring proposal (category 1, design 0)

Select the proposal in a matched API response or an individual `videoUrlV1` entry:

```json
{
  "enableBanner": true,
  "bannerType": 1,
  "bannerDesignType": 0,
  "bannerMessage": "Will You Marry Me? ❤️",
  "bannerOptions": {
    "coupleNames": "Aarav & Priya",
    "size": 1,
    "offsetX": 0,
    "offsetY": 0,
    "duration": 8,
    "speed": 1,
    "particleCount": 64,
    "petalCount": 32
  }
}
```

For this design, omitted text defaults to `Will You Marry Me? ❤️`. An explicit
empty `bannerMessage` stays empty; `coupleNames` is an independently optional
second line. Entry options override response options. `enableBanner` remains the
master switch before registry lookup or artwork loading; `bannerOptions.enabled`
also hides and resets the proposal. Video and existing confetti keep their own
controls, and only one banner design is instantiated per target.

The closed box emerges downward from the bottom edge with a gentle overshoot
(0–1.5s). The two complete box sprites crossfade with a small scale change to
suggest opening, then the separate ring rises (1.5–3s). Golden particles orbit
the ring and settle into a heart as the supplied heart artwork fades and expands
(3–4.5s). The message banner appears above the ring (4.5–6s), followed by the
supplied petal burst, two staggered fireworks, floating heart clusters and
individual petals with gravity, flutter and varied spin (6–8s, with a short
petal fade tail). The final open box, hovering ring, heart and banner remain;
heart clusters bob gently and at most ten golden glints twinkle. Ring rotation
stays in the image plane, with subtle uniform scaling instead of a 3D turn.

The composition anchors to the **bottom of the union of the full printed photo
and video surface**, including crop offsets, shapes and overscan. The banner,
ring and box stack entirely below that edge. A shader clips everything above the
bottom edge in the tracked anchor's coordinates, including during the entrance,
so the decoration cannot paint over the photo or video even on a tilted target.
`offsetY` accepts only downward movement (−3 to 0 picture widths); positive
values clamp to zero. `offsetX` accepts −3 to 3 picture widths. `size` scales the
entire composition (0.15–3); `boxSize` (0.15–0.9), `ringSize` (0.1–0.6), and
`bannerSize` (0.4–1.5) control individual widths relative to the scaled
composition. Layout recomputes spacing to preserve clearance. Image planes retain
their texture proportions. The individual procedural petals flutter separately.

`duration` (0.5–60 seconds) rescales all phases, and `speed` (0.1–3) multiplies
the rate. Changing these during playback preserves the current phase. Optional
flags `showMessage`, `showHeart`, `showPetals`, `showFireworks`, `showHearts` and
`showSparkles` default to true. `textColor` and `sparkleColor` customize colors.
The message and names wrap and shrink inside a separate CanvasTexture; text
changes reuse that texture without restarting the animation.

The reusable module lives in
`src/animations/magical-ring-proposal/MagicalRingProposalEffect.js`, with its
A-Frame adapter in `index.js` (`magic-ring-proposal`), pure timeline/layout in
`timeline.js`, text rendering in `text.js`, and texture leases in `assets.js`.
All eight supplied `.webp` files are bundled under this module's `assets/`
directory with their exact filenames and transparency. Disabled features skip
their artwork downloads. Leases share textures between instances, cap upload
dimensions at `maxTextureSize` (768 by default, 256–1024), and disable mipmaps.
Instanced planes batch each particle texture into one draw call: up to 96 golden
sparkles and 48 falling petals, with 64 and 32 by default. Petal particles use a
small generated texture alongside the supplied complete burst artwork.

For direct Three.js integration, create a parent at the tracked picture/video
bottom center, keeping it under the tracked target Object3D:

```js
const {MagicalRingProposalEffect} = require('./animations/magical-ring-proposal')
const effect = new MagicalRingProposalEffect({
  THREE, document, parent: bottomAnchor,
  width: pictureVideoBounds.width,
  message: 'Will You Marry Me? ❤️',
  coupleNames: 'Aarav & Priya',
})
await effect.load()
effect.start()                // matching target found (also safe before load resolves)
effect.update(deltaSeconds)  // each render frame
effect.reset()               // matching target lost; next start replays from zero
effect.configure({message: 'Forever starts here ❤️'})
effect.seek(6.5)             // optional timeline preview, in elapsed seconds
effect.dispose()             // when removing the effect
```

Call `load()` after `configure()` when changing feature flags, the asset base or
texture resolution. The A-Frame adapter handles this automatically, filters events
by target name, ignores duplicate found events, resets on loss and removes its
listeners and resources on teardown. `getProposalPlacement()` and
`getProposalOptions()` supply safe bounds and configurable API options through
the existing registry. Runtime tracking dimensions resize the effect through the
same path used by the other designs. Physical camera tracking and mobile visual
performance should still be checked on the deployment device.

### Flying love letter (category 1, design 1)

The `FlyingLoveLetterEffect` module renders directly in the existing tracked AR
scene. It uses the app's A-Frame Three.js instance, camera, renderer and image
target transform. Select it in a matched response or `videoUrlV1` entry:

```json
{
  "enableBanner": true,
  "bannerType": 1,
  "bannerDesignType": 1,
  "bannerMessage": "My Love ❤️\n\nEvery moment with you makes my life more beautiful.\n\nYou are my happiness, my favorite person and my forever.\n\nWill You Be Mine Forever? ❤️",
  "bannerOptions": {
    "recipientName": "Priya",
    "senderName": "Aarav",
    "entranceSide": "left",
    "size": 1,
    "offsetX": 0,
    "offsetY": 0,
    "duration": 9.5,
    "speed": 1,
    "allowRead": true,
    "particleCount": 48,
    "petalCount": 28
  }
}
```

The example message is the default when no message field is supplied for this
design. An explicit empty message remains blank. Recipient and sender names are
optional; when present, they add a salutation and sign-off. Entry options override
response defaults. `enableBanner` remains the master switch before registry
lookup or asset loading. `bannerOptions.enabled` independently hides and resets
the letter. This category/design pair selects a single effect, leaving existing
birthday designs, the ring proposal, video controls and confetti independent.

The closed envelope follows a curved path from `entranceSide` (`left` or `right`)
with a golden sparkle trail (0–2s). Two separate wing pivot groups attach behind
it and flap continuously with independent rotations. It settles above the photo
and crossfades to the open envelope (2–3.2s). The parchment rises and unfolds by
revealing progressively more of the texture (3.2–5.5s), preserving the aspect of
its visible artwork. The envelope back renders behind the letter; a second draw
of only the lower front renders over the letter during emergence. Text appears
line by line (5.5–8s), then the golden heart, supplied petal burst, individual
falling petals, heart clusters and staggered fireworks celebrate (8–9.5s).
The open envelope and letter then hover, with continued wing motion, occasional
petals and at most ten golden sparkle sprites.

The effect anchors at the **top of the combined printed-photo and video bounds**,
including off-center crops and video overscan. All artwork is clipped below that
edge in tracked coordinates, protecting the playing video throughout the flight,
including large sizes and tilted targets. `offsetX` accepts −3 to 3 picture widths;
`offsetY` accepts 0 to 3 widths upward, clamping negative values to zero. `size`
scales the composition (0.15–3). `envelopeSize` (0.25–1), `letterSize` (0.4–1.5)
and `wingSize` (0.15–0.8) control individual sprite widths. `duration` (0.5–60s)
rescales the complete sequence and `speed` (0.1–3) multiplies its rate. Timing
changes preserve the current phase; animation uses elapsed seconds, independent
of frame rate. Position/size changes follow tracking through the existing resize
path.

`bannerMessage` is wrapped on a transparent CanvasTexture using Georgia with an
emoji fallback. Names and `textColor` are configurable. The text fits inside the
painted parchment, clear of its transparent margins and floral corners. The AR
preview retains a fixed readable font size and up to 14 lines; long content ends
with an invitation to continue in the reading view. The texture is redrawn only
when another line appears or text settings change.

After the parchment opens, tap its center to open the **complete letter** in a
scrollable reading dialog with 20px text. This enlarged view uses plain text,
preserves the entire message, and leaves the live AR renderer running. Close it
with **Close** or Escape. The dialog restores focus, contains keyboard focus and
closes on tracking loss, disable, scene pause, fullscreen video or teardown.
`allowRead: false` disables enlargement and its tap hint. Raycasting uses the
existing AR camera and renderer canvas, with pointer handling that rejects drags,
multitouch, unrelated UI and inactive/fullscreen playback. Reading is available
from 5.5s in canonical sequence time; it does not pause or seek the video.

All twelve supplied WebPs live at
`src/animations/flying-love-letter/assets/` with their exact filenames and alpha.
`assets.js` shares reference-counted texture leases and limits GPU upload sizes
to `maxTextureSize` (768 by default, 256–1024), with no mipmaps. Optional flags
`showWings`, `showSeal`, `showHeart`, `showPetals`, `showFireworks`, `showHearts`
and `showSparkles` skip their respective artwork when disabled. Instanced batches
keep petals and sparkles to one draw per texture. `particleCount` accepts 0–72
(default 48), and `petalCount` accepts 0–48 (default 28); idle rendering uses at
most ten sparkles and four petals. The individual petal artwork supplies falling
particles with varied velocity, rotation, flutter and gravity.

For direct Three.js use, create a parent at the top center of the combined image
and video bounds under the tracked target Object3D:

```js
const {FlyingLoveLetterEffect} = require('./animations/flying-love-letter')
const effect = new FlyingLoveLetterEffect({
  THREE, document, parent: topAnchor, width: pictureVideoBounds.width,
  message: 'Forever yours ❤️', recipientName: 'Priya', senderName: 'Aarav',
})
await effect.load()
effect.attachInteraction({element: renderer.domElement, getCamera: () => camera})
effect.start()                // matching image target found; safe before load completes
effect.update(deltaSeconds)  // each AR frame
effect.reset()               // target lost; hide, close reader and reset for replay
effect.configure({message: 'A new personal message', speed: 1.2})
effect.seek(8.6)             // optional timeline preview, in elapsed seconds
effect.openReader()         // optional programmatic enlargement after reveal
effect.closeReader()
effect.dispose()            // remove GPU resources, pointer listeners and reading dialog
```

Call `load()` after changing feature flags, the asset base or texture resolution.
The `magic-love-letter` A-Frame component handles this automatically, filters
tracking events by target name, ignores duplicate found events and resets on
reacquisition. `getLoveLetterPlacement()` and `getLoveLetterOptions()` connect it
to the existing registry. Code, timeline, text and reader helpers live together
in `src/animations/flying-love-letter/`. Validate physical tracking and visual
performance on the intended mobile device before deployment.

### Cupid heart break and video reveal (category 1, design 2)

`CupidHeartRevealEffect` uses the existing tracked target, Three.js instance,
camera, renderer and video surface. Select the next romantic design in a matched
response or an individual `videoUrlV1` entry:

```json
{
  "enableBanner": true,
  "enableConfetti": false,
  "bannerType": 1,
  "bannerDesignType": 2,
  "bannerMessage": "You Stole My Heart ❤️",
  "bannerOptions": {
    "size": 1,
    "cupidSize": 0.52,
    "cupidX": -0.82,
    "cupidY": 0.48,
    "arrowSpeed": 1,
    "breakDuration": 1,
    "speed": 1,
    "showMessage": true
  }
}
```

With the default timing, Cupid enters along a curved path from the upper left
while a red heart appears at the full printed photo's center (0–2s). He aims
(2–3s), releases the separate arrow with its golden motion trail (3–3.5s), and
hits the heart's center. Impact flashes, shake and the cracked-heart pose follow
(3.5–4s). Splitting/shattering artwork transitions to two rotating, moving halves
and smaller fragments (4–5s). **The existing video stays at opacity zero until
the break starts at 4s, then smoothly fades to full visibility by 5s.** Heart
pieces and fragments disappear completely at reveal completion. Cupid celebrates
and flies away while petals, rings, glowing outlines, sparkles and the optional
banner surround the playing video (5–7s). The banner and subtle decorations stay.

This changes the visibility of the current video material. It does not create a
second video, pause playback, seek it, or alter sound, camera capture, fullscreen
controls or the scanner. Playback time and audio continue through the intro under
the app's existing playback rules. The plane's usual tracked visibility still
belongs to the playback controller. The new `revealOpacity` control in
`magic-target-video-cover` multiplies mask readiness, so asynchronous mask loads,
metadata changes and target resizing cannot reveal the video early or discard
its current fade progress. All other designs retain full opacity by default.

The registry marks this design with `revealsVideo: true` and initializes the gate
before creating the decoration, preventing an exposed frame while assets load.
`enableBanner: false` skips the design and its gate entirely. Setting
`bannerOptions.enabled: false` also leaves the video visible. Tracking loss hides
and resets the animation and closes the gate; reacquisition replays from zero.
Duplicate found events do not restart it. Disabling/removing the effect restores
the video's normal opacity. Artwork failures emit `cupidrevealerror` and restore
visibility rather than leaving playback hidden; a subsequent detection can retry.

The effect is centered on the full printed photo, including original-image crop
offsets. Cupid, the bow launch point, the arrow's **visible tip**, the heart and
fragments all use the same target-local coordinate system. Moving or tilting the
phone therefore preserves the arrow's hit at `(0, 0)`. The heart's halves travel
beyond the combined photo/video bounds with room for their rotated diagonals.
Celebration materials clip inside those bounds so the final video is unobstructed,
including shaped or oversized video surfaces. The four Cupid pose sprites already
include wings; no duplicate wings or independent wing rig are added. The release
pose crops the nocked heart tip while the separate projectile is in flight.

`size` (0.15–2.5) scales the principal artwork and banner. `heartSize` (0.35–1.5)
is relative to the picture's shorter dimension, keeping its center fixed.
`cupidSize` (0.2–1) is relative to picture width. `cupidX` and `cupidY` (−3 to 3)
position the settled Cupid in picture-width units; a position at the heart center
is moved safely aside. `arrowSpeed` (0.25–4) scales the 0.5s arrow flight, and
`breakDuration` (0.25–4s) controls separation and the matching video fade. Impact,
cracking and celebration shift with these settings; the gate always waits for
the actual break. `speed` (0.1–3) multiplies elapsed time for the complete sequence.
Changing speed preserves sequence time. Changing arrow speed or break duration
restarts the sequence so a new hit and reveal stay synchronized.

`bannerMessage` defaults to `You Stole My Heart ❤️`; an explicit blank remains
blank. Text wraps on a CanvasTexture over the supplied red banner below the
photo. `textColor` customizes its color and `showMessage: false` omits it. Optional
flags `showPetals`, `showRing`, `showHearts` and `showSparkles` skip those images.
Entry options override response defaults. One banner design is selected per
target, preserving the existing birthday, proposal and love-letter effects.
The separate `enableConfetti` setting remains independent.

All 22 supplied WebPs retain their exact filenames and transparency under
`src/animations/cupid-heart-reveal/assets/`. Shared texture leases cap GPU upload
dimensions at `maxTextureSize` (768 by default, 256–1024), disable mipmaps, and
release late loads after teardown. Instanced particles use one draw per texture:
`particleCount` 0–72 (default 40), `petalCount` 0–40 (default 20), and
`fragmentCount` 0–32 (default 20). Idle rendering reduces sparkles to ten and
petals to four. Effects advance from the existing A-Frame tick; no render loop,
renderer, AR camera or tracking session is created.

For direct Three.js use, put the parent at the photo center under the existing
tracked target. Supply combined photo/video bounds in that parent's coordinates:

```js
const {CupidHeartRevealEffect} = require('./animations/cupid-heart-reveal')
const effect = new CupidHeartRevealEffect({
  THREE, document, parent: pictureCenterAnchor,
  width: pictureWidth, pictureHeight,
  boundsLeft, boundsRight, boundsBottom, boundsTop,
  message: 'You Stole My Heart ❤️',
  onVideoOpacity: opacity => existingVideoCover.setRevealOpacity(opacity),
})
await effect.load()
effect.start()                // matching target found; also safe before load resolves
effect.update(deltaSeconds)  // existing AR render tick
effect.reset()               // matching target lost; hide and prepare replay
effect.configure({message: 'Always yours ❤️'})
effect.seek(4.5)             // optional timeline preview, in elapsed seconds
effect.dispose()             // release resources and restore normal video opacity
```

Initialize the video surface with `revealOpacity: 0` before making it visible.
`getCupidPlacement()` supplies the center and safe bounds; `getCupidOptions()`
filters API options. The `magic-cupid-reveal` component and registry perform all
of this automatically for the existing app. Call `load()` after changing feature
flags, the asset base or texture size in standalone integrations. Code, pure
timeline, texture leases and text helpers live together in
`src/animations/cupid-heart-reveal/`. Verify physical tracking and visual
performance on the deployment phone before release.

### Golden rings anniversary (category 2, design 0)

`GoldenRingsAnniversaryEffect` runs inside the existing live AR scene using the
tracked image target's transform and A-Frame's Three.js instance and tick. Select
it in a matched API response or an individual `videoUrlV1` entry:

```json
{
  "enableBanner": true,
  "enableConfetti": false,
  "bannerType": 2,
  "bannerDesignType": 0,
  "bannerOptions": {
    "anniversaryNumber": 25,
    "coupleNames": "Eswaran ❤️ Priya",
    "startDate": "09/12/2001",
    "endDate": "09/12/2026",
    "duration": 7.5,
    "speed": 1,
    "size": 1,
    "ringSize": 0.42,
    "bannerSize": 1.4,
    "offsetX": 0,
    "offsetY": 0
  }
}
```

The individual ring sprites emerge beside opposite picture edges and lift along
curved paths above the photo (0–1.8s). They approach with gentle planar rotation
(1.8–3.2s), then crossfade to the final interlocked sprite under the golden joining
burst. The heart outline grows behind them, accompanied by progressive golden
particles (3.2–4.5s). The personalized banner rises above the picture (4.5–6s),
followed by the supplied rose-petal swirls and heart orbit overlay, individual
falling petals, orbiting heart particles and sparkles (6–7.5s). The interlocked
rings, heart and banner then float with a subtle shimmer. All ring motion uses
2.5D sprites; there is no 3D ring model or full 3D spin.

The complete effect anchors to the **top center of the union of the full printed
photo and video bounds**, including off-center tracking crops, masks and overscan.
A shader clips the picture/video rectangle in tracked coordinates at every frame.
This keeps the side entrances visible without painting over the video, and
protects it when the phone tilts or the effect is resized/repositioned. Final
rings, heart and banner sit entirely above that edge. The existing camera,
renderer, image tracking and video playback remain on their current path. This
design does not use Cupid's reveal gate: the video stays visible and playing
throughout the sequence. Only one banner design is instantiated per target;
existing birthday and romantic designs and independent confetti controls remain
available.

When `bannerMessage` is omitted, the heading is `Happy Wedding Anniversary`.
`anniversaryNumber` adds the appropriate ordinal, such as `Happy 25th Wedding
Anniversary`, with correct `1st`, `2nd`, `3rd`, `11th`, `12th` and `13th` endings.
Its default is zero, which omits the number. `coupleNames` supplies the second
line, and `startDate` / `endDate` supply the date range. Dates are displayed
literally as provided, with no locale parsing, time-zone conversion or automatic
anniversary calculation. Either date can be supplied alone. An explicit empty
heading stays empty; names and dates remain independently optional.

Set `bannerMessage` to override the heading. Custom messages can use
`{anniversary}` (for example `25th`), `{years}` (`25`), `{coupleNames}` and `{dates}`
placeholders, for example `Celebrating {years} Wonderful Years Together`.
Text wraps and shrinks automatically on a CanvasTexture within the cream strip,
clear of the banner's floral borders. It supports up to six lines / 500 text
characters. `textColor` defaults to dark gold-brown (`#744326`). Runtime changes
to the message, names, number, dates or color reuse the text texture without
restarting the rings.

`size` scales the composition (0.15–3). `ringSize` controls the individual ring
width (0.15–0.9), with the final pair and heart sized proportionally.
`bannerSize` controls banner width (0.5–1.8, default 1.4). Dimensions are relative
to the effect's scaled picture width; texture proportions remain intact.
`offsetX` accepts −3 to 3 picture widths, while `offsetY` accepts 0 to 3 widths
upward, clamping negative values to zero. Layout recomputes its spacing to keep
the banner and joined rings above the image. `duration` (0.5–60s) rescales all
phases, and `speed` (0.1–3) multiplies the rate; changing either preserves the
current phase. Animation advances by elapsed seconds, independent of frame rate.

`enableBanner: false` skips registry lookup and asset loading. The additional
`bannerOptions.enabled` switch hides/resets this effect independently. Visibility
flags `showMessage`, `showBurst`, `showHeart`, `showPetals`, `showOrbit` and
`showSparkles` default to true and omit their artwork or generated particles when
disabled. Entry options override response options. Tracking loss hides and resets
the sequence; detection replays it, and duplicate found events do not restart it.
The app's existing target-geometry updates resize the animation as tracking
dimensions become available.

All eight optimized WebPs keep their exact filenames and alpha under
`src/animations/golden-rings-anniversary/assets/`. Reference-counted texture leases
share artwork between instances and release late loads on removal. GPU upload
dimensions are capped at `maxTextureSize` (768 by default, 256–1024), with linear
filtering and no mipmaps. Procedural sparkles, petals and small heart outlines
use compact generated CanvasTextures and instanced planes, one draw per texture.
`particleCount` accepts 0–80 (default 56), `petalCount` 0–40 (default 24), and
`heartParticleCount` 0–24 (default 12). Idle animation reduces these to at most
eight sparkles, four petals and six small hearts. `sparkleColor` customizes the
procedural golden particles.

For direct Three.js use, put the parent at the combined photo/video top center
under the tracked target Object3D, with the protected rectangle extending down:

```js
const {GoldenRingsAnniversaryEffect} = require('./animations/golden-rings-anniversary')
const effect = new GoldenRingsAnniversaryEffect({
  THREE, document, parent: topAnchor,
  width: pictureVideoBounds.width, pictureHeight: pictureVideoBounds.height,
  anniversaryNumber: 25, coupleNames: 'Eswaran ❤️ Priya',
  startDate: '09/12/2001', endDate: '09/12/2026',
})
await effect.load()
effect.start()                // matching image target found; safe before load completes
effect.update(deltaSeconds)  // existing AR render tick
effect.reset()               // matching target lost; next start replays from zero
effect.configure({message: 'Celebrating {years} Wonderful Years Together'})
effect.seek(3.1)             // optional timeline preview in elapsed seconds
effect.dispose()             // release artwork, generated textures and geometry
```

Call `load()` after changing feature flags, the asset base or texture resolution.
The `magic-golden-rings-anniversary` component handles this automatically.
`getAnniversaryPlacement()` supplies safe bounds and `getAnniversaryOptions()`
filters configurable API fields. Code, timeline, text and texture helpers live
together in `src/animations/golden-rings-anniversary/`. Physically verify tracking
and visual performance on the deployment phone before release.

### Magical wedding flower arch (category 2, design 1)

`MagicalWeddingFlowerArchEffect` runs in the existing live camera AR scene using
the tracked target's Object3D, A-Frame Three.js instance, camera and tick. Select
it in a matched API response or an individual `videoUrlV1` entry:

```json
{
  "enableBanner": true,
  "enableConfetti": false,
  "bannerType": 2,
  "bannerDesignType": 1,
  "bannerOptions": {
    "anniversaryNumber": 25,
    "coupleNames": "Eswaran ❤️ Priya",
    "startDate": "09/12/2001",
    "endDate": "09/12/2026",
    "duration": 6.5,
    "speed": 1,
    "archScale": 1,
    "closedVideoOpacity": 0,
    "useFullArch": true
  }
}
```

The target initially appears tied with the supplied red ribbon. The anniversary
video surface is hidden and a target-anchored **Tap ribbon to reveal** hint is
displayed. This state waits indefinitely for a real ribbon tap; it does not
automatically cut or reveal after a timer. Raycasting uses the existing AR camera
and canvas. The hit test checks the ribbon's alpha, with a small local touch margin
to bridge transparent gaps inside the supplied bow, while ignoring empty outer
corners. Pointer handling rejects drags, multitouch, unrelated UI, paused scenes
and webpage/fullscreen video playback. Further taps cannot trigger a second cut.

The canonical sequence starts at the accepted tap. The ribbon highlights briefly
and the ornate scissors move in from the right (0.15–1.15s). The supplied scissor
texture is partitioned into fixed handles/flowers and two upper blade regions;
the blades make small independent pivot rotations without drawing duplicate
scissors. Their cutting point meets the bow, the blades close and the ribbon is
replaced by its two supplied cut halves (1.35s). Those halves drift left/right and
down with rotation, fading out by 2.65s. The scissors leave by 2.1s.

Gold/floral bloom sprites rise from the bottom center and outer edges. The left
and right arch assets reveal upward from fixed bases using cropped UVs and
matching plane heights, preserving texel proportions as they grow (1.35–4.15s).
They crossfade into the completed arch (3.8–4.25s). Set `useFullArch: false` to
retain the two grown halves as the final frame instead. The existing video fades
from its closed-state opacity to full visibility during late growth (3.2–4.25s).
The anniversary banner appears below the frame (4.25–5.5s), followed by a soft
petals/sparkles border overlay and real-time particles. After 6.5s, the complete
frame and message remain, with subtle motion and reduced particle counts.

**The completed arch frames the outside of the target.** Placement uses the
center and dimensions of the union of the full printed photo and video surface,
including original-image crop offsets, masks and video overscan. Upright arch
artwork scales uniformly to surround both landscape and portrait targets; it may
extend above the picture to preserve its natural arch proportions. A shader clips
all arch, bloom, overlay, banner and particle fragments inside the protected
photo/video rectangle. The ribbon and scissors are the only foreground ceremony
objects; they are completely gone by full reveal. The final video is unobstructed,
including when the phone/target tilts or tracking dimensions change.

This design reuses the existing `magic-target-video-cover` opacity gate introduced
for Cupid. Its registry definition uses `revealsVideo: true` and initializes the
gate before the surface can appear. It does not create another video element,
renderer, camera, tracking session or render loop, and never pauses, seeks or
changes the sound of the existing media. Playback/audio continue under the app's
existing rules while the AR surface is hidden. `closedVideoOpacity` can be set
from 0 to 0.35 for a visually secondary video while waiting for the cut. Mask
loading and resizing preserve this gate and the reveal fade. Removing/disabling
the effect restores normal video opacity; failed artwork loads emit
`weddingarcherror` and restore visibility so playback cannot remain stranded.

Tracking loss hides the effect, cancels partial taps, clears the cut state and
returns the gate to its closed opacity. Reacquisition shows the tied ribbon again
and requires a fresh tap. Duplicate found events do not reset an active sequence.
`enableBanner: false` skips registry lookup and artwork loading entirely.
`bannerOptions.enabled: false` also leaves the video visible. Only one banner
design is created per target, preserving the other birthday, romantic and
anniversary designs. Independent confetti remains controlled by `enableConfetti`.

The default message is `Happy Wedding Anniversary`; `anniversaryNumber` supplies
the ordinal, for example `Happy 25th Wedding Anniversary`. `coupleNames` and
`startDate` / `endDate` add optional name/date lines. Dates display literally, with
no locale parsing or time-zone conversion. `bannerMessage` overrides the heading;
an explicit blank is preserved. Custom headings support `{anniversary}` (25th),
`{years}` (25), `{coupleNames}` and `{dates}` placeholders. CanvasTexture text wraps
and shrinks inside the cream banner area, supporting up to six lines / 500 text
characters. Updating text, names, number, dates or `textColor` reuses that texture
without restarting the ceremony.

`duration` (0.5–60 seconds, default 6.5) rescales the sequence after the tap, while
`speed` (0.1–3) multiplies elapsed time. Runtime timing changes preserve the current
phase and stored tap time. `archScale` (1–1.8) enlarges the outer structure while
maintaining clearance. `ribbonSize` (0.8–1.4), `scissorSize` (0.2–0.9) and
`bannerSize` (0.6–1.8) control artwork widths relative to picture width.
Optional flags `showHint`, `showBloom`, `showMessage`, `showOverlay`,
`showSparkles` and `showPetals` default to true. Entry options override response
defaults. Target positions, protected dimensions and asset routing cannot be
overridden through backend banner options.

All ten supplied WebPs keep their exact filenames and transparency in
`src/animations/magical-wedding-flower-arch/assets/`. Shared reference-counted
texture leases cap GPU upload dimensions at `maxTextureSize` (768 by default,
256–1024), disable mipmaps and release late load results on teardown. Disabled
artwork features omit their images. Generated sparkles and petals use compact
CanvasTextures and instanced planes: `particleCount` 0–72 (default 48),
`petalCount` 0–40 (default 24), reduced to ten sparkles/four petals in the final
loop. Their simulation and draw calls remain inactive while waiting for the tap.
`sparkleColor` and `textColor` customize the procedural gold and banner text.

For direct Three.js use, place the parent at the combined photo/video center
under the existing tracked target, and initialize the video surface's opacity
gate before making it visible:

```js
const {MagicalWeddingFlowerArchEffect} = require('./animations/magical-wedding-flower-arch')
existingVideoCover.setRevealOpacity(0)
const effect = new MagicalWeddingFlowerArchEffect({
  THREE, document, parent: pictureCenterAnchor,
  width: pictureVideoBounds.width, pictureHeight: pictureVideoBounds.height,
  anniversaryNumber: 25, coupleNames: 'Eswaran ❤️ Priya',
  onVideoOpacity: opacity => existingVideoCover.setRevealOpacity(opacity),
})
await effect.load()
effect.attachInteraction({element: renderer.domElement, getCamera: () => camera})
effect.start()                // matching target found; safe before load resolves
effect.update(deltaSeconds)  // existing AR render tick
effect.triggerCut()          // optional programmatic equivalent of tapping the ribbon
effect.reset()               // target lost; rearm the ribbon and close the reveal gate
effect.configure({message: 'Happy {anniversary} Anniversary'})
effect.dispose()             // release resources/listeners and restore video opacity
```

`seek(elapsedSeconds)` previews elapsed time; the reveal begins only after
`triggerCut()` sets the stored canonical tap time. Use `reset()` to return to the
untouched closed state. Call `load()` after changing feature flags, the asset base
or texture resolution. The `magic-wedding-flower-arch` A-Frame component handles
loading, interaction and tracking events automatically. `getFlowerArchPlacement()`
and `getFlowerArchOptions()` provide the registry integration. Physically verify
tracking, touch behavior and visual performance on the deployment phone before
release.

### Traditional South Indian wedding arch (category 2, design 2)

`TraditionalSouthIndianWeddingArchEffect` adds the supplied Tamil temple-style
golden frame, jasmine/marigold garlands, mango leaves, hanging bells and brass
lamps/kalash to the existing live image-tracking AR view. Select it in a matched
response or individual `videoUrlV1` entry:

```json
{
  "enableBanner": true,
  "enableConfetti": false,
  "bannerType": 2,
  "bannerDesignType": 2,
  "bannerOptions": {
    "anniversaryNumber": 25,
    "coupleNames": "Eswaran ❤️ Priya",
    "weddingDate": "09/12/2001",
    "anniversaryDate": "09/12/2026",
    "duration": 6.5,
    "archScale": 1,
    "outerMargin": 0.08,
    "ribbonX": 0,
    "ribbonY": 0,
    "replayOnReacquire": true
  }
}
```

The red ceremonial ribbon appears across the picture with **Tap Ribbon to Open**.
The existing AR video surface remains hidden indefinitely until a ribbon tap.
Raycasting uses the current AR camera and canvas. Alpha-aware touch detection
includes a small margin around the bow's transparent interior gaps, while
rejecting empty outer corners, unrelated UI, drags and multitouch. The first
accepted tap locks the interaction until reset.

After the tap, the golden scissors enter from the right and perform a small 2.5D
snip at the bow (1.35s in canonical sequence time). A short gold flash marks the
cut. The closed ribbon changes to the separate left/right pieces, which drift
outward/downward with rotation. **The existing video fades in as the ribbon
separates (1.35–2.65s)** and is fully visible when the pieces have cleared. Its
playback, audio and fullscreen controls remain under the existing controller;
this effect does not create, replace, pause or seek the media.

The left and right pillars grow from bottom to top (1.35–4.15s), progressively
revealing the gold structure, jasmine/marigold garlands and decorations. Toran,
pillar and brass-base regions are partitioned into nonoverlapping UV bands on
the assets' shared canvas. This keeps their registration and avoids doubled
flowers, bells or lamps. They transition into one completed temple arch
(3.8–4.25s). The separate growth toran and lamp art then disappear; the final
image already includes these details. Soft generated light halos illuminate the
brass corners, and the anniversary banner appears below the picture
(4.25–5.5s). The final frame remains with petals, a subtle border overlay and
occasional golden glints.

The **transparent inner opening is fitted around the protected photo/video
bounds**, rather than fitting the artwork's outer canvas to the video. The
source opening is calibrated in normalized image coordinates in `timeline.js`.
Uniform scaling fits that opening around both the full printed image and video
surface with `outerMargin` clearance, preserving the artwork's proportions on
portrait and landscape targets. Crop offsets and video overscan are included.
All flower, toran, base, glow, overlay and particle materials also clip inside
the protected rectangle, so central video pixels stay clear while the phone or
picture moves. Every object remains under the tracked target's Object3D.

This design reuses the tested ribbon/scissors, texture lifecycle, touch controller
and video-gate engine from `MagicalWeddingFlowerArchEffect`, with separate assets,
calibrated layout, growth layers and reveal timing. Previous designs retain their
own behavior. No new camera, renderer, tracking session or animation loop is
created. The registry initializes the existing video's opacity gate before the
effect loads. Disabled banners skip the gate and assets; disabling/removing the
effect or failing to load artwork restores normal video visibility. Load errors
emit `templearcherror`.

`duration` (0.5–60s, default 6.5) rescales all phases after the tap; `speed`
(0.1–3) multiplies elapsed time. Timing changes preserve the phase. `archScale`
(1–1.8) enlarges the outside frame, and `outerMargin` (0.02–0.4 picture widths,
default 0.08) controls opening clearance. `ribbonX` (−0.3 to 0.3) and `ribbonY`
(−3 to 3) position the ribbon in picture-width units; vertical movement is
clamped to keep its bow within the picture. Scissors and cut pieces follow the
same local position. `ribbonSize`, `scissorSize` and `bannerSize` use the shared
ceremony's size ranges. Compatibility aliases `ribbonScale` and `animationSpeed`
map to `ribbonSize` (relative to 1.08) and `speed` before A-Frame defaults apply.

`anniversaryNumber`, `coupleNames`, `startDate` and `endDate` customize the banner;
`weddingDate` and `anniversaryDate` are aliases for the two dates. Dates display
literally, with no parsing or calendar inference. The default heading becomes
`Happy 25th Wedding Anniversary` when the number is 25. Set `bannerMessage` to
override it, including `{anniversary}`, `{years}`, `{coupleNames}` or `{dates}`
placeholders. An explicit blank heading is preserved. CanvasTexture text wraps
and scales inside the cream strip, supporting up to six lines / 500 characters;
runtime personalization updates reuse the texture without restarting the cut.

Tracking loss cancels pending touches and hides the scene effect. With
`replayOnReacquire: true` (default), it resets to the closed ribbon and requires
a fresh tap on detection. Set false to freeze and resume an already activated
ceremony at its previous phase. Duplicate detections cannot restart or recut it.
Changing target identity always clears the prior ceremony. `enabled`,
`showHint`, `showMessage`, `showBloom`, `showOverlay`, `showSparkles` and
`showPetals` retain the shared controls. `showToran` / `showLamps` select the
separate growth assets and lamp glows; they do not remove details embedded in
the complete final image. `useFullArch: false` retains the registered component
layers instead of the final crossfade.

All twelve supplied transparent WebPs retain their exact filenames under
`src/animations/traditional-south-indian-wedding-arch/assets/`. Only the enabled
design/features request artwork. Reference-counted leases cap uploads at
`maxTextureSize` (768 by default, 256–1024), disable mipmaps and dispose late
loads safely. Real-time sparkle/petal instances share small generated textures:
`particleCount` 0–72 (default 48), `petalCount` 0–40 (default 24), reduced to ten
sparkles and four petals in the idle loop. Simulation stays inactive while
waiting for a tap. The two lamp halos share the snip-glow texture.

For direct Three.js use, put the parent at the union of the printed-photo and
video bounds under the current tracked target:

```js
const {TraditionalSouthIndianWeddingArchEffect} = require('./animations/traditional-south-indian-wedding-arch')
existingVideoCover.setRevealOpacity(0)
const effect = new TraditionalSouthIndianWeddingArchEffect({
  THREE, document, parent: pictureCenterAnchor,
  width: pictureVideoBounds.width, pictureHeight: pictureVideoBounds.height,
  anniversaryNumber: 25, coupleNames: 'Eswaran ❤️ Priya',
  weddingDate: '09/12/2001', anniversaryDate: '09/12/2026',
  onVideoOpacity: opacity => existingVideoCover.setRevealOpacity(opacity),
})
await effect.load()
effect.attachInteraction({element: renderer.domElement, getCamera: () => camera})
effect.start()                // matching target found; safe before assets finish loading
effect.update(deltaSeconds)  // current AR render tick
effect.triggerCut()          // optional programmatic equivalent of touching the ribbon
effect.reset()               // matching target lost
effect.configure({message: 'Happy {anniversary} Anniversary', ribbonY: 0.1})
effect.dispose()             // release resources/listeners and restore video opacity
```

Call `load()` after changing artwork feature flags, resolution or asset base.
`seek(elapsedSeconds)` previews the sequence after `triggerCut()` has set its tap
time. The `magic-south-indian-wedding-arch` component automatically handles
tracking, input, loading and the existing video plane. `getTempleArchPlacement()`
and `getTempleArchOptions()` connect it to the current registry. Verify physical
tracking, touch interaction and performance on the deployment phone before
release.

### Broken Heart Healing with Golden Thread (category 3, design 0)

Set these fields on a matched entry alongside its existing `targetName` and `videoUrl`.

```json
{
  "enableBanner": true,
  "bannerType": 3,
  "bannerDesignType": 0,
  "bannerMessage": "I'm Truly Sorry ❤️\nI know I hurt you, and I want to make things right.",
  "bannerOptions": {
    "positions": {"heartScale": 0.94, "bannerY": 0},
    "timings": {"doorOpen": 1.5, "bannerReveal": 1.5},
    "stitchingPath": [[0.025, 0.25], [-0.097, 0.17], [0.048, 0.099], [-0.103, 0.01],
                      [0.034, -0.059], [-0.072, -0.141], [0.013, -0.224], [-0.06, -0.312]]
  }
}
```

With the default timings, the doors begin opening at 6.5 seconds. The first
video frame fades in as soon as it is available during the opening, and the clip
starts from the beginning at 8 seconds. The banner fades in by 9.5 seconds.
Petals and sparkles continue around the playing video. Losing the target hides
the effect and rewinds the inline video. Reacquiring it replays the sequence.
Set `enableBanner: false` or `bannerOptions.enabled: false` to play directly.

`bannerOptions` accepts the phase durations `brokenHeartIntro`, `needleEntrance`,
`stitching`, `healedPause`, `doorOpen`, and `bannerReveal` in seconds. Set `speed`
to scale the whole sequence. `heartX`, `heartY`, `bannerX`, and `bannerY` are
offsets measured in photo widths. `needleStartX`, `needleStartY`, and
`stitchingPath` use heart widths relative to its center. Positive Y points up.
Use `heartScale`, `needleScale`, `bannerScale`, `textColor`, `petalCount`, and
`sparkleCount` to adjust the artwork and message.

For direct Three.js use, import `BrokenHeartHealingEffect` from
`src/animations/broken-heart-healing`. Pass `THREE`, `document`, a tracked
`parent`, and optional `onVideoOpacity` and `onVideoReady` callbacks. Call `load()`
to preload, `start()` on tracking found, `update(deltaSeconds)` from the existing
render loop, `reset()` on tracking lost, and `dispose()` when the target is removed.
`configure({message: 'Your message'})` updates the banner text in place.

### Teddy Bear Coming to Say Sorry (category 3, design 1)

Set these fields on a matched entry alongside its existing `targetName` and `videoUrl`.

```json
{
  "enableBanner": true,
  "bannerType": 3,
  "bannerDesignType": 1,
  "bannerMessage": "I’m Really Sorry ❤️\nPlease forgive me.\nI never meant to hurt you.\nYou mean so much to me.",
  "bannerOptions": {
    "recipientName": "Sam",
    "senderName": "Alex",
    "maxMessageLength": 260,
    "interactiveLetter": true,
    "revealVideo": true
  }
}
```

The teddy walks in, kneels, and offers its rose. The envelope unfolds below the
photo and the existing video starts from the beginning at 7 seconds by default.
The banner finishes appearing at 9 seconds while hearts, petals, and sparkles
drift around the playing video. Tracking loss hides the scene and resets the
sequence for replay.

Set `revealVideo: false` to play the clip immediately while the teddy animates.
With `interactiveLetter: true`, tapping the envelope opens it early. The letter
also unfolds on its timer and video playback keeps its scheduled start.
Set `enabled: false` in `bannerOptions` to bypass the effect.

Use `bannerMessage` or `bannerOptions.messageLines` for multiline text.
`recipientName`, `senderName`, `textColor`, and `maxMessageLength` customize
the CanvasTexture. Configure the phase durations with `timings.walkIn`, `kneel`,
`roseEmphasis`, `letterReveal`, and `bannerReveal` in seconds, or set `speed`.
The `positions` object accepts `teddyX`, `teddyY`, `letterX`, `letterY`, `bannerX`,
`bannerY`, and the four scale options `teddyScale`, `roseScale`, `letterScale`, and
`bannerScale`. Positions use photo-relative units and positive Y points up.
`entranceSide` takes `left` or `right`. Use `heartCount`, `petalCount`, and
`sparkleCount` to tune the finishing loop.

For direct Three.js use, import `TeddyBearSorryEffect` from
`src/animations/teddy-bear-sorry`. Pass `THREE`, `document`, a tracked `parent`,
and optional `onVideoOpacity` and `onVideoReady` callbacks. Call `load()`,
`start()` on tracking found, `update(deltaSeconds)` from the existing render loop,
`reset()` on tracking lost, and `dispose()` when removing the target.

<details>
<summary>Kneeling sprite and generation prompt</summary>

The supplied walking and kneeling images were identical. The built-in image
generator edited the supplied pose into the kneeling WebP at
`src/animations/teddy-bear-sorry/assets/02_teddy_bear_kneeling_with_rose.webp`.

> Precise pose edit for a transparent 2.5D AR sprite. Keep the exact same golden-brown teddy character, plush fur, warm brown eyes, rosy cheeks, red neck bow, red rose, lighting and softly rendered 3D look from the reference. Change only his pose. Show the entire bear in a clearly low, front-facing two-knee kneel, with both knees tucked underneath and the feet trailing, head dipped gently as he looks up apologetically and offers the single red rose forward in both paws. Preserve the character’s recognizable head and proportions so the transition from the supplied walking frame matches. Center the whole silhouette with a small transparent margin on every side. Actual transparent background, clean alpha silhouette, no ground shadow, no props besides the rose, no text.

</details>

### New Year 2027 Countdown (category 6, design 1)

```json
{
  "targetName": "new-year-card",
  "videoUrl": "new-year.mp4",
  "bannerType": 6,
  "bannerDesignType": 1,
  "enableBanner": true,
  "bannerOptions": {
    "year": "2027",
    "messageLines": ["Happy New Year 2027", "Wishing You Joy, Health & Success"],
    "familyName": "The Sharma Family",
    "timings": {
      "clockEntrance": 1.5,
      "countdownSequence": 4,
      "midnightFlash": 1,
      "yearReveal": 1.3,
      "bannerReveal": 1.2
    }
  }
}
```

The clock rises above the tracked video. Five digits pulse over the next four
seconds, followed by the midnight flash, side fireworks, gold year, and greeting.
Confetti and sparkles loop from nine seconds onward. Video uses normal playback.
Tracking loss hides and resets the effect, ready to replay on reacquisition.

Set `bannerMessage` to override `bannerOptions.messageLines`. Add a personalized
line with `recipientName` or `familyName`. A custom four-digit `year` updates the
default greeting and uses canvas-rendered gold numerals for the reveal.
Set `enableBanner` or `bannerOptions.enabled` to `false` to disable the countdown.
The existing video decoration can be controlled separately with `enableConfetti`.

Use `bannerOptions.positions` for offsets in photo-width units, such as
`{"yearY": 0.05, "bannerX": -0.1}`. The position keys are `clockX`, `clockY`,
`countdownX`, `countdownY`, `yearX`, `yearY`, `bannerX`, `bannerY`, and the
paired `fireworksX`, `fireworksY`, `confettiX`, `confettiY`. Use
`bannerOptions.scales` for `size`, `clockScale`, `haloScale`, `yearScale`,
`bannerScale`, `fireworksScale`, and `confettiScale`. Set `confettiOpacity` or
`particleCount` to zero to turn off those layers. Optimized WebPs load first,
with PNG fallback and fewer particles on phones and tablets.

For standalone Three.js, import `NewYear2027CountdownEffect` from
`src/animations/new-year-2027-countdown` and construct it with `{THREE, document,
parent}` and any effect options. Call `load()` to preload, `start()` on target
detection, `update(deltaSeconds)` per frame, `reset()` on loss, and `dispose()`
on removal. Use `configure({message: 'Happy New Year!'})` to edit the live
greeting. In A-Frame, update the `text` property of `magic-new-year-2027-countdown`.

### Santa Flying with Reindeer (category 6, design 2)

Set `bannerDesignType` to `2` on existing Santa entries.

```json
{
  "targetName": "christmas-card",
  "videoUrl": "christmas.mp4",
  "enableBanner": true,
  "bannerType": 6,
  "bannerDesignType": 2,
  "bannerMessage": "Merry Christmas!\nWishing You Joy & Love",
  "bannerOptions": {
    "enabled": true,
    "familyName": "The Sharma Family",
    "timings": {"flyIn": 2.2, "giftDropPose": 1, "giftDrop": 1, "giftOpen": 1.2, "bannerReveal": 1.6},
    "positions": {"santaX": 0.30, "santaY": 0, "giftX": 0.35, "giftY": 0, "bannerX": -0.19, "bannerY": 0},
    "snowCount": 14
  }
}
```

Santa flies in above the video, pauses to drop the gift at 3.2 seconds, and flies
out to the right. The gift bounces and opens at 4.2 seconds. The banner comes
in from 5.4 to 7 seconds, followed by looping snowfall outside the picture.
The normal video playback starts on detection. Tracking loss hides and resets
the effect so the animation replays on reacquisition.

Use `bannerOptions.messageLines` as an alternative to `bannerMessage`. The
default is `Merry Christmas!`. An explicit empty message omits the greeting
text. `recipientName` or `familyName` adds a personalized line. `textColor`
sets the greeting color.

Each timing is a phase duration in seconds. `speed` multiplies the timeline
rate. Coordinates use photo-width units. X positions are relative to photo
center, and Y values offset the default top or bottom placement. `size`,
`santaScale`, `giftScale`, and `bannerScale` scale the artwork. `snowCount`
(0–24) and `snowOpacity` (0–1) control snowfall. Set `enableBanner` or
`bannerOptions.enabled` to `false` to disable the effect.

The effect uses optimized WebP artwork and falls back to the source PNGs. It
shares textures across instances and batches the snowflakes into one draw call.
For standalone Three.js use, import `SantaFlyingReindeerEffect` from
`src/animations/santa-flying-reindeer`. Construct it with `{THREE, document,
parent}` and optional effect settings. Call `load()` to preload, `start()` on
detection, `update(deltaSeconds)` on render ticks, `reset()` on tracking loss,
and `dispose()` on removal. `configure({message: 'Happy Christmas'})` changes
the live greeting.

### Target confetti

The following describes `decorType: 0`. Set `decorType: 1` with
`enableConfetti: true` for pink and red heart bubbles instead. The hearts rise
over about 3.6–5.1 seconds, pop near the top, and repeat with staggered timing.
They use one instanced mesh without image assets and follow the same playback,
tracking, resizing and cleanup rules as confetti.

While a video plays on a tracked image, bursts of bent paper flakes and curled red
ribbons launch from its lower sides every 5.8 seconds. Independent launch angles,
momentum, wind, and gravity scatter the pieces across the camera view as they fall,
with no side boundaries. Three-dimensional strips tumble and catch highlights;
ribbons curl along their length. No PNG textures are needed. Pieces keep a minimum
screen size for visibility on phones. The emitters follow the video
surface's size, crop offset, and target pose. Confetti hides during pauses, buffering,
target loss, and webpage/fullscreen playback, then returns with target playback.
Each target uses one GPU-animated instanced mesh (148 paper flakes and 36 ribbons)
through A-Frame's existing Three.js renderer, with no extra library or image assets.
Geometry, materials, and
media listeners are released when the target is cleared.

### Video shape masks

Masks apply to playback on the image target. The webpage player displays the
ordinary full video frame.

Each `videoUrlV1` entry can select a built-in shape or an uploaded image mask:

```json
{
  "videoUrlV1": [
    {
      "targetName": "gift",
      "path": "targets/gift",
      "videoUrl": "videos/gift.mp4",
      "maskUrl": "https://example.com/uploads/heart.png",
      "maskMode": "auto"
    }
  ]
}
```

- Set `shape: "circle"` or `shape: "heart"` for a built-in shape. Numeric `shape: 1`
  also selects a circle, matching the MindAR reference. Response-level `frameShape`
  supplies the default when an entry has no `shape`.
- Set `maskUrl` to a custom mask image URL. `customShapeUrl` and
  `shape: {"customShapeUrl": "..."}` are also supported. A custom URL takes priority
  over a built-in shape; relative URLs resolve against the configured video CDN.
  Backend `frameShape: 9` selects a custom mask: supply its URL in `maskUrl`
  or `customShapeUrl`. These fields can be on the response or an individual
  `videoUrlV1` entry; entry masks take priority. ID 9 with no URL is rejected
  instead of displaying a rectangular video.
- A transparent PNG/WebP uses its transparency as the outline. For an opaque mask,
  use a white shape on a black background: white shows video, black hides video,
  and gray makes it partially transparent. `maskMode: "auto"` detects transparency;
  `"alpha"` or `"luminance"` explicitly selects the mask format.
- Custom mask canvases keep their original aspect ratio, including black or
  transparent padding. A square cutout on a portrait canvas keeps its proportions.
  The full mask canvas fits inside the full uploaded target image. Built-in shapes
  use a square surface. The target JSON's crop dimensions and offsets
  map that surface from the tracking region to the original image, so a circle can
  cover the whole disc even when only a smaller rectangle is used for tracking.
  Square videos retain their full frame; other video ratios are cropped to cover.
  A portrait video stays upright and fills a square mask without stretching:
  its top and bottom are cropped equally. A landscape video is cropped equally
  on the left and right. The mask outline remains unchanged by the video crop.
  Shape playback defaults to `shapeScale=1.1`, adding 10% to the diameter to cover
  a narrow printed rim. To calibrate a physical frame, add `?shapeScale=1.12` to
  the AR page URL for 12% enlargement relative to the target, or `shapeScale=1`
  for its exact calculated size. Rectangular playback is unaffected.
- Upload masks through your existing upload service and return their URL in the API
  response. The mask host must allow cross-origin image access (CORS). An ordinary
  photo with an opaque background needs a prepared mask to define its outline.

Masks are loaded before the experience activates. If a mask cannot be loaded, the
app resumes identification and logs the error instead of showing an unmasked video.
Entries with no mask or shape keep rectangular playback.
Their video surface also maps to the full uploaded image using the target JSON's
crop dimensions and offsets, including borders outside the tracking crop. A square
upload with a square video needs no mask, even if its tracking crop is rectangular.
Unmasked playback retains the existing 4% enlargement to cover small tracking errors.

### Preparing Target Images

Image targets can be generated using the interactive CLI tool: 

```bash
npx @8thwall/image-target-cli@latest
```

More information can be found here: https://github.com/8thwall/8thwall/blob/main/apps/image-target-cli/README.md

You can also use the [8th Wall Desktop app](https://8thwall.org/downloads) to generate image targets, then copy them into this project to use them in A-Frame.

## Deployment

This project contains Github Actions configuration for deployment to Github Pages, which triggers automatically by pushing the `main` branch. You can also create a production build using `npm run build`, which outputs the production build to the `dist` folder, and publish to the web using [this guide](https://8thwall.org/docs/getting-started/publishing#self-hosting-your-project).

## Questions?

Please raise any questions on [Github Discussions](https://github.com/orgs/8thwall/discussions) or join the [Discord](https://8th.io/discord) to connect with the community.
