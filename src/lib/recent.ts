// The last few formulas you opened, newest first — shown under "Recent" when
// the command palette is empty. Kept in localStorage so it survives reloads.

const KEY = 'derive-recent';
const MAX = 6;

export interface RecentItem {
  id: string;
  // Set when what was opened was one shape of a multi-shape card (the Sphere
  // of "Volume Formulas").
  variantIndex?: number;
}

export function getRecent(): RecentItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is RecentItem => typeof r?.id === 'string')
      .map((r) => ({ id: r.id, variantIndex: typeof r.variantIndex === 'number' ? r.variantIndex : undefined }))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function addRecent(item: RecentItem) {
  try {
    const rest = getRecent().filter((r) => !(r.id === item.id && r.variantIndex === item.variantIndex));
    localStorage.setItem(KEY, JSON.stringify([item, ...rest].slice(0, MAX)));
  } catch {
    // Storage unavailable: recents just don't persist.
  }
}
