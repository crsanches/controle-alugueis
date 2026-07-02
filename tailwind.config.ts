import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14231F',
        paper: '#F7F3EA',
        paperDim: '#EFEADC',
        terracotta: '#C1602C',
        sage: '#7A8B76',
        rust: '#A83232',
        slate: '#5B6B63',
        hairline: '#D8D2C2',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'serif'],
        sans: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
