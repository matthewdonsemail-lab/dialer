// Domain core: one directory per domain (camelCase), each with its types,
// its pipeline (lib/*Machine.ts) and small pure helpers (utils/). Backend
// routes validate writes with these; the SPA builds menus and labels from
// the same definitions, so the two cannot disagree about a state.
export * from "./pipeline/index.js";
export * from "./contactStatus/index.js";
export * from "./outreach/index.js";
export * from "./video/index.js";
export * from "./call/index.js";
export * from "./callCampaign/index.js";
export * from "./offer/index.js";
