# Brand Assets

- OGP/social previews must be committed as raster assets such as `apps/share/viewer/og-image.jpg`; do not rely on SVG `og:image` because some unfurlers reject SVG, and meta-only assets are copied only when `apps/share/build.ts` explicitly handles them.
- Keep the inline SVG favicon synchronized between `apps/syokan/index.html` and `apps/share/viewer/index.html`; keep OG/Twitter metadata and raster icon fallbacks in the public-share head only because the main app is localhost-only, and inject file-backed icon links after the share build because Bun tries to resolve them while meta-only assets are not copied automatically.
- When a brand font is used only for the `syokan` lockup, subset/embed only the needed glyphs in `apps/syokan/src/styles.css` and commit the font license next to the brand asset so later edits preserve redistribution evidence.
- Static OGP regeneration currently has no checked-in generator; the accepted manual path is browser canvas rasterization using the same logo paths and loaded brand font, then writing the resulting JPEG to `apps/share/viewer/og-image.jpg`.
