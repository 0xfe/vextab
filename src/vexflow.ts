import VexFlow from 'vexflow';

// VexFlow 5+ exports classes at the top level. Provide a Vex.Flow alias
// for legacy code paths that expect Vex.Flow.*.
if (!(VexFlow as any).Flow) {
  (VexFlow as any).Flow = VexFlow;
}

// Legacy error constructor used by older VexFlow APIs.
if (!(VexFlow as any).RERR && (VexFlow as any).RuntimeError) {
  (VexFlow as any).RERR = (VexFlow as any).RuntimeError;
}

export default VexFlow as any;
