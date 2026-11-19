// Webpack supplies the font bytes to the guide's offline print exporter.
declare module '*.otf' {
  const bytes: Uint8Array;
  export default bytes;
}
