import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* ── Colors ── */
      colors: {
        primary: {
          DEFAULT: 'var(--primary)',
          dark: 'var(--primary-dark)',
        },
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-technical': 'var(--text-technical)',
        border: 'var(--border)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
      },

      /* ── Typography ── */
      fontFamily: {
        heading: ['var(--font-space-grotesk)', 'sans-serif'],
        body: ['var(--font-plus-jakarta)', 'sans-serif'],
        data: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      fontSize: {
        /* Display — login hero headline */
        'display': ['2rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        /* H1 — page titles */
        'h1': ['1.5rem', { lineHeight: '1.2', fontWeight: '700' }],
        /* H2 — section titles */
        'h2': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        /* H3 — card titles */
        'h3': ['1rem', { lineHeight: '1.3', fontWeight: '600' }],
        /* H4 — subsections */
        'h4': ['0.875rem', { lineHeight: '1.3', fontWeight: '600' }],
        /* Body default */
        'body': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        /* Body emphasis */
        'body-emphasis': ['0.875rem', { lineHeight: '1.5', fontWeight: '500' }],
        /* Caption */
        'caption': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
        /* Overline / Label */
        'overline': ['0.625rem', { lineHeight: '1.2', letterSpacing: '0.05em', fontWeight: '600' }],
        /* Price large (KPI values) */
        'price-lg': ['1.75rem', { lineHeight: '1.1', fontWeight: '700' }],
        /* Price inline */
        'price-sm': ['0.8rem', { lineHeight: '1.3', fontWeight: '600' }],
        /* Reference code */
        'ref': ['0.7rem', { lineHeight: '1.2', letterSpacing: '0.05em', fontWeight: '400' }],
        /* Badge / pill */
        'badge': ['0.625rem', { lineHeight: '1', fontWeight: '600' }],
        /* Button label */
        'btn': ['0.875rem', { lineHeight: '1', fontWeight: '500' }],
      },

      /* ── Spacing (8px base grid) ── */
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '9': '36px',
        '10': '40px',
        '12': '48px',
        '14': '56px',
        '16': '64px',
        '18': '72px',
        '20': '80px',
        '24': '96px',
      },

      /* ── Border Radius ── */
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
      },

      /* ── Shadows (3 elevation levels) ── */
      boxShadow: {
        card: 'var(--shadow-card)',
        float: 'var(--shadow-float)',
        overlay: 'var(--shadow-overlay)',
      },

      /* ── Animation Durations ── */
      transitionDuration: {
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
        slow: 'var(--duration-slow)',
      },

      /* ── Easing ── */
      transitionTimingFunction: {
        'ease-out-expo': 'var(--ease-out)',
        'ease-in': 'var(--ease-in)',
        'ease-in-out': 'var(--ease-in-out)',
      },

      /* ── Z-Index ── */
      zIndex: {
        dropdown: 'var(--z-dropdown)',
        sticky: 'var(--z-sticky)',
        nav: 'var(--z-nav)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
      },

      /* ── Max Width ── */
      maxWidth: {
        content: 'var(--content-max-width)',
        owner: 'var(--owner-max-width)',
        admin: 'var(--admin-max-width)',
      },

      /* ── Width ── */
      width: {
        sidebar: 'var(--sidebar-width)',
        'owner-sidebar': 'var(--owner-sidebar-width)',
      },

      /* ── Padding for sidebar offsets ── */
      padding: {
        sidebar: 'var(--sidebar-width)',
        'owner-sidebar': 'var(--owner-sidebar-width)',
      },

      /* ── Height ── */
      height: {
        nav: 'var(--nav-height)',
        'bottom-nav': 'var(--bottom-nav-height)',
      },

      /* ── Min Height ── */
      minHeight: {
        btn: 'var(--button-min-height)',
        input: 'var(--input-height)',
      },

      /* ── Keyframes for skeleton pulse ── */
      keyframes: {
        'skeleton-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'skeleton-pulse': 'skeleton-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
