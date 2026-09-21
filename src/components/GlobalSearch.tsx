import { openCommandPalette } from './CommandPalette';

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// The search bar on the landing and subject pages. It isn't an input any more:
// it's the doorway to the command palette (the same one Ctrl/⌘ + K opens), so
// there's a single search experience across the site.
export function GlobalSearch() {
  return (
    <div className="global-search">
      <div
        className="search-bar glass"
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        aria-label="Search formulas, symbols, topics"
        onClick={(e) => openCommandPalette('search', e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openCommandPalette('search', e.currentTarget);
          }
        }}
      >
        <SearchIcon />
        <span className="search-bar-placeholder">Search formulas, symbols, topics…</span>
        <kbd className="search-kbd" aria-hidden="true">
          {/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}
        </kbd>
      </div>
    </div>
  );
}
