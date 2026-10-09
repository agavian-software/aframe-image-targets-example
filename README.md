# A-Frame: Image Targets

This example uses image targets to display information about jellyfish on a flyer. It uses the xrextras-named-image-target component to connect an <a-entity> to an image target by name while the xrextras-play-video component enables video playback.

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
also emitted as an `imageidentified` event on `window`. The event is the extension point for
loading the returned target JSON and video in the next phase.

### Video Shape Masks

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
- A transparent PNG/WebP uses its transparency as the outline. For an opaque mask,
  use a white shape on a black background: white shows video, black hides video,
  and gray makes it partially transparent. `maskMode: "auto"` detects transparency;
  `"alpha"` or `"luminance"` explicitly selects the mask format.
- Design custom masks with the same aspect ratio as the tracked image, since the
  mask fills that image's rectangle. Built-in hearts and circles retain their shape
  and are centered inside the tracked image. The video is cropped to fill the target
  independently of the mask.
- Upload masks through your existing upload service and return their URL in the API
  response. The mask host must allow cross-origin image access (CORS). An ordinary
  photo with an opaque background needs a prepared mask to define its outline.

Masks are loaded before the experience activates. If a mask cannot be loaded, the
app resumes identification and logs the error instead of showing an unmasked video.
Entries with no mask or shape keep rectangular playback.

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
