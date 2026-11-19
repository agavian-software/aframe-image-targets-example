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

Set `birthdayText` on a `videoUrlV1` entry or its response, for example
`"birthdayText": "Happy Birthday!\nAarav"`. It defaults to `Happy Birthday!`.
The transparent CanvasTexture wraps and scales the message to fit the banner.
At runtime, change the decoration entity's `magic-birthday-banner` `text` property
to update it without rebuilding textures or restarting the animation.

The seven original PNGs are in `src/assets/birthday/` and retain their exact
filenames and proportions. Webpack copies them to `dist/assets/birthday/`.
Live targets share the PNG textures; geometry, materials, canvas textures, and
event listeners are released when their decoration is removed.

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
