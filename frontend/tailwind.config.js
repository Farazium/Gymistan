/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Accent palette, driven by CSS variables so each gym can pick its
        // brand color at runtime. Channels are set on :root (see index.css)
        // and swapped by src/utils/theme.js. rgb(var(--pN) / <alpha-value>)
        // keeps Tailwind opacity utilities (e.g. bg-primary-500/20) working.
        primary: {
          200: 'rgb(var(--p200) / <alpha-value>)',
          300: 'rgb(var(--p300) / <alpha-value>)',
          400: 'rgb(var(--p400) / <alpha-value>)',
          500: 'rgb(var(--p500) / <alpha-value>)',
          600: 'rgb(var(--p600) / <alpha-value>)',
          700: 'rgb(var(--p700) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
