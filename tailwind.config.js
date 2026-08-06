/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        onion: {
          bg: '#0A0A0B',
          elevated: '#161418',
          card: '#1D1A20',
          primary: '#F2EFEA',
          muted: '#948E96',
          accent: '#C1443B',
          'accent-hover': '#D64D43',
          gold: '#D9A441',
          border: '#2A262E',
          'border-light': '#3D3843',
        }
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite',
      }
    },
  },
  plugins: [],
}
