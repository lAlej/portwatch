/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:     'var(--color-paper)',
        panel:  'var(--color-paper-2)',
        raised: 'var(--color-paper-3)',
        line:   'var(--color-rule)',
        muted:  'var(--color-muted)',
        text:   'var(--color-ink)',
        heading:'var(--color-ink-2)',
        ink:    'var(--color-ink)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          soft:    'var(--color-accent-soft)',
          ink:     'var(--color-accent-ink)',
          glow:    'oklch(50% 0.22 255 / 0.18)',
        },
        state: {
          running:    'var(--color-state-running)',
          paused:     'var(--color-state-paused)',
          exited:     'var(--color-state-exited)',
          error:      'var(--color-state-error)',
          restarting: 'var(--color-state-restarting)',
        },
      },
      fontFamily: {
        sans: ['Inter Tight', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card:  'var(--radius-card)',
        pill:  'var(--radius-pill)',
        input: 'var(--radius-input)',
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.35' },
        },
      },
      animation: {
        'pulse-live': 'pulse-live 1.6s var(--ease-in-out) infinite',
      },
      transitionTimingFunction: {
        out:    'cubic-bezier(0.16, 1, 0.3, 1)',
        in:     'cubic-bezier(0.7, 0, 0.84, 0)',
        'in-out':'cubic-bezier(0.65, 0, 0.35, 1)',
      },
    },
  },
  plugins: [],
};