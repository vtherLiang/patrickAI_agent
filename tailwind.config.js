/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"PingFang SC"',
          '"Helvetica Neue"',
          'sans-serif'
        ],
        mono: [
          '"SF Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace'
        ]
      },
      colors: {
        apple: {
          bg: '#000000',
          canvas: '#09090b',
          elevated: '#141417',
          card: 'rgba(28, 28, 32, 0.65)',
          border: 'rgba(255, 255, 255, 0.08)',
          blue: '#0A84FF',
          blueHover: '#409CFF',
          green: '#30D158',
          amber: '#FF9F0A',
          red: '#FF453A',
          indigo: '#5E5CE6',
          claude: '#E07A5F'
        }
      },
      transitionTimingFunction: {
        'apple-spring': 'cubic-bezier(0.32, 0.72, 0, 1)',
        'apple-out': 'cubic-bezier(0.22, 1, 0.36, 1)'
      }
    }
  },
  plugins: []
}
