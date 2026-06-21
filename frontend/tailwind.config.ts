import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-canvas)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        'text-primary': 'var(--color-ink)',
        'text-secondary': 'var(--color-ink-secondary)',
        ink: 'var(--color-ink)',
        'ink-secondary': 'var(--color-ink-secondary)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          bg: 'var(--color-accent-bg)',
          text: 'var(--color-accent-text)',
        },
        'accent-blue': {
          bg: 'var(--color-majority-bg)',
          text: 'var(--color-majority-text)',
        },
        'accent-amber': {
          bg: 'var(--color-minority-bg)',
          text: 'var(--color-minority-text)',
        },
        'accent-green': {
          bg: 'var(--color-ability-bg)',
          text: 'var(--color-ability-text)',
        },
        'accent-red': {
          bg: 'var(--color-bias-bg)',
          text: 'var(--color-bias-text)',
        },
        success: {
          text: 'var(--color-success-text)',
          bg: 'var(--color-success-bg)',
        },
        error: {
          text: 'var(--color-error-text)',
          bg: 'var(--color-error-bg)',
        },
        warning: {
          text: 'var(--color-warning-text)',
          bg: 'var(--color-warning-bg)',
        },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        serif: 'var(--font-serif)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        hero: ['2rem', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '400' }],
        section: ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.02em', fontWeight: '500' }],
        label: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.08em', fontWeight: '600' }],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        btn: 'var(--radius-sm)',
        tag: 'var(--radius-full)',
        kbd: '4px',
      },
      boxShadow: {
        'card-hover': '0 2px 8px rgba(0, 0, 0, 0.04)',
        'surface': '0 1px 3px rgba(0, 0, 0, 0.06)',
        'drawer': '0 -4px 24px rgba(0, 0, 0, 0.08)',
      },
      spacing: {
        section: '3rem',
        'card-pad': '1.5rem',
        nav: 'var(--nav-height)',
        sidebar: 'var(--sidebar-width)',
      },
    },
  },
  plugins: [],
};

export default config;
