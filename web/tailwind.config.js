/** Design tokens mirror docs/design.md Part B. Do not add ad-hoc hex values in components. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#14532D', 700: '#166534', tint: '#34D399' },
        secondary: { DEFAULT: '#10B981', strong: '#047857' },
        accent: { DEFAULT: '#A3E635' },
        canvas: { DEFAULT: '#F5F8F5', dark: '#0B1712' },
        ink: { DEFAULT: '#1F2937', muted: '#6B7280' },
        success: '#16A34A',
        warning: '#D97706',
        danger: '#DC2626',
        info: '#0284C7',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        numeric: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { sm: '10px', md: '16px', lg: '24px', xl: '32px' },
      boxShadow: {
        e1: '0 4px 16px rgba(20,83,45,0.08)',
        e2: '0 8px 32px rgba(20,83,45,0.12)',
        e3: '0 24px 64px rgba(0,0,0,0.20)',
        glow: '0 0 40px rgba(163,230,53,0.35)',
      },
      transitionTimingFunction: { standard: 'cubic-bezier(.2,.8,.2,1)' },
    },
  },
  plugins: [],
};
