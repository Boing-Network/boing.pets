/**
 * Schema version this build understands.
 * Load refuses a world whose `schemaVersion` is newer than this number.
 *
 * History:
 * - 1: initial world tables.
 * - 2: creature positions (`spot_x`, `spot_z`, `from_spot_x`, `from_spot_z`).
 *   Version-1 worlds still load: the host re-places their creatures
 *   deterministically and rewrites them as version 2.
 */
export const CURRENT_SCHEMA_VERSION = 2;
