// Validate score ink identically in the DOM-free parser, Canvas, and portable SVG.
import type { RenderContext } from 'vexflow';

/** CSS named colours have fixed values, independent of the page's theme or stylesheets. */
const named = new Set(`
aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown
royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
springgreen steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/));

/** Accept named colours and CSS hex forms. Exclude CSS functions, URLs, and inherited values. */
export function isScoreColor(value: string): boolean {
  return named.has(value.toLowerCase()) || /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
}

/** A VexFlow foreground uses the same ink for filled glyphs and stroked lines. */
export function inkStyle(color: string) {
  return { fillStyle: color, strokeStyle: color };
}

/** Clear SVG strings behind fret numbers with opaque paper, even on a transparent embed. */
export function setFretPaper(ctx: RenderContext, host: HTMLElement) {
  const paper = getComputedStyle(host).backgroundColor;
  if (paper && !paper.startsWith('rgba(') && !paper.includes('/')) ctx.setBackgroundFillStyle(paper);
}
