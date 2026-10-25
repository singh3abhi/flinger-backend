/**
 * Drizzle schema. Tables land here module by module, starting with auth (users, identities,
 * refresh tokens) in phase P2. See docs/03-data-model.md for the planned tables.
 *
 * Rule: a module only touches its own tables. Each module owns a file in this folder and
 * re-exports it from here so Drizzle sees the whole schema.
 */
export {};
