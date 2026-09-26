/** @type {import('tailwindcss').Config} */
export default {
  content: ["./frontend/index.html", "./frontend/src/**/*.{js,ts,jsx,tsx}"],
  safelist: [
    // Brand colors
    "bg-blue-50", "text-blue-600",
    "bg-emerald-50", "text-emerald-600",
    "bg-amber-50", "text-amber-600",
    "bg-green-50", "text-green-600",
    "bg-purple-50", "text-purple-600",
    "bg-brand-50", "text-brand-600",
    "bg-brand-100", "text-brand-600",
    "bg-red-500",
    "bg-blue-500",
    "bg-amber-500",
    "bg-gray-400",
    "bg-green-500",
    // UI primitive data attributes
    "ods-btn",
    "ods-input",
    "ods-badge",
    "ods-card",
    // Twenty design tokens
    "bg-surface-primary",
    "bg-surface-secondary",
    "bg-surface-tertiary",
    "border-subtle",
    "border-strong",
    "text-primary",
    "text-secondary",
    "text-tertiary",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        // Twenty-inspired surface colors
        surface: {
          primary: "var(--ods-bg-primary)",
          secondary: "var(--ods-bg-secondary)",
          tertiary: "var(--ods-bg-tertiary)",
        },
        // Border colors
        border: {
          subtle: "var(--ods-border)",
          strong: "var(--ods-border-strong)",
        },
        // Text colors
        text: {
          primary: "var(--ods-text-primary)",
          secondary: "var(--ods-text-secondary)",
          tertiary: "var(--ods-text-tertiary)",
        },
        // Semantic colors
        accent: {
          primary: "var(--ods-brand-600)",
          success: "var(--ods-success)",
          warning: "var(--ods-warning)",
          danger: "var(--ods-danger)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      spacing: {
        "sp-1": "var(--ods-sp-1)",
        "sp-2": "var(--ods-sp-2)",
        "sp-3": "var(--ods-sp-3)",
        "sp-4": "var(--ods-sp-4)",
        "sp-5": "var(--ods-sp-5)",
        "sp-6": "var(--ods-sp-6)",
        "sp-8": "var(--ods-sp-8)",
      },
      borderRadius: {
        "ods-xs": "var(--ods-radius-xs)",
        "ods-sm": "var(--ods-radius-sm)",
        "ods-md": "var(--ods-radius-md)",
        "ods-lg": "var(--ods-radius-lg)",
        "ods-pill": "var(--ods-radius-pill)",
      },
    },
  },
  plugins: [],
};
