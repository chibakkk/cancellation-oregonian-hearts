/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        card: {
          red: "#dc2626",
          black: "#1f2937",
          back: "#f3f4f6",
        },
        game: {
          primary: "#7c3aed",
          secondary: "#059669",
          accent: "#dc2626",
        },
      },
      animation: {
        "card-flip": "cardFlip 0.6s ease-in-out",
        "card-deal": "cardDeal 0.3s ease-out",
        "card-hover": "cardHover 0.2s ease-in-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "bounce-slow": "bounce 2s infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        cardFlip: {
          "0%": { transform: "rotateY(0deg)" },
          "100%": { transform: "rotateY(180deg)" },
        },
        cardDeal: {
          "0%": {
            transform: "translateY(-100px) rotate(10deg)",
            opacity: "0",
          },
          "100%": {
            transform: "translateY(0) rotate(0deg)",
            opacity: "1",
          },
        },
        cardHover: {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans JP", "system-ui", "sans-serif"],
        mont: ["Montserrat", "Inter", "Noto Sans JP", "sans-serif"],
        jp: ["Noto Sans JP", "Inter", "sans-serif"],
        card: ["Georgia", "serif"],
        game: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        "card-hover":
          "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        game: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
