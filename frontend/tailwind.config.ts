import type { Config } from 'tailwindcss';

/**
 * Cinema tokens. Pure black is the canvas because the customer is sitting in a
 * dark auditorium; surfaces sit only slightly above black so the screen emits
 * as little light as possible.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#000000',
        surface: {
          DEFAULT: '#121216',
          raised: '#1A1A20',
        },
        crimson: {
          DEFAULT: '#E50914',
          soft: '#FF2A4D',
        },
        ink: {
          DEFAULT: '#FFFFFF',
          muted: '#94A3B8',
          faint: '#64748B',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'sheet': '0 -8px 40px rgba(0, 0, 0, 0.72)',
        'pin': '0 0 30px rgba(229, 9, 20, 0.25)',
        'cta': '0 6px 20px rgba(229, 9, 20, 0.20)',
      },
      transitionTimingFunction: {
        // Apple-ish spring curve, but fast: nothing here exceeds 260ms.
        swift: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(2.1)', opacity: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
