// Compatibility shim for VexFlow 5+ to preserve the legacy Vex.Flow namespace.
// VexFlow 5 exports classes at the top level, so we re-introduce the old namespace.
import VexFlow from 'vexflow';

// Provide a Vex.Flow alias for legacy code paths.
if (!(VexFlow as any).Flow) {
  (VexFlow as any).Flow = VexFlow;
}

// Legacy error constructor used by older VexFlow APIs (e.g., Vex.RERR).
if (!(VexFlow as any).RERR && (VexFlow as any).RuntimeError) {
  (VexFlow as any).RERR = (VexFlow as any).RuntimeError;
}

// Legacy benchmark helper used by older VexFlow APIs.
if (!(VexFlow as any).BM) {
  (VexFlow as any).BM = (_label: string, fn: () => void) => fn();
}

// Export the patched namespace for callers expecting Vex.Flow.*.
export default VexFlow as any;
