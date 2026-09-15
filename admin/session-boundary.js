/** Invalidates in-flight private responses on account or environment changes. */
export function createSessionBoundary() {
  let generation = 0;
  return { reset: () => ++generation, capture: () => generation, current: (ticket) => ticket === generation };
}
