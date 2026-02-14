/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Gen3', 'ui-sans-serif', 'system-ui'],
        mono: ['Gen3', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [require("daisyui")],
  extend: {
    keyframes: {
      toastInOut: {
        '0%':   { transform: 'translateY(-120%)', opacity: '0' },
        '10%':  { transform: 'translateY(0)', opacity: '1' },
        '90%':  { transform: 'translateY(0)', opacity: '1' },
        '100%': { transform: 'translateY(-120%)', opacity: '0' },
      },
    },
    animation: {
      toastInOut: 'toastInOut 3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
    },
  }
};
