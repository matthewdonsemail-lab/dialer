// Contact domain: one prospect or lead as a workspace (/contacts/:id, /leads/:id).
//   components/  screens and panes (kebab-case files)
//   lib/         data hooks (React Query) for this domain
//   types/       the Contact shape
//   utils/       pure helpers (no React, no I/O), unit-tested
export { ContactPage } from "./components/contact-page";
export type { Contact } from "./types/contact";
export { toContact, initials } from "./utils/to-contact";
