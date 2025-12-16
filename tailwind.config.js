/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class', // Enable dark mode based on the 'dark' class on the HTML element
  theme: {
    extend: {
      colors: {
        // Theme colors will be dynamically applied via CSS variables
        // These are fallback colors if CSS variables aren't available
        'theme-bg-from': 'var(--theme-bg-from, rgb(239 246 255))', // blue-50 default
        'theme-bg-to': 'var(--theme-bg-to, rgb(250 250 250))', // white default
        'theme-primary-from': 'var(--theme-primary-from, rgb(59 130 246))', // blue-500 default
        'theme-primary-to': 'var(--theme-primary-to, rgb(147 51 234))', // purple-600 default
        'theme-accent': 'var(--theme-accent, rgb(37 99 235))', // blue-600 default
      },
    },
  },
  plugins: [],
};
