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
};
