// Shared domain core: backend and SPA import from here, never copy it.
// Boundary rule: this package imports nothing from backend/ or frontend/.
//
// NOTE: `./api` (the generated Twenty GraphQL client) is a separate export
// — see package.json exports — so consumers that only need domain logic
// never load the megabyte-sized generated schema.
export * from "./oauth.js";
export * from "./domains/index.js";
