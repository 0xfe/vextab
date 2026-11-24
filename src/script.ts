// Expose both markup APIs from the same browser script and engraving engine.
import * as legacy from './legacy';
(window as Window & { VexTabDiv?: typeof legacy }).VexTabDiv = legacy;
export * from './auto';
