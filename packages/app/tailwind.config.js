/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rivus: {
          bg: "#080b14",
          card: "#0e1320",
          border: "#1c2538",
          blue: "#3b82f6",
          cyan: "#06b6d4",
          purple: "#8b5cf6",
          green: "#10b981",
          amber: "#f59e0b",
          red: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};