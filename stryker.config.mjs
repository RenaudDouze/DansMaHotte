/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  inPlace: true,
  reporters: ["clear-text", "progress"],
  coverageAnalysis: "perTest",
  mutate: [
    "shared/**/*.ts",
    "worker/**/*.ts",
    "src/lib/color.ts",
    "src/lib/sort.ts",
    "src/lib/importPayload.ts",
    "src/lib/compactShare.ts",
    "!**/*.test.ts",
    "!worker/test/**",
    "!worker/listRoom.ts",
    "!shared/types.ts",
  ],
  thresholds: {
    high: 90,
    low: 70,
    break: 70,
  },
};
