/**
 * Drizzle schema. Each module owns its tables in its own file here and re-exports it below so
 * Drizzle sees the whole schema. Rule: a module only touches its own tables.
 * See docs/03-data-model.md for the planned tables.
 */
export * from './users';
export * from './auth';
export * from './profiles';
export * from './photos';
export * from './matching';
