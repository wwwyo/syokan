// Ambient declaration for side-effect CSS imports from TSX (e.g. Graph/index.tsx importing
// @xyflow/react's stylesheet). Bun's HTML-import bundler and Storybook's Vite builder both
// resolve these at build time; TypeScript has no built-in module type for them (this repo
// doesn't pull in "vite/client", which would otherwise provide it), so declare it once here.
declare module "*.css";
