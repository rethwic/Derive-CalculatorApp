import { openCommandPalette } from './CommandPalette';

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// The workspace's "add a formula" button. It opens the same command palette as
// everywhere else, in a mode where picking a formula pins it to the workspace,
// growing out of this button and shrinking back into it.
export function WorkspaceSearchLauncher() {
  return (
    <button
      type="button"
      className="workspace-edge-icon glass"
      aria-label="Add a formula"
      onClick={(e) => openCommandPalette('pin', e.currentTarget)}
    >
      <SearchIcon />
    </button>
  );
}
