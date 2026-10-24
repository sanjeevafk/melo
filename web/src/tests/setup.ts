import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined" && !window.PointerEvent) {
  // jsdom does not define PointerEvent; map to MouseEvent for React 19 pointer handlers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.PointerEvent = window.MouseEvent as any;
}

