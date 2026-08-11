# How to contribute

Contributions should keep AgentEmblem recognizable at compact sizes, accessible when motion is reduced, and predictable for existing React applications. Small bug fixes and documentation corrections can go straight to a pull request. Open an issue first for a new public API, a changed default, or motion and sampling behavior that could alter existing marks.

## Set up the project

You need npm and a Node.js version supported by Vite 7: Node.js 20.19 or a later 20.x release, or Node.js 22.12 or newer.

After you fork and clone the repository, install the locked dependencies and start the demo:

```sh
npm ci
npm run dev
```

The development server runs the playground in `src/App.tsx`. Use it to compare states, sizes, shapes, and source artwork while you work.

## Find the right files

| Path | Purpose |
| --- | --- |
| `src/lib` | Published components, AI activity helpers, and public types |
| `src/App.tsx` | Local demo and visual review playground |
| `src/App.css` and `src/index.css` | Demo styles |
| `src/assets` | Logo artwork used by the demo |
| `dist` | Generated package output; do not edit it by hand |

Keep demo-only code outside `src/lib`. If you change a public prop, export, default, or behavior, update the matching example, table, or explanation in `README.md`.

## Check visual and accessible behavior

Match the checks to the code you changed. For animation, sampling, or rendering work:

- Review every affected state: `idle`, `thinking`, `loading`, `composing`, `talking`, `researching`, and `listening`.
- Check the compact tiers at 16, 20, 24, 32, and 40 pixels when your change affects density, particle size, or shape recognition.
- Test representative SVG and transparent PNG inputs when your change affects source handling or rasterization.
- Verify both `animateVisibility` and `animateMotion` when your change touches state transitions.
- Turn on reduced motion and confirm that the mark remains clear and usable without animation.
- Keep the accessible label accurate and avoid exposing private model reasoning in status copy.

Use more than one browser for canvas, pixel-ratio, zoom, or image-decoding changes.

## Run the required checks

Run both commands before opening a pull request:

```sh
npm run typecheck
npm run build
```

The project does not currently define separate test or lint commands. For visual changes, use the demo for manual checks and include a screenshot or short recording with the pull request.

## Open a pull request

Keep each pull request focused on one problem. In the description:

- Explain the problem and the behavior you changed.
- Link the related issue when one exists.
- List the commands and manual checks you ran.
- Call out changes to the public API, accessibility, or animation defaults.
- Include before-and-after images or a recording for visible changes.

Respond to review comments with follow-up commits. Once the checks pass and the documentation matches the code, the pull request is ready for review.
