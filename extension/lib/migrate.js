// The extension was renamed (formerly "Attune"). Labels, preferences, mascot position and suggestion state saved
// before the rename live under the legacy 'attune.*' keys in chrome.storage.local; move them to 'tempoloon.*' once so
// nothing is lost. Pure planning function (unit-tested) + a thin chrome.storage wrapper.
export const KEY_PREFIX = 'tempoloon.';
export const LEGACY_PREFIX = 'attune.';

/** Given every stored item, return what to write and which legacy keys to remove. A value already under the new key wins. */
export function planKeyMigration(all) {
  const set = {}, remove = [];
  for (const [k, v] of Object.entries(all || {})) {
    if (!k.startsWith(LEGACY_PREFIX)) continue;
    const nk = KEY_PREFIX + k.slice(LEGACY_PREFIX.length);
    if (!(nk in all) && v !== undefined) set[nk] = v;
    remove.push(k);
  }
  return { set, remove };
}

/** Run the migration on a chrome.storage area (chrome.storage.local). Writes first, removes only after the write. */
export async function migrateStorage(area) {
  if (!area?.get) return 0;
  const { set, remove } = planKeyMigration(await area.get(null));
  if (Object.keys(set).length) await area.set(set);
  if (remove.length) await area.remove(remove);
  return Object.keys(set).length;
}
