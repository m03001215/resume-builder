/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'hsl(210 20% 98%)',
        primary: 'hsl(224 76% 48%)',
        dark: 'hsl(222 47% 11%)',
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(15, 23, 42, 0.25)',
      },
    },
  },
  plugins: [],
}
