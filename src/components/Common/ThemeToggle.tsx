import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            onClick={toggleTheme}
            className={`flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 shadow-xl border border-white/20 z-[99999] ${isDark ? 'bg-slate-800 text-yellow-400' : 'bg-white text-indigo-600'} ${className}`}
            aria-label="Toggle Theme"
        >
            <i className={`fas ${isDark ? 'fa-moon' : 'fa-sun'} text-xl`}></i>
        </button>
    );
};

export default ThemeToggle;
