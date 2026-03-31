/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#3b82f6',
                secondary: '#1e293b',
            },
            fontFamily: {
                sans: ['Outfit', 'sans-serif'],
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                zoomIn: {
                    '0%': { transform: 'scale(0.95)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                }
            },
            animation: {
                fadeIn: 'fadeIn 0.5s ease-out',
                zoomIn: 'zoomIn 0.5s ease-out',
            }
        },
    },
    plugins: [],
}
