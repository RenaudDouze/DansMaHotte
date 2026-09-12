// Petit jeu d'icônes SVG cohérentes (trait 2px, currentColor) pour remplacer
// les emoji dans l'interface : rendu identique sur toutes les plateformes,
// contrairement aux polices d'emoji système qui varient beaucoup.

function svg(inner: string, { filled = false }: { filled?: boolean } = {}): string {
  const style = filled
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" width="1em" height="1em" ${style} aria-hidden="true" focusable="false">${inner}</svg>`;
}

export const icons = {
  back: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  share: svg(
    '<path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 5"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19"/>',
  ),
  more: svg('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>', { filled: true }),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  trash: svg(
    '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  ),
  gripVertical: svg(
    '<circle cx="9" cy="5" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="9" cy="19" r="1.3"/><circle cx="15" cy="5" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="15" cy="19" r="1.3"/>',
    { filled: true },
  ),
  gift: svg(
    '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13"/><path d="M3 12h18"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  ),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>'),
  image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  link: svg(
    '<path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 5"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19"/>',
  ),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  ),
  moon: svg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
  themeAuto: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
  ),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  star: svg('<path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.1 6.6-5.8-3.1-5.8 3.1 1.1-6.6-4.8-4.7 6.6-.9z"/>'),
  starFilled: svg('<path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.1 6.6-5.8-3.1-5.8 3.1 1.1-6.6-4.8-4.7 6.6-.9z"/>', { filled: true }),
  users: svg(
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  ),
  sort: svg('<path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg(
    '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
  ),
  checkCircle: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
  download: svg('<path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>'),
  upload: svg('<path d="M12 20V7"/><path d="m7 12 5-5 5 5"/><path d="M4 21h16"/>'),
  lock: svg('<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
} as const;

export type IconName = keyof typeof icons;
