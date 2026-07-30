# KHEL-O Frontend Design System

## Overview
This document is the visual contract and design system definition for the KHEL-O marketplace frontend. Every screen, component, and layout must adhere strictly to these locked design specifications.

---

## 1. Theme
- **Base Theme**: Light Mode
- **Aesthetic**: Clean, modern, high-contrast, premium mobile-first marketplace design (softened dark text, zero childish neon glows).

---

## 2. Color Palette (Design Tokens)

| Token Name | Hex Value | Usage / Description |
| :--- | :--- | :--- |
| `primary` | `#10B981` | Emerald green — CTAs, active nav items, brand highlights |
| `primary-dark` | `#059669` | Darker emerald — hover and pressed states |
| `secondary` | `#1F2937` | Dark Slate — headers, high emphasis containers |
| `accent` | `#FC7C78` | Coral — alerts, urgent timers only |
| `surface` | `#F3F4F6` | Light Gray — global page background |
| `card` | `#FFFFFF` | Pure White — card containers, sheets, bottom bar |
| `text-primary` | `#111827` | Headlines, primary text (softened black) |
| `text-secondary` | `#4B5563` | Body text, subheaders, inactive icons |
| `text-technical` | `#10B981` | Technical data, prices, hardware specs, mono labels |
| `border` | `#E5E7EB` | Subtle card & container borders |
| `success` | `#10B981` | Success badges, confirmation indicators |
| `warning` | `#F59E0B` | Warning alerts, pending statuses |
| `error` | `#EF4444` | Error states, validation failures |

---

## 3. Typography
Loaded via `next/font/google`:

1. **Headings (`font-heading`)**: `Space Grotesk` (Weights: `500`, `600`, `700`)
2. **Body (`font-body`)**: `Plus Jakarta Sans` (Weights: `400`, `500`, `600`)
3. **Technical Data (`font-data`)**: `JetBrains Mono` (Weights: `400`, `500`) — Used for monetary amounts, hardware specs, countdown timers, booking references.

---

## 4. Border Radius Standards
- **Hero / Outer Container**: `24px` (`rounded-3xl`)
- **Card / Button**: `16px` (`rounded-2xl`)
- **Pills / Search Bars / Nav Badges**: `9999px` (`rounded-full`)

---

## 5. Elevation & Shadows
- **Card Shadow**: `shadow-md` (Soft, natural elevation, no colored neon glows)
- **Elevated Overlay**: `shadow-lg` (Modals, bottom sheets, sticky top/bottom bars)

---

## 6. Component Specs

### Buttons
- **Primary**: `bg-primary text-white rounded-2xl active:scale-95 transition-transform`
- **Secondary**: `bg-secondary text-white rounded-2xl active:scale-95 transition-transform`
- **Outline**: `border border-border text-secondary bg-white rounded-2xl active:scale-95 transition-transform`
- **Min Height**: `48px` minimum for mobile touch targets.

### Cards
- **Base Style**: `bg-card rounded-2xl border border-border shadow-md`

---

## 7. Tailwind CSS Configuration Extension

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary)',
          dark: 'var(--primary-dark)',
        },
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-technical': 'var(--text-technical)',
        border: 'var(--border)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
      },
      fontFamily: {
        heading: ['var(--font-space-grotesk)', 'sans-serif'],
        body: ['var(--font-plus-jakarta)', 'sans-serif'],
        data: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};
```

---

## 8. CSS Variables (`globals.css`)

```css
@layer base {
  :root {
    --primary: #10B981;
    --primary-dark: #059669;
    --secondary: #1F2937;
    --accent: #FC7C78;
    --surface: #F3F4F6;
    --card: #FFFFFF;
    --text-primary: #111827;
    --text-secondary: #4B5563;
    --text-technical: #10B981;
    --border: #E5E7EB;
    --success: #10B981;
    --warning: #F59E0B;
    --error: #EF4444;
  }
}
```
