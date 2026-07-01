export * from "./utils/base";
export * from "./utils/fragment";
export * from "./utils/host";
export * from "./utils/join";
export * from "./utils/normalize";
export * from "./utils/path-parameters";
// Barrel — public API surface identical to the pre-split monolith.
// New utilities should be added to the appropriate per-group file
// under src/utils/, not appended here. See advisor-plans/011-tech-debt-refactor.md.
export * from "./utils/predicates";
export * from "./utils/protocol";
export * from "./utils/query-ops";
export * from "./utils/slash";
// _modify.ts intentionally NOT re-exported — it is an internal helper.
