// Public conversion contract. All text ranges are half-open UTF-16 offsets in the decoded source.
export type TextRange = readonly [start: number, end: number];

/** Strict conversion stops on any known loss. Partial mode can omit explicit, timing-neutral marks. */
export interface ImportOptions {
  mode?: 'strict' | 'partial';
  /** Select standard (6.2.3), extended staff state (6.3.0), or expressive notation (6.4.0). */
  targetProfile?: 'standard' | 'extended' | 'expressive';
  /** Large target capacity also requires an extended-capacity consuming host. */
  capacity?: 'default' | 'large';
  filename?: string;
  sourceMap?: boolean;
}

/** Report the source construct and what happened to it. */
export interface ImportDiagnostic {
  code: 'syntax' | 'unsupported' | 'timing' | 'limit' | 'omitted-mark' | 'encoding';
  severity: 'error' | 'warning';
  message: string;
  file: string;
  range: TextRange;
  part?: string;
  measure?: string;
  voice?: string;
}

/** Explicit source events have mappings. Silence synthesized for an unoccupied interval has none. */
export interface ImportedDocument {
  text: string;
  source: { file: string; part: string; measure: string; voices: { source: string; target: string }[] };
  /** Stable generated staff IDs with their source part, staff and written measure labels. */
  staves?: { target: string; part: string; staff: number; measures: string[]; voices: { source: string; target: string }[] }[];
  sourceMap?: { generated: TextRange; original: TextRange; file?: string; uses?: { file: string; range: TextRange }[] }[];
}

/** A fatal failure never returns a misleading partial document. */
export type ImportResult = {
  target: { language: 2; minimumVersion: '6.2.3' | '6.3.0' | '6.4.0'; capacity?: 'large' };
  diagnostics: ImportDiagnostic[];
} & (
  | { status: 'exact' | 'partial'; documents: [ImportedDocument] }
  | { status: 'failed'; documents: [] }
);

/** MusicXML part IDs and inclusive, one-based ordinal bars. Printed labels may repeat. */
export interface MusicXMLOptions extends ImportOptions {
  selection?: { parts?: readonly string[]; firstMeasure?: number; lastMeasure?: number };
}
