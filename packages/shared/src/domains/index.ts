// Domain core: one directory per domain (kebab-case), each with its types,
// its pipeline (lib/*-machine.ts) and small pure helpers (utils/). Backend
// routes validate writes with these; the SPA builds menus and labels from
// the same definitions, so the two cannot disagree about a state.
export * from "./pipeline/index.js";
export * from "./contact-status/index.js";
export * from "./outreach/index.js";
export * from "./video/index.js";
export * from "./call/index.js";
