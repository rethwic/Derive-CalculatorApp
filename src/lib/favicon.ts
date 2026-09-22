import type { Accent, Theme } from './theme';

// The tab icon is generated at runtime instead of being a static file, so it
// always matches whichever accent color and light/dark theme is active — the
// same "D" mark from public/favicon.svg, simplified to one gradient-filled
// shape (the original's many blurred, individually-colored blobs can't be
// recolored per theme in any way that still looks intentional at 16px).
const LOGO_PATH =
  'M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z';

// The light end and dark end of each accent's gradient — the same hex pairs
// as --brand-a/--brand-b in index.css for that [data-accent][data-theme]
// combination, kept here as plain data so both this module and index.html's
// pre-paint script (which runs before any module import) can use them without
// waiting on a stylesheet or a computed style read.
export const FAVICON_COLORS: Record<Accent, Record<Theme, [string, string]>> = {
  iris: { light: ['#60a5fa', '#4f46e5'], dark: ['#7cb4ff', '#7376f5'] },
  ember: { light: ['#ff9a3c', '#e4472b'], dark: ['#ffb066', '#f2683f'] },
  forest: { light: ['#34d399', '#178a4a'], dark: ['#6ee7b7', '#2ea867'] },
  rose: { light: ['#f472b6', '#db2777'], dark: ['#f9a8d4', '#e8579c'] },
};

function buildFaviconSvg(theme: Theme, accent: Accent): string {
  const [from, to] = FAVICON_COLORS[accent][theme];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 46">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="48" y2="46" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<path fill="url(#g)" d="${LOGO_PATH}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function applyFavicon(theme: Theme, accent: Accent) {
  if (typeof document === 'undefined') return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = buildFaviconSvg(theme, accent);
}
