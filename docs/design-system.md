# Interface system

CODET-ADE defaults to dark mode, including native Electron controls. The visual references are [Vercel Design / Geist](https://vercel.com/design) and [BoardUI](https://www.boardui.com/). The implementation adapts their neutral surface hierarchy, restrained borders, typography, compact navigation, and rounded controls to a desktop workspace; it does not import either site's paid components.

Shared semantic colors live at the start of `src/styles.css`: canvas, surface, raised surface, hover surface, borders, primary/secondary/muted text, and accent. Geist Variable is bundled locally. Blue identifies links and browser groups; green is reserved for connected status. Primary actions use a high-contrast neutral fill.

Keep browser content edge-to-edge, with compact tab and address bars. Use 6–8 px corners for small controls, 12 px for cards, and 16 px for composers. Navigation and metadata use 11–13 px text; headings use 16–25 px. Avoid decorative copy or large workspace headers.

Inputs use a soft shadow on their wrapper via `:focus-within`, never a direct input outline, ring, or focus border. Buttons retain visible keyboard focus. Motion respects reduced-motion preferences. User message actions remain outside the bubble and appear on hover or keyboard focus; activity stays collapsed by default.
