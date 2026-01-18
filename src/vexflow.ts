// src/vexflow.ts
// Compatibility shim for VexFlow 5+ to preserve the legacy Vex.Flow namespace.

import VexFlow from 'vexflow'; // VexFlow module entry point (classes exported at top level).

// Provide a Vex.Flow alias for legacy code paths that expect Vex.Flow.*.
// Design note: we keep the alias lightweight to avoid per-call indirection in hot paths.
if (!(VexFlow as any).Flow) {
  (VexFlow as any).Flow = VexFlow;
}

// Legacy error constructor used by older VexFlow APIs (e.g., Vex.RERR).
// Design note: RuntimeError is the canonical class in VexFlow 5.
if (!(VexFlow as any).RERR && (VexFlow as any).RuntimeError) {
  (VexFlow as any).RERR = (VexFlow as any).RuntimeError;
}

// Legacy benchmark helper used by older VexFlow APIs.
// Design note: keep it as a no-op wrapper so older code continues to call it safely.
if (!(VexFlow as any).BM) {
  (VexFlow as any).BM = (_label: string, fn: () => void) => fn();
}

// Export the (patched) VexFlow namespace so callers can use Vex.Flow.* as before.
export default VexFlow as any;
