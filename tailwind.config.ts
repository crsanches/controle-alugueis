import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#3C4A5E',
        paper: '#F8FAFC',
        paperDim: '#EAF0F6',
        accent: '#4A7FB5',
        accentLight: '#8FB8DE',
        sage: '#7FAE93',
        rust: '#D98C93',
        slate: '#64748B',
        hairline: '#E2E8F0',
      },
      fontFamily: {
        display: ['var(--font-manrope)', 'sans-serif'],
        sans: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
