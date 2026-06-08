# SPECTRE Design System

**Identity:** Ghost / Shadow Agent / Dark Ops — brutalist minimalist + full animation. Purple replaces traditional terminal green as primary accent.

## Color Palette

```css
:root {
  /* Background layers */
  --bg-void:      #030305;
  --bg-deep:      #07070F;
  --bg-surface:   #0D0D1A;
  --bg-elevated:  #121224;
  --bg-hover:     #1A1A2E;
  --bg-active:    #1E1E35;

  /* Purple spectrum */
  --purple-dim:   #2D1B69;
  --purple-mid:   #5B21B6;
  --purple-core:  #7C3AED;
  --purple-bright:#A78BFA;
  --purple-glow:  #C4B5FD;

  /* Utility */
  --green-term:   #39FF14;   /* sparingly */
  --cyan-data:    #00FFFF;   /* IPs, data */
  --red-alert:    #FF2D55;
  --amber-warn:   #FFB700;
  --blue-info:    #3B82F6;

  /* Text */
  --text-primary:   #E2E8F0;
  --text-secondary: #94A3B8;
  --text-muted:     #4A5568;
  --text-accent:    var(--purple-bright);

  /* Borders */
  --border-default: rgba(124, 58, 237, 0.15);
  --border-hover:   rgba(124, 58, 237, 0.35);
  --border-active:  rgba(124, 58, 237, 0.6);
  --border-glow:    rgba(167, 139, 250, 0.4);
}
```

## Typography

```css
--font-primary: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
--font-display: 'Space Grotesk', 'DM Mono', sans-serif;
--font-body:    'Inter', system-ui, sans-serif;

--text-xs:  11px;
--text-sm:  13px;
--text-md:  15px;
--text-lg:  18px;
--text-xl:  24px;
--text-2xl: 32px;
```

## Component Rules

| Component | Style |
|-----------|-------|
| Card | 2px radius, 3px purple left border |
| Button | Borderless or 1px thin border, uppercase mono |
| Input | Bottom-border only, dark bg, purple focus |
| Modal | Dark overlay, scanline background |
| Scrollbar | 4px thin, purple thumb |
| Table | Alternate row bg, purple dim hover |
| Badge | Mono font, outlined, color-coded |

## Key Animations

Use in `web/src/styles/animations.css`:

- `scanlines` — background overlay
- `cursor-blink` — terminal cursor
- `glitch` — text effect
- `pulse-purple` — active connections
- `data-stream` — sidebar decoration
- `connect-flash` — connection success
- `upload-shimmer` — progress bar
- `icon-ping` — sidebar hover
- `modal-in` — modal entrance
- `status-online` — status indicator

Use Framer Motion for React component transitions; CSS keyframes for ambient/decorative effects.

## xterm.js

Override in `web/src/styles/terminal.css` — purple-tinted theme, not default green-on-black.

```javascript
// TerminalPane theme
background: '#07070F', foreground: '#E2E8F0', cursor: '#A78BFA',
selectionBackground: 'rgba(124, 58, 237, 0.3)', magenta: '#A78BFA'
```

## Tailwind Config

Extend in `web/tailwind.config.ts`:

```typescript
colors: {
  void: '#030305', deep: '#07070F', surface: '#0D0D1A', elevated: '#121224',
  purple: { dim: '#2D1B69', mid: '#5B21B6', core: '#7C3AED', bright: '#A78BFA', glow: '#C4B5FD' },
  term: { green: '#39FF14', cyan: '#00FFFF', red: '#FF2D55', amber: '#FFB700' },
},
fontFamily: { mono: ['JetBrains Mono', 'Fira Code', 'monospace'], display: ['Space Grotesk'], body: ['Inter'] },
borderRadius: { brutal: '2px' },
boxShadow: { 'purple-sm': '0 0 8px rgba(124,58,237,0.4)', 'purple-md': '0 0 20px rgba(124,58,237,0.6)', glow: '0 0 20px rgba(167,139,250,0.5)' },
animation: { 'pulse-purple': '...', 'glitch': '...', 'status-ping': '...' },
```

Prefer CSS variables in `globals.css` for runtime theming; Tailwind tokens for utility classes.
