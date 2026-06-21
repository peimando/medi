/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent: {
          50: '#e8f7ff',
          100: '#b3e4ff',
          200: '#80d2ff',
          300: '#4dbfff',
          400: '#26aeff',
          500: '#0095eb',
          600: '#0078c2',
          700: '#005c99',
          800: '#004070',
          900: '#002647',
        },
        blue: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e3a5f',
          900: '#172554',
        },
      },
    },
  },
  plugins: [],
};
