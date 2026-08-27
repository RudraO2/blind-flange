/**
 * Blind Flange base plugin, host half.
 *
 * The empty apply gives the loader a host-side row for this package while the
 * browser half ships through `exports["./client"]`. Host-side work — the egress
 * denial waterfall, the canary tool, the model plane — hangs here in later
 * stories; this file exists now so the seam is real rather than promised.
 *
 * That the row mounts is checkable: Settings -> Plugins lists this package as
 * Mounted and Enabled once the profile carries its insert row.
 */

/** Host plugin body. This package contributes browser presentation only, so far. */
export function apply() {}
