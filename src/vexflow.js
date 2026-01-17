import VexFlow from 'vexflow';

// VexFlow 5+ exports classes at the top level. Provide a Vex.Flow alias
// for legacy code paths that expect Vex.Flow.*.
if (!VexFlow.Flow) {
  VexFlow.Flow = VexFlow;
}

// Legacy error constructor used by older VexFlow APIs.
if (!VexFlow.RERR && VexFlow.RuntimeError) {
  VexFlow.RERR = VexFlow.RuntimeError;
}

export default VexFlow;
