// VexTab's score text face and Bravura's published SMuFL attachment points for rhythm slashes.
import { EngravingProfile, SVGContext, VexFlow, type FontInfo } from 'vexflow';

/** The text face included in the VexFlow browser bundle. */
export const scoreFont = 'Academico';

// Remove the local profile when VexFlow ships https://github.com/vexflow/vexflow/issues/362.
// Coordinates in staff spaces from Steinberg's redist/Bravura.json, glyphsWithAnchors.
// Whole and double-whole slashes have no stem. Other fonts retain their own metrics.
const bravuraSlashes = new EngravingProfile({
  musicFont: 'Bravura',
  metadata: { fontName: 'Bravura', glyphsWithAnchors: {
    noteheadSlashVerticalEnds: { stemDownNW: [0, -0.664], stemUpSE: [1.46, 0.656] },
    noteheadSlashWhiteHalf: { stemDownNW: [0, -1], stemUpSE: [3.12, 1] },
  } },
});

/** Apply the anchors before layout so flags, beams and independent parts use the same stem. */
export function slashEngraving(slash: boolean): EngravingProfile | undefined {
  return slash && VexFlow.getFonts()[0] === 'Bravura' ? bravuraSlashes : undefined;
}

/** VexFlow 5.4 requests generic sans-serif for the fret diagram's position label. */
export class ScoreSVGContext extends SVGContext {
  setFont(face?: string | FontInfo, size?: string | number, weight?: string | number, style?: string): this {
    return super.setFont(face === 'sans-serif' ? scoreFont : face, size, weight, style);
  }
}
