// Shared transport presentation settings for parsed scores and browser integrations.
/** Positions are relative to the part of the engraved surface visible to the reader. */
export type ControlPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type ControlSize = 'auto' | 'mini' | 'large';

export interface SheetControls {
  /** Auto selects a panel from the rendered score and viewport dimensions. */
  size?: ControlSize;
  /** Hover also supports touch reveal and keyboard focus. */
  visibility?: 'off' | 'hover' | 'always';
  position?: ControlPosition;
  /** Space between controls and the visible edge, in CSS pixels. */
  inset?: number;
}

export function isControlSize(value: string): value is ControlSize {
  return value === 'auto' || value === 'mini' || value === 'large';
}

/** Accept the same six edge positions in source notation, JavaScript and markup. */
export function isControlPosition(value: string): value is ControlPosition {
  return /^(top|bottom)-(left|center|right)$/.test(value);
}

/** Reject misplaced controls and invalid CSS values before mounting a player. */
export function sheetControlSettings(options: SheetControls = {}): Required<SheetControls> {
  const { visibility = 'hover', position = 'bottom-center', inset = 12, size = 'large' } = options;
  if (visibility !== 'hover' && visibility !== 'always' && visibility !== 'off') throw new RangeError('Control visibility must be off, hover or always');
  if (!isControlSize(size)) throw new RangeError('Control size must be auto, mini or large');
  if (!isControlPosition(position)) throw new RangeError('Unknown playback control position: ' + position);
  if (!Number.isFinite(inset) || inset < 0) throw new RangeError('Control inset must be a nonnegative number');
  return { visibility, position, inset, size };
}
