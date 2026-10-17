// Kept separate from impl.ts so the page can read the flag without importing the real pipeline.
export const mocksEnabled = () => process.env.USE_MOCKS !== "false";
