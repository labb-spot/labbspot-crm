/** @type {import('tailwindcss').Config} */
// Tailwind v3 config for LABB Spot. Replaces the runtime JIT CDN script
// at the top of index.html with a build-time precompiled stylesheet.
// Result: no MutationObserver scanning the DOM on every click, no JS
// JIT compiler running in users' browsers.
module.exports = {
  // Scan index.html for class names. The scanner reads the file as plain
  // text so it catches classes inside HTML attributes AND inside inline
  // <script> string templates.
  content: ['./index.html'],

  // Safelist — classes that get added so they're available even if the
  // scanner can't see them in the source (e.g. classes built dynamically
  // in JS like `'bg-' + colorName + '-500'`). The patterns below are
  // generous on purpose — they cost a few KB of CSS but eliminate the
  // most common "missing class" bugs after switching off the runtime
  // compiler. Add more here if a button or chip looks unstyled on the
  // live site after deploy.
  safelist: [
    {
      pattern: /(bg|text|border|ring)-(red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)/,
    },
    {
      // Opacity-modifier variants like bg-red-500/20
      pattern: /(bg|text|border)-(red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc)-(100|200|300|400|500|600|700|800|900)\/(10|15|20|25|30|40|50|60|70|75|80|90)/,
    },
  ],

  theme: { extend: {} },
  plugins: [],
}
