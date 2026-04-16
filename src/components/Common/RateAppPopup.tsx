// src/components/Common/RateAppPopup.tsx
//
// LABOUR-APP SYSTEM — Periodic "Rate the App" Popup
//
// Timing rules:
//   • Appears twice per month (~every 15 days) if user hasn't rated
//   • "Rate Later" → reappears 4 days later
//   • After submitting a rating → reappears once every 2 months (60 days)
//
// Saves to Supabase `user_stories` table.

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';
import { showToast } from './Toast';

// ── Timing constants (milliseconds) ──────────────────────────────────────────
const FIFTEEN_DAYS = 15 * 24 * 60 * 60 * 1000;  // ~twice a month
const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;      // "Rate Later" deferral
const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;    // Post-rating cooldown (2 months)

// ── localStorage key helpers ─────────────────────────────────────────────────
const getKey = (userId: string, suffix: string) => `labour_rating_${suffix}_${userId}`;

function getNextShowTime(userId: string): number | null {
    const raw = localStorage.getItem(getKey(userId, 'next_show'));
    return raw ? parseInt(raw, 10) : null;
}

function setNextShowTime(userId: string, timestamp: number) {
    localStorage.setItem(getKey(userId, 'next_show'), String(timestamp));
}

function setRatingStatus(userId: string, status: 'rated' | 'deferred') {
    localStorage.setItem(getKey(userId, 'status'), status);
}

// ── Avatar initials helper ───────────────────────────────────────────────────
function getInitials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0]?.[0] || 'U').toUpperCase();
}

// ── Capitalize role ──────────────────────────────────────────────────────────
function formatRole(role: string): string {
    if (!role) return 'Staff';
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

// ── Component ────────────────────────────────────────────────────────────────
export const RateAppPopup: React.FC = () => {
    const { user, isAuthenticated } = useAuth();
    const [visible, setVisible] = useState(false);
    const [animateIn, setAnimateIn] = useState(false);
    const [rating, setRating] = useState(0);
    const [hoveredStar, setHoveredStar] = useState(0);
    const [quote, setQuote] = useState('');
    const [schoolName, setSchoolName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Fetch school name from local Dexie DB
    useEffect(() => {
        if (!user?.schoolId) return;
        db.schools.toArray().then(schools => {
            const match = schools.find(s => s.idCloud === user.schoolId || s.schoolId === user.schoolId);
            if (match) setSchoolName(match.schoolName);
        }).catch(() => { /* offline-safe */ });
    }, [user?.schoolId]);

    // Timing check: should we show the popup?
    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;

        const userId = user.id;
        const now = Date.now();
        let nextShow = getNextShowTime(userId);

        // First time ever — schedule for 15 days from now
        if (nextShow === null) {
            nextShow = now + FIFTEEN_DAYS;
            setNextShowTime(userId, nextShow);
            return; // Don't show on first load
        }

        // Guard: if nextShow is unreasonably far in the past (> 90 days ago)
        // it's a stale/corrupt value — reset it to avoid instant-popup trap
        if (nextShow < now - (90 * 24 * 60 * 60 * 1000)) {
            setNextShowTime(userId, now + FIFTEEN_DAYS);
            return;
        }

        // Is it time?
        if (now >= nextShow) {
            // Small delay so the dashboard loads first
            const timer = setTimeout(() => {
                setVisible(true);
                // Frame delay so the DOM can mount before we trigger CSS transition
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => setAnimateIn(true));
                });
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isAuthenticated, user?.id]);

    // ── Close / Dismiss (same as "Rate Later") ───────────────────────────────
    const handleDismiss = useCallback(() => {
        if (!user?.id) return;
        setAnimateIn(false);
        setTimeout(() => {
            setVisible(false);
            // Schedule to reappear 4 days later
            setNextShowTime(user.id, Date.now() + FOUR_DAYS);
            setRatingStatus(user.id, 'deferred');
        }, 350);
    }, [user?.id]);

    // ── "Rate Later" button ──────────────────────────────────────────────────
    const handleRateLater = useCallback(() => {
        handleDismiss();
    }, [handleDismiss]);

    // ── Submit Rating ────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!user || rating === 0) return;

        setSubmitting(true);
        try {
            const initials = getInitials(user.fullName);
            const position = formatRole(user.role);

            const { error } = await supabase.from('user_stories').insert({
                id: crypto.randomUUID(),
                full_name: user.fullName,
                position: position,
                school_name: schoolName || 'Unknown School',
                quote: quote.trim() || `I rate this app ${rating} out of 5 stars.`,
                star_rating: rating,
                avatar_initials: initials,
            });

            if (error) throw error;

            // Mark as rated — next show in 60 days (2 months)
            setNextShowTime(user.id, Date.now() + SIXTY_DAYS);
            setRatingStatus(user.id, 'rated');

            setSubmitted(true);

            // Auto-close after celebration
            setTimeout(() => {
                setAnimateIn(false);
                setTimeout(() => setVisible(false), 350);
            }, 2500);

        } catch (err) {
            console.error('[RateAppPopup] Submit error:', err);
            showToast('Could not submit your rating. Please check your internet connection.', 'error');
        } finally {
            setSubmitting(false);
        }
    }, [user, rating, quote, schoolName]);

    // ── Don't render if not visible or not authenticated ─────────────────────
    if (!visible || !isAuthenticated || !user) return null;

    return (
        <div
            className={`fixed inset-0 z-[9998] flex items-center justify-center p-4 transition-all duration-350
                ${animateIn ? 'bg-black/40 backdrop-blur-sm pointer-events-auto' : 'bg-transparent pointer-events-none'}`}
            onClick={animateIn ? handleDismiss : undefined}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden transition-all duration-500 ease-out
                    ${animateIn ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-8'}`}
                style={{ boxShadow: '0 32px 64px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04)' }}
            >
                {/* ── Gradient Header ── */}
                <div className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 px-8 pt-8 pb-12 text-center overflow-hidden">
                    {/* Decorative circles */}
                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full"></div>
                    <div className="absolute -bottom-8 -left-4 w-20 h-20 bg-white/10 rounded-full"></div>
                    <div className="absolute top-4 left-8 w-3 h-3 bg-white/30 rounded-full animate-pulse"></div>
                    <div className="absolute bottom-6 right-12 w-2 h-2 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>

                    {/* Close button */}
                    <button
                        onClick={handleDismiss}
                        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white/80 hover:text-white transition-all"
                    >
                        <i className="fas fa-xmark text-sm"></i>
                    </button>

                    {/* Icon */}
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm mb-4">
                        {submitted
                            ? <i className="fas fa-heart text-3xl text-white animate-bounce"></i>
                            : <i className="fas fa-star text-3xl text-yellow-300 animate-pulse"></i>
                        }
                    </div>

                    <h2 className="text-2xl font-black text-white tracking-tight">
                        {submitted ? 'Thank You! 🎉' : 'Enjoying Labour Edu?'}
                    </h2>
                    <p className="text-white/80 text-sm font-medium mt-1.5 max-w-xs mx-auto">
                        {submitted
                            ? 'Your feedback helps us build a better system for every school.'
                            : 'Take a moment to rate your experience. Your feedback shapes the future of education.'
                        }
                    </p>
                </div>

                {/* ── Body ── */}
                {!submitted ? (
                    <div className="px-8 pb-8 -mt-6">
                        {/* Rating card */}
                        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 shadow-sm">
                            {/* Star Rating */}
                            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 text-center">
                                Tap to Rate
                            </p>
                            <div className="flex items-center justify-center gap-2 mb-5">
                                {[1, 2, 3, 4, 5].map(star => {
                                    const isFilled = star <= (hoveredStar || rating);
                                    return (
                                        <button
                                            key={star}
                                            onMouseEnter={() => setHoveredStar(star)}
                                            onMouseLeave={() => setHoveredStar(0)}
                                            onClick={() => setRating(star)}
                                            className={`text-3xl transition-all duration-200 transform hover:scale-125 active:scale-95
                                                ${isFilled ? 'text-yellow-400 drop-shadow-md' : 'text-gray-300 hover:text-yellow-300'}`}
                                            style={isFilled ? { filter: 'drop-shadow(0 2px 4px rgba(251, 191, 36, 0.4))' } : {}}
                                        >
                                            <i className={`fa${isFilled ? 's' : 'r'} fa-star`}></i>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Rating label */}
                            <div className="text-center mb-4">
                                {rating > 0 && (
                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold
                                        ${rating >= 4 ? 'bg-emerald-100 text-emerald-700' :
                                          rating >= 3 ? 'bg-amber-100 text-amber-700' :
                                          'bg-red-100 text-red-700'}`}>
                                        {rating === 5 ? '⭐ Outstanding!' :
                                         rating === 4 ? '👏 Great!' :
                                         rating === 3 ? '👍 Good' :
                                         rating === 2 ? '😐 Could be better' :
                                         '😟 Needs improvement'}
                                    </span>
                                )}
                            </div>

                            {/* Feedback textarea */}
                            <textarea
                                value={quote}
                                onChange={(e) => setQuote(e.target.value)}
                                placeholder="Tell us about your experience... (optional)"
                                rows={3}
                                className="w-full px-4 py-3 rounded-xl bg-white border-2 border-gray-100 focus:border-indigo-400 focus:bg-white focus:outline-none transition-all text-sm font-medium text-gray-700 placeholder:text-gray-400 resize-none"
                            />

                            {/* User info preview */}
                            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-black shadow-md">
                                    {getInitials(user.fullName)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-800 truncate">{user.fullName}</p>
                                    <p className="text-xs text-gray-400 font-medium truncate">
                                        {formatRole(user.role)} {schoolName ? `· ${schoolName}` : ''}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2.5 mt-5">
                            <button
                                onClick={handleSubmit}
                                disabled={rating === 0 || submitting}
                                className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 shadow-lg
                                    ${rating > 0
                                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-xl hover:shadow-indigo-200 active:scale-[0.98]'
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}`}
                            >
                                {submitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <i className="fas fa-circle-notch fa-spin"></i>
                                        Submitting...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <i className="fas fa-paper-plane"></i>
                                        Submit Rating
                                    </span>
                                )}
                            </button>

                            <button
                                onClick={handleRateLater}
                                className="w-full py-3 rounded-2xl font-semibold text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
                            >
                                <i className="fas fa-clock mr-1.5"></i>
                                Remind Me Later
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── Thank You State ── */
                    <div className="px-8 pb-8 -mt-6">
                        <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100 text-center">
                            <div className="flex items-center justify-center gap-1 mb-3">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <i
                                        key={star}
                                        className={`fas fa-star text-2xl ${star <= rating ? 'text-yellow-400' : 'text-gray-200'}`}
                                    ></i>
                                ))}
                            </div>
                            <p className="text-emerald-700 font-bold text-sm">
                                You rated us {rating}/5
                            </p>
                            <p className="text-emerald-600/70 text-xs font-medium mt-1">
                                Your story will inspire others!
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RateAppPopup;
