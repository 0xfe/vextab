// Public conversion contract. All text ranges are half-open UTF-16 offsets in the decoded source.
export type TextRange = readonly [start: number, end: number];

/** Strict conversion stops on any known loss. Partial mode can omit explicit, timing-neutral marks. */
export interface ImportOptions {
  mode?: 'strict' | 'partial';
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
  sourceMap?: { generated: TextRange; original: TextRange }[];
}

/** A fatal failure never returns a misleading partial document. */
export type ImportResult = {
  target: { language: 2; minimumVersion: '6.2.3' };
  diagnostics: ImportDiagnostic[];
} & (
  | { status: 'exact' | 'partial'; documents: [ImportedDocument] }
  | { status: 'failed'; documents: [] }
);
