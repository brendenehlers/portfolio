/** @type {import('tailwindcss').Config} */
export default {
  content: ["index.html", "index.css", "styles/**/*.css"],
  theme: {
    extend: {
      colors: {
        socialLinkHighlight: "#3b82f6",
        bottomHighlight: "#be4bff",
        background: "black",
        text: "white",
      },
    },
  },
  variants: {
    extend: {
      "inline-block": ['group-hover'],
    },
  },
  plugins: [],
}