/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        claude: {
          bg: '#0d0f12',
          panel: '#14171c',
          card: '#1b1f27',
          border: '#282e39',
          accent: '#d97757',
          accentHover: '#e58869'
        }
      }
    }
  },
  plugins: []
}
