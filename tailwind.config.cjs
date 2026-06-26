/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          'SUIT',
          'Noto Sans KR',
          'Segoe UI',
          'system-ui',
          'sans-serif'
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      borderRadius: {
        sm: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px'
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.04)',
        panel:
          '0 16px 40px -14px rgba(16,24,40,0.18), 0 6px 16px -10px rgba(16,24,40,0.12), 0 0 0 1px rgba(16,24,40,0.03)'
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.2, 0, 0, 1)'
      }
    }
  },
  plugins: []
};
