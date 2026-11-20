// Webpack supplies the font bytes to the guide's offline print exporter.
declare module '*.otf' {
  const bytes: Uint8Array;
  export default bytes;
}

declare module '*.sf2' {
  const samples: Uint8Array;
  export default samples;
}
