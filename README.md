# A-Frame: Image Targets

The app scans a gift image or QR code, then plays its matched video on the tracked
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
buffering, fullscreen, and manual video pauses. Pending QR requests are cancelled
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

### Image Identification API

The app captures a center-cropped JPEG from the 8th Wall camera pipeline every two seconds and
sends it to an image-identification API as multipart form data. Set the endpoint in
`src/index.html`:

```html
<meta name="image-identification-api" content="https://example.com/image-identification">
```

The default multipart field is `formData`, matching `MindARFrameApi.jsx`. It can be changed with
the `image-identification-field` meta tag. You can also test a different endpoint without
rebuilding by opening the app with `?imageApi=https://example.com/image-identification`.

Successful API results are logged as `[image-identification] Identified image response:` and are
also emitted as an `imageidentified` event on `window`. The app loads the returned
targets and shape masks before activating image-target playback.

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
  "enableBanner": true,
  "bannerMessage": "Happy Birthday!\nAarav",
  "bannerType": 0,
  "bannerDesignType": 0
}
```

`enableConfetti` and `enableBanner` independently control their effects per target.
Disabled effects are not created and stay disabled during resizing, tracking
reacquisition, and fullscreen transitions. Video playback continues normally.
`bannerType` identifies one of the seven categories from `0` to `6`.
`bannerDesignType` is a nonnegative integer selecting a design within the category
and defaults to `0`. Category `0` / design `0` selects this flying-baby banner;
category `0` / design `1` selects the magical gift box below the image.
Category `0` / design `2` selects balloons carrying a personalized name.
Category `0` / design `3` selects the fairy with a magic wand.
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
  "bannerMessage": "Happy Birthday\nPriya",
  "bannerOptions": {
    "duration": 5,
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

The five-second sequence reveals a closed gift from behind the bottom edge
(0-1.5s), pops the lid and opens the box (1.5-2.5s), transitions through golden,
heart, and star artwork with real-time sparkles and two departing presents
(2.5-4s), then raises the personalized banner (4-5s). The final pose floats with
occasional sparkles. Composite illustrations crossfade as one main gift rather
than stacking multiple complete gift boxes. A cropped and feathered portion of
the open-gift texture supplies the final box without its explosion or spare lid.
All eight source WebP filenames are preserved; source files are not altered.

The anchor follows the tracked target and sits below both the original picture
and the enlarged video surface, accounting for off-center tracking crops. Every
sprite and particle is clipped at that anchor's bottom edge in target coordinates,
including during the entrance and lid pop. No global renderer clipping is enabled.
Transparent sprites retain their artwork aspect ratios and explicit layer order.
The message is drawn onto a separate CanvasTexture; changing `bannerMessage` or
the component's `text` does not reload artwork.

`duration` scales the whole reveal and subsequent motion (0.5-60 seconds). `size`
scales the effect relative to picture width (0.1-3). `offsetX` shifts horizontally
in picture-width units; positive `offsetY` moves down, with negative values clamped
to zero to preserve the video area. Entry `bannerOptions` merge over response
defaults. Colors use CSS color strings. Particle count is capped at 96 (64 by
default), rendered in one instanced draw; at most ten emit occasionally afterward.
Artwork uses a shared, reference-counted cache and is resized on upload to at most
768 pixels per dimension by default (configurable 256-1024 at initial load), with
no mipmaps. Only the selected design requests its images.

`MagicalGiftBoxEffect` can also be used directly with Three.js: construct it with
`{THREE, document, parent, ...options}`, where `parent` is a tracked Object3D at the
picture's bottom edge. Call `load()` to prepare assets, `start()` on tracking
acquisition, `update(deltaSeconds)` each frame, and `reset()` on tracking loss.
`configure({enabled: false})` hides and resets the effect independently; configure
it back to enabled and call `load()` if it has not loaded yet. `configure()` also
updates message, timing, sizing, position, colors, and particle count. `seek(seconds)`
supports deterministic previews. `dispose()` releases geometry, materials,
CanvasTexture, and the shared artwork reference, including pending requests. The
A-Frame adapter handles these calls and removes tracking listeners on teardown.
Artwork failures emit `giftboxerror` on the decoration entity and leave video
playback running.

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

The fairy enters from the right on a curved flight path (0-1.5s), faces inward,
and waves her painted wand while golden particles and a progressively drawn
Three.js line circle the picture (1.5-3s). A wand-tip burst and outward-moving
stars follow (3-4s). The personalized ribbon materializes above the image (4-5s),
then the fairy floats with occasional wand glints. The ring fits portrait and
landscape picture bounds, staying outside all four corners. It is generated at
runtime rather than using the S-shaped artwork as a substitute for the circle.

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
and artwork tints. All sprites, particles, and line fragments clip against the
full combined picture/video rectangle in tracked coordinates, including during
the entrance and with custom positions. Leave room beside the printed photo in
the camera view for the fairy. The underlying birthday video stays visible.

The existing `enableBanner` master switch runs before registry lookup or asset
loading. Designs 0, 1, and 2 remain available; one banner design is selected per
target, so the fairy does not also create babies, gifts, or balloon arrangements.
Video, image tracking, and independent confetti retain their existing controls.
Tracking loss hides and resets the fairy; reacquisition replays the reveal.

For standalone Three.js use, construct `FairyMagicWandEffect` with
`{THREE, document, parent, width, pictureHeight, message, ...options}`. `parent`
should follow the tracked transform at the top center of the combined picture
bounds. Use `load()`, `start()`, `update(deltaSeconds)`, `reset()` on target loss,
and `dispose()` on teardown. `configure()` updates text, timing, colors, position,
scale, and enabled/visibility options; call `load()` afterward to reconcile any
new images or procedural features. `seek(seconds)` supports previews. Geometry,
materials, generated textures, shared artwork leases, and adapter tracking
listeners are released on removal, including pending asset loads. Load failures
emit `fairymagicerror` on the decoration entity while video continues.

### Target confetti

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
