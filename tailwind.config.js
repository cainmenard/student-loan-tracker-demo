/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 50: '#f0f2f8', 100: '#d9dded', 200: '#b3bbdb', 300: '#8d99c9', 400: '#6777b7', 500: '#3D5A99', 600: '#2C3E6B', 700: '#1B2A4A', 800: '#111c33', 900: '#080e1a' },
      }
    }
  },
  plugins: [],
}
