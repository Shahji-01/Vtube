import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.js"],
    // Some integration tests exercise real rate-limit windows (a ~1.1s wait for
    // the window to reset) and issue several sequential supertest requests. The
    // default 5s per-test timeout can be exceeded when the whole suite runs
    // together (module collection is heavy), so allow more headroom.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
