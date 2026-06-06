// src/components/ParentPortal/ParentDashboard.tsx
//
// LABOUR-APP SYSTEM — Parent Portal Unified Dashboard
//
// A state-of-the-art, high-fidelity experience featuring multi-sibling selectors,
// offline-first cached report cards, SVG performance charts, payment receipt ledgers,
// announcement boards, and attendance calendars.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useParentAuth } from '../../hooks/useParentAuth';
import { showToast } from '../Common/Toast';
import type { ParentChild } from '../../hooks/ParentAuthContext';

/**
 * Resolves a student photo to a displayable URL.
 * - base64 strings (data:image/...) → returned as-is
 * - full http/https URLs              → returned as-is
 * - Supabase storage paths            → converted to public URL via getPublicUrl()
 */
function resolvePhotoUrl(photoUrl: string | undefined): string | undefined {
    if (!photoUrl) return undefined;
    if (photoUrl.startsWith('data:') || photoUrl.startsWith('http')) return photoUrl;
    // It's a raw storage path like "{schoolId}/students/timestamp_file.png"
    const { data } = supabase.storage.from('school-assets').getPublicUrl(photoUrl);
    return data?.publicUrl || undefined;
}

type ParentTab = 'overview' | 'academics' | 'financials' | 'attendance' | 'announcements';

interface ResultRecord {
    subject_name: string;
    ca_total: number;
    exam_score: number;
    total_score: number;
    grade: string;
    remarks: string;
    term: string;
    year: number;
}

interface FeeHistoryRecord {
    receipt_no: string;
    amount_paid: number;
    payment_method: string;
    payment_date: string;
    notes: string;
    term: string;
    year: number;
}

interface AnnouncementRecord {
    id: string;
    title: string;
    message: string;
    priority: 'normal' | 'important' | 'urgent';
    created_at: string;
}

interface AttendanceRecord {
    date: string;
    status: 'present' | 'absent' | 'late';
}

const ParentDashboard: React.FC = () => {
    const { parent, logoutParent, refreshParentProfile } = useParentAuth();

    // Sibling switcher state
    const [selectedChildIndex, setSelectedChildIndex] = useState<number>(0);
    const activeChild: ParentChild | undefined = parent?.children[selectedChildIndex];

    // Navigation state
    const [activeTab, setActiveTab] = useState<ParentTab>('overview');

    // Data states
    const [results, setResults] = useState<ResultRecord[]>([]);
    const [feeHistory, setFeeHistory] = useState<FeeHistoryRecord[]>([]);
    const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    
    const [loadingData, setLoadingData] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null);

    // Monitor connectivity
    useEffect(() => {
        const handleOnline = () => {
            setIsOffline(false);
            showToast('Back online! Syncing latest data...', 'success');
            if (activeChild) fetchAndCacheChildData(activeChild);
        };
        const handleOffline = () => {
            setIsOffline(true);
            showToast('Connection lost. Switching to Offline Mode.', 'warning');
        };
        // Refresh when tab regains focus so balance is always up-to-date
        const handleFocus = () => {
            if (navigator.onLine && parent?.phoneNumber && parent?.password) {
                refreshParentProfile();
            }
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('focus', handleFocus);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('focus', handleFocus);
        };
    }, [activeChild]);

    // Auto-refresh balance every 5 minutes from live database
    useEffect(() => {
        if (!parent?.phoneNumber || !parent?.password) return;
        const interval = setInterval(() => {
            if (navigator.onLine) {
                refreshParentProfile();
            }
        }, 5 * 60 * 1000); // 5 minutes
        return () => clearInterval(interval);
    }, [parent?.phoneNumber, parent?.password]);

    // Helper to determine if a tab contains unseen updates (i.e. different from last marked seen)
    const hasUnseenUpdate = useCallback((tab: ParentTab): boolean => {
        if (!activeChild?.id) return false;
        if (tab === 'overview') return false;

        let currentDataStr = '';
        let hasData = false;

        if (tab === 'academics') {
            currentDataStr = JSON.stringify(results);
            hasData = results.length > 0;
        } else if (tab === 'financials') {
            currentDataStr = JSON.stringify(feeHistory);
            hasData = feeHistory.length > 0;
        } else if (tab === 'attendance') {
            currentDataStr = JSON.stringify(attendance);
            hasData = attendance.length > 0;
        } else if (tab === 'announcements') {
            currentDataStr = JSON.stringify(announcements);
            hasData = announcements.length > 0;
        }

        if (!hasData) return false;

        const seenDataStr = localStorage.getItem(`seen_${tab}_${activeChild.id}`);
        return seenDataStr !== currentDataStr;
    }, [activeChild?.id, results, feeHistory, attendance, announcements]);

    // Automatically mark the active tab as seen
    useEffect(() => {
        if (!activeChild?.id) return;

        if (activeTab === 'academics' && results.length > 0) {
            localStorage.setItem(`seen_academics_${activeChild.id}`, JSON.stringify(results));
        } else if (activeTab === 'financials' && feeHistory.length > 0) {
            localStorage.setItem(`seen_financials_${activeChild.id}`, JSON.stringify(feeHistory));
        } else if (activeTab === 'attendance' && attendance.length > 0) {
            localStorage.setItem(`seen_attendance_${activeChild.id}`, JSON.stringify(attendance));
        } else if (activeTab === 'announcements' && announcements.length > 0) {
            localStorage.setItem(`seen_announcements_${activeChild.id}`, JSON.stringify(announcements));
        }
    }, [activeTab, activeChild?.id, results, feeHistory, attendance, announcements]);

    // Local Storage Caching Keys
    const getCacheKey = (childId: string) => `labour_parent_cache_${childId}`;

    // Load from offline cache
    const loadOfflineCache = (childId: string) => {
        try {
            const raw = localStorage.getItem(getCacheKey(childId));
            if (raw) {
                const cached = JSON.parse(raw);
                setResults(cached.results || []);
                setFeeHistory(cached.feeHistory || []);
                setAnnouncements(cached.announcements || []);
                setAttendance(cached.attendance || []);
                setCacheTimestamp(cached.timestamp || null);
                return true;
            }
        } catch (e) {
            console.error('[ParentDashboard] Offline cache retrieval failed:', e);
        }
        return false;
    };

    // Save fetched data to offline cache
    const saveOfflineCache = (childId: string, payload: { results: any[]; feeHistory: any[]; announcements: any[]; attendance: any[] }) => {
        try {
            const timestamp = new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
            localStorage.setItem(getCacheKey(childId), JSON.stringify({
                ...payload,
                timestamp
            }));
            setCacheTimestamp(timestamp);
        } catch (e) {
            console.error('[ParentDashboard] Failed to write offline cache:', e);
        }
    };

    // Main fetch & sync controller
    const fetchAndCacheChildData = async (child: ParentChild) => {
        if (!child) return;
        
        // If offline, default immediately to offline cache and halt
        if (!navigator.onLine) {
            const hasCache = loadOfflineCache(child.id);
            if (!hasCache) {
                showToast('No offline data cached for this child yet.', 'warning');
                setResults([]);
                setFeeHistory([]);
                setAttendance([]);
            }
            return;
        }

        if (!parent?.phoneNumber || !parent?.password) {
            showToast('Authentication credentials missing. Please log in again.', 'error');
            return;
        }

        setLoadingData(true);
        try {
            // Background refresh parent profile to get latest dynamic arrears, school logos, sibling photos, class name updates
            refreshParentProfile().catch(err => {
                console.error('[ParentDashboard] Background profile refresh failed:', err);
            });

            // Parallel fetches from Supabase using secure cryptographic database definer RPCs
            const [resultsRes, feePaymentsRes, announcementsRes, attendanceRes] = await Promise.all([
                // 1. Fetch Academic Results
                supabase.rpc('get_parent_results', {
                    phone_input: parent.phoneNumber.trim(),
                    password_input: parent.password,
                    student_uuid: child.id
                }),

                // 2. Fetch Fee Payments
                supabase.rpc('get_parent_fees', {
                    phone_input: parent.phoneNumber.trim(),
                    password_input: parent.password,
                    student_uuid: child.id
                }),

                // 3. Fetch School Announcements
                supabase.rpc('get_parent_announcements', {
                    phone_input: parent.phoneNumber.trim(),
                    password_input: parent.password,
                    school_uuid: child.schoolId
                }),

                // 4. Fetch Attendance Log
                supabase.rpc('get_parent_attendance', {
                    phone_input: parent.phoneNumber.trim(),
                    password_input: parent.password,
                    student_uuid: child.id
                })
            ]);

            // Handle potential database errors or permission failures returned from RPC responses
            if (resultsRes.error) throw resultsRes.error;
            if (feePaymentsRes.error) throw feePaymentsRes.error;
            if (announcementsRes.error) throw announcementsRes.error;
            if (attendanceRes.error) throw attendanceRes.error;

            // Formulate standard arrays from RPC JSON values
            const mappedResults: ResultRecord[] = (resultsRes.data?.results || []).map((r: any) => ({
                subject_name: r.subject_name || 'Unknown Subject',
                ca_total: Number(r.ca_total || 0),
                exam_score: Number(r.exam_score || 0),
                total_score: Number(r.total_score || 0),
                grade: r.grade || 'N/A',
                remarks: r.remarks || 'No remark',
                term: r.term,
                year: r.year
            }));

            const mappedFeeHistory: FeeHistoryRecord[] = (feePaymentsRes.data?.fees || []).map((f: any) => ({
                receipt_no: f.receipt_no,
                amount_paid: Number(f.amount_paid || 0),
                payment_method: f.payment_method || 'Cash',
                payment_date: new Date(f.payment_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
                notes: f.notes || '',
                term: f.term,
                year: f.year
            }));

            const mappedAnnouncements: AnnouncementRecord[] = (announcementsRes.data?.announcements || []).map((a: any) => ({
                id: a.id,
                title: a.title,
                message: a.message,
                priority: a.priority || 'normal',
                created_at: new Date(a.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
            }));

            const mappedAttendance: AttendanceRecord[] = (attendanceRes.data?.attendance || []).map((at: any) => ({
                date: at.date,
                status: at.status || 'present'
            }));

            // Set states
            setResults(mappedResults);
            setFeeHistory(mappedFeeHistory);
            setAnnouncements(mappedAnnouncements);
            setAttendance(mappedAttendance);

            // Cache data locally for future offline sessions
            saveOfflineCache(child.id, {
                results: mappedResults,
                feeHistory: mappedFeeHistory,
                announcements: mappedAnnouncements,
                attendance: mappedAttendance
            });
            
            setCacheTimestamp(null); // Reset offline status label because we are live
        } catch (error) {
            console.error('[ParentDashboard] Sync failed:', error);
            // On fetch failure, try falling back to offline cache
            loadOfflineCache(child.id);
        } finally {
            setLoadingData(false);
        }
    };

    // Trigger fetch on child swap, active context mount, or when parent credentials change
    useEffect(() => {
        if (activeChild) {
            fetchAndCacheChildData(activeChild);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChildIndex, activeChild?.id, parent?.phoneNumber, parent?.password]);

    // Summarize attendance totals
    const attendanceStats = useMemo(() => {
        const total = attendance.length;
        const present = attendance.filter(a => a.status === 'present').length;
        const late = attendance.filter(a => a.status === 'late').length;
        const absent = attendance.filter(a => a.status === 'absent').length;
        
        const rate = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 100;
        
        return { present, late, absent, rate, total };
    }, [attendance]);

    // Calculate total fees paid
    const totalFeesPaid = useMemo(() => {
        return feeHistory.reduce((acc, f) => acc + f.amount_paid, 0);
    }, [feeHistory]);

    // SVG Line Chart Generation (Safe, Native, 100% Offline-Capable)
    const renderGradesChart = () => {
        if (results.length === 0) return null;
        
        // Group by term averages
        const termScores: Record<string, { total: number; count: number }> = {};
        results.forEach(r => {
            const key = `${r.term} (${r.year})`;
            if (!termScores[key]) termScores[key] = { total: 0, count: 0 };
            termScores[key].total += r.total_score;
            termScores[key].count += 1;
        });

        const dataPoints = Object.keys(termScores).map(key => ({
            label: key,
            avg: Math.round(termScores[key].total / termScores[key].count)
        }));

        if (dataPoints.length < 2) {
            return (
                <div className="flex items-center justify-center p-6 bg-slate-50 rounded-2xl text-[10px] font-black uppercase text-slate-400">
                    Need results from at least 2 terms to plot progress chart
                </div>
            );
        }

        // SVG config
        const width = 500;
        const height = 150;
        const padding = 30;
        
        const points = dataPoints.map((dp, idx) => {
            const x = padding + (idx * (width - padding * 2)) / (dataPoints.length - 1);
            // Flip y because SVG 0,0 is top-left
            const y = height - padding - (dp.avg * (height - padding * 2)) / 100;
            return { x, y, ...dp };
        });

        const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

        return (
            <div className="space-y-4">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full bg-slate-50/50 rounded-[2rem] p-2 border border-slate-100/50 overflow-visible">
                    {/* Grid lines */}
                    {[20, 40, 60, 80, 100].map(yVal => {
                        const y = height - padding - (yVal * (height - padding * 2)) / 100;
                        return (
                            <g key={yVal} className="opacity-10">
                                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#3b82f6" strokeWidth="1" strokeDasharray="3,3" />
                                <text x={padding - 10} y={y + 3} textAnchor="end" fontSize="8" fill="#1e293b" className="font-bold">{yVal}%</text>
                            </g>
                        );
                    })}

                    {/* Chart Line */}
                    <path d={linePath} fill="none" stroke="url(#chartGrad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Points & Labels */}
                    {points.map((p, idx) => (
                        <g key={idx}>
                            <circle cx={p.x} cy={p.y} r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2.5" className="shadow-sm" />
                            <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="9" className="font-black fill-slate-800">{p.avg}%</text>
                            <text x={p.x} y={height - 8} textAnchor="middle" fontSize="7" className="font-black uppercase tracking-wider fill-slate-400">{p.label}</text>
                        </g>
                    ))}

                    <defs>
                        <linearGradient id="chartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50/50 pb-20 font-sans text-slate-800">
            {/* ⚠️ Offline Indicator Alert */}
            {isOffline && (
                <div className="bg-amber-500 text-white font-black text-[10px] tracking-widest text-center py-2 uppercase shadow-sm flex items-center justify-center gap-2">
                    <i className="fas fa-exclamation-triangle"></i>
                    Offline Mode • Viewing Cached Copy {cacheTimestamp ? `(Saved: ${cacheTimestamp})` : ''}
                </div>
            )}

            {/* Header / Brand */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-6 md:p-8 rounded-b-[3rem] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-3">
                        {/* School logo — shown from active child's school */}
                        {activeChild?.schoolLogoUrl ? (
                            <img
                                src={activeChild.schoolLogoUrl}
                                alt={activeChild.schoolName ?? 'School'}
                                className="w-12 h-12 rounded-2xl object-contain border border-white/20 bg-white/10 backdrop-blur-md p-1"
                            />
                        ) : (
                            <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/20">
                                <i className="fas fa-school text-xl"></i>
                            </div>
                        )}
                        <div>
                            <p className="text-[7px] font-black text-blue-300 uppercase tracking-[0.25em]">Connected Guardian</p>
                            <h2 className="text-md font-black uppercase tracking-wide leading-none mt-1">{parent?.guardianName}</h2>
                        </div>
                    </div>
                    <button 
                        onClick={logoutParent}
                        className="btn-danger bg-red-500/20 hover:bg-red-500 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest border border-red-500/30 transition-all flex items-center gap-1.5 active:scale-95"
                    >
                        <i className="fas fa-power-off"></i> Exit
                    </button>
                    <button
                        onClick={() => {
                            refreshParentProfile();
                            if (activeChild) fetchAndCacheChildData(activeChild);
                            showToast('Refreshing your data...', 'info');
                        }}
                        title="Refresh balance and data"
                        className="bg-white/10 hover:bg-white/20 px-3 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest border border-white/20 transition-all flex items-center gap-1.5 active:scale-95 text-white"
                    >
                        <i className="fas fa-sync-alt"></i>
                    </button>
                </div>

                {/* Sibling Switcher Grid */}
                {parent && parent.children.length > 0 && (
                    <div className="max-w-4xl mx-auto mt-8 space-y-3 relative z-10">
                        <p className="text-[8px] font-black text-blue-300/60 uppercase tracking-widest">Select Learner Context</p>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                            {parent.children.map((child, idx) => (
                                <button
                                    key={child.id}
                                    onClick={() => setSelectedChildIndex(idx)}
                                    className={`flex-shrink-0 flex items-center gap-3 p-4 rounded-3xl border-2 transition-all active:scale-[0.97] text-left
                                        ${selectedChildIndex === idx 
                                            ? 'bg-white text-indigo-950 border-white shadow-lg' 
                                            : 'bg-white/5 text-white/70 border-white/10 hover:border-white/20'}`}
                                >
                                    {child.photoUrl ? (
                                        <img 
                                            src={resolvePhotoUrl(child.photoUrl)} 
                                            alt={child.fullName} 
                                            className="w-10 h-10 rounded-xl object-cover object-top shadow-sm border border-white/20 flex-shrink-0"
                                            onError={(e) => {
                                                const img = e.target as HTMLImageElement;
                                                img.style.display = 'none';
                                                const fb = img.nextElementSibling as HTMLElement;
                                                if (fb) fb.style.display = 'flex';
                                            }}
                                        />
                                    ) : null}
                                    <div className={`w-10 h-10 rounded-xl items-center justify-center font-black text-xs shadow-sm flex-shrink-0
                                        ${selectedChildIndex === idx ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white'}
                                        ${child.photoUrl ? 'hidden' : 'flex'}`}>
                                        {child.fullName.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xs uppercase tracking-tight">{child.fullName}</h4>
                                        <p className={`text-[8px] font-bold uppercase mt-0.5 tracking-wider ${selectedChildIndex === idx ? 'text-indigo-600/70' : 'text-white/40'}`}>
                                            {child.className ?? 'N/A'} • {child.schoolName ?? 'Unknown School'}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="max-w-4xl mx-auto px-4 mt-6">
                {activeChild ? (
                    <>
                        {/* Tab Selector */}
                        <div className="flex bg-white rounded-2xl border border-slate-100 shadow-sm p-1.5 overflow-x-auto scrollbar-hide gap-1">
                            {[
                                { key: 'overview' as const, label: 'Overview', icon: 'fa-home' },
                                { key: 'academics' as const, label: 'Results', icon: 'fa-graduation-cap' },
                                { key: 'financials' as const, label: 'Fees', icon: 'fa-file-invoice-dollar' },
                                { key: 'attendance' as const, label: 'Attendance', icon: 'fa-calendar-check' },
                                { key: 'announcements' as const, label: 'Notices', icon: 'fa-bullhorn' }
                            ].map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => setActiveTab(t.key)}
                                    className={`relative flex-1 min-w-[70px] flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all active:scale-95
                                        ${activeTab === t.key
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <i className={`fas ${t.icon} text-xs`}></i>
                                    <span>{t.label}</span>
                                    {hasUnseenUpdate(t.key) && (
                                        <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse border-2 border-white shadow-sm"></span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Spinner Loader overlay */}
                        {loadingData && (
                            <div className="flex items-center justify-center py-12">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Fetching Cloud Records...</span>
                                </div>
                            </div>
                        )}

                        {!loadingData && (
                            <div className="mt-6 space-y-6">
                                {/* TAB 1: OVERVIEW */}
                                {activeTab === 'overview' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        {/* Child Profile Snapshot Card */}
                                        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden group">
                                            <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
                                                {activeChild.photoUrl ? (
                                                    <img 
                                                        src={resolvePhotoUrl(activeChild.photoUrl)} 
                                                        alt={activeChild.fullName} 
                                                        className="w-20 h-24 rounded-2xl object-cover object-top border border-slate-100 shadow-sm group-hover:scale-105 transition-transform"
                                                        onError={(e) => {
                                                            const img = e.target as HTMLImageElement;
                                                            img.style.display = 'none';
                                                            const fb = img.nextElementSibling as HTMLElement;
                                                            if (fb) fb.style.display = 'flex';
                                                        }}
                                                    />
                                                ) : null}
                                                <div className={`w-20 h-24 rounded-2xl bg-indigo-50 border border-slate-100 items-center justify-center text-indigo-600 text-3xl font-black shadow-sm group-hover:scale-105 transition-transform ${activeChild.photoUrl ? 'hidden' : 'flex'}`}>
                                                    {activeChild.fullName.charAt(0)}
                                                </div>
                                                <div className="space-y-1">
                                                    <h3 className="text-lg font-black text-slate-800 leading-none uppercase tracking-tight">{activeChild.fullName}</h3>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                        Class Teacher Assigned • Academic Session Profile
                                                    </p>
                                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                                                        <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[8px] font-black uppercase tracking-wider">{activeChild.className ?? 'N/A'}</span>
                                                        <span className="px-2.5 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[8px] font-black uppercase tracking-wider">{activeChild.schoolName ?? 'Unknown School'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="w-full md:w-auto h-px md:h-12 w-12 bg-slate-100 flex-shrink-0"></div>
                                            <div className="text-center md:text-right space-y-1">
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Class Attendance Rate</span>
                                                <h2 className="text-3xl font-black text-indigo-600 leading-none tracking-tighter">{attendanceStats.rate}%</h2>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">
                                                    {attendanceStats.present} of {attendanceStats.total} school days present
                                                </span>
                                            </div>
                                        </div>

                                        {/* Brief Finance & Notices Row */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Financial metric overview */}
                                            <div 
                                                onClick={() => setActiveTab('financials')}
                                                className="relative bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 hover:shadow-md cursor-pointer transition-all active:scale-[0.98]"
                                            >
                                                {hasUnseenUpdate('financials') && (
                                                    <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white shadow-sm animate-pulse"></span>
                                                )}
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${
                                                        (activeChild.arrears ?? 0) > 0 
                                                            ? 'text-red-500/80' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'text-cyan-600/80' 
                                                                : 'text-slate-400'
                                                    }`}>
                                                        {(activeChild.arrears ?? 0) > 0 
                                                            ? 'Outstanding Arrears' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'Overpayment Credit' 
                                                                : 'Cleared Balance'}
                                                    </span>
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${
                                                        (activeChild.arrears ?? 0) > 0 
                                                            ? 'bg-red-50 text-red-500' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'bg-cyan-50 text-cyan-600' 
                                                                : 'bg-emerald-50 text-emerald-600'
                                                    }`}>
                                                        <i className={(activeChild.arrears ?? 0) > 0 
                                                            ? 'fas fa-file-invoice-dollar' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'fas fa-piggy-bank' 
                                                                : 'fas fa-check-circle'}></i>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <h3 className={`text-2xl font-black tracking-tight ${
                                                        (activeChild.arrears ?? 0) > 0 
                                                            ? 'text-red-500' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'text-cyan-600' 
                                                                : 'text-emerald-600'
                                                    }`}>
                                                        GH¢ {Math.abs(activeChild.arrears ?? 0).toFixed(2)}
                                                    </h3>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                                        {(activeChild.arrears ?? 0) > 0 
                                                            ? 'Total balance owed to school accountant' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'Available credit balance (overpayment)' 
                                                                : 'Fees fully settled for the active term'}
                                                    </p>
                                                </div>
                                                <div className="h-px bg-slate-50"></div>
                                                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block">
                                                    View Detailed Invoice Ledger <i className="fas fa-arrow-right ml-1"></i>
                                                </span>
                                            </div>

                                            {/* Urgent Announcement Alert widget */}
                                            <div 
                                                onClick={() => setActiveTab('announcements')}
                                                className="relative bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 hover:shadow-md cursor-pointer transition-all active:scale-[0.98] flex flex-col justify-between"
                                            >
                                                {hasUnseenUpdate('announcements') && (
                                                    <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white shadow-sm animate-pulse"></span>
                                                )}
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Latest Announcement</span>
                                                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center text-xs">
                                                            <i className="fas fa-bullhorn"></i>
                                                        </div>
                                                    </div>
                                                    {announcements.length > 0 ? (
                                                        <div className="space-y-1 min-w-0">
                                                            <h4 className="text-xs font-black text-slate-800 truncate uppercase tracking-tight">{announcements[0].title}</h4>
                                                            <p className="text-[10px] text-slate-500 font-medium line-clamp-2 leading-relaxed">{announcements[0].message}</p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-[10px] text-slate-400 font-medium">No recent notifications posted by headteacher.</p>
                                                    )}
                                                </div>
                                                <div className="h-px bg-slate-50"></div>
                                                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block">
                                                    Open Notices Board <i className="fas fa-arrow-right ml-1"></i>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Dynamic SVG chart */}
                                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                                            <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Termly Academic Average Progress</h3>
                                            {renderGradesChart()}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 2: ACADEMIC RESULTS & DIGITAL REPORT CARDS */}
                                {activeTab === 'academics' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        {/* Pixel-perfect Digital Report Card */}
                                        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden print:border-none print:shadow-none" id="digital-report-card">
                                            {/* Report Card Header */}
                                            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 text-center space-y-2.5">
                                                <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-[0.2em] border border-white/10 inline-block">
                                                    Official Report Card
                                                </span>
                                                {/* School Logo on Report Card */}
                                                {activeChild.schoolLogoUrl ? (
                                                    <div className="flex flex-col items-center gap-2">
                                                        <img
                                                            src={activeChild.schoolLogoUrl}
                                                            alt={activeChild.schoolName ?? 'School'}
                                                            className="w-16 h-16 rounded-2xl object-contain bg-white/10 border border-white/20 p-1 mx-auto"
                                                        />
                                                        <h2 className="text-xl font-black uppercase tracking-widest leading-none">{activeChild.schoolName ?? 'School'}</h2>
                                                    </div>
                                                ) : (
                                                    <h2 className="text-xl font-black uppercase tracking-widest leading-none">{activeChild.schoolName ?? 'School'}</h2>
                                                )}
                                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                                                    Continuous Assessment & Term Examination Sheet
                                                </p>
                                                {activeChild.photoUrl ? (
                                                    <img 
                                                        src={resolvePhotoUrl(activeChild.photoUrl)} 
                                                        alt={activeChild.fullName} 
                                                        className="w-20 h-24 rounded-2xl border-2 border-white/20 object-cover object-top mx-auto shadow-md"
                                                        onError={(e) => {
                                                            const img = e.target as HTMLImageElement;
                                                            img.style.display = 'none';
                                                            const fb = img.nextElementSibling as HTMLElement;
                                                            if (fb) fb.style.display = 'flex';
                                                        }}
                                                    />
                                                ) : null}
                                                <div className={`w-20 h-24 rounded-2xl border-2 border-white/20 items-center justify-center text-white text-3xl font-black mx-auto shadow-md bg-indigo-600 ${activeChild.photoUrl ? 'hidden' : 'flex'}`}>
                                                    {activeChild.fullName.charAt(0)}
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto pt-2 text-[8px] font-black uppercase tracking-wider text-slate-300">
                                                    <div className="text-left bg-white/5 p-2 rounded-xl border border-white/5">
                                                        <span className="text-white/40 block text-[6px] mb-0.5">Student Name</span>
                                                        <span className="truncate block font-black text-white">{activeChild.fullName}</span>
                                                    </div>
                                                    <div className="text-left bg-white/5 p-2 rounded-xl border border-white/5">
                                                        <span className="text-white/40 block text-[6px] mb-0.5">Assigned Class</span>
                                                        <span className="block font-black text-white">{activeChild.className ?? 'N/A'}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Report Card Body Table */}
                                            <div className="p-6 md:p-8">
                                                {results.length > 0 ? (
                                                    <div className="space-y-6">
                                                        <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                                            <table className="w-full text-left border-collapse min-w-[500px]">
                                                                <thead>
                                                                    <tr className="bg-slate-50 border-b border-slate-100 text-[8px] font-black uppercase tracking-widest text-slate-400">
                                                                        <th className="px-4 py-4">Subject</th>
                                                                        <th className="px-4 py-4 text-center">CA Total</th>
                                                                        <th className="px-4 py-4 text-center">Exam Mark</th>
                                                                        <th className="px-4 py-4 text-center">Total Score</th>
                                                                        <th className="px-4 py-4 text-center">Grade</th>
                                                                        <th className="px-4 py-4">Remarks</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-600">
                                                                    {results.map((r, idx) => (
                                                                        <tr key={idx} className="hover:bg-slate-50/50">
                                                                            <td className="px-4 py-4.5 text-slate-800 font-black uppercase tracking-tight">{r.subject_name}</td>
                                                                            <td className="px-4 py-4.5 text-center font-bold text-slate-500">{r.ca_total}</td>
                                                                            <td className="px-4 py-4.5 text-center font-bold text-slate-500">{r.exam_score}</td>
                                                                            <td className="px-4 py-4.5 text-center font-black text-indigo-600">{r.total_score}</td>
                                                                            <td className="px-4 py-4.5 text-center">
                                                                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border
                                                                                    ${['A', 'B'].includes(r.grade) 
                                                                                        ? 'bg-green-50 text-green-600 border-green-100' 
                                                                                        : ['C', 'D'].includes(r.grade) 
                                                                                            ? 'bg-amber-50 text-amber-600 border-amber-100' 
                                                                                            : 'bg-red-50 text-red-500 border-red-100'}`}>
                                                                                    {r.grade}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-4 py-4.5 font-medium text-slate-500 italic">{r.remarks}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        {/* Digital signatures snapshot placeholder */}
                                                        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-100 text-center text-[8px] font-black uppercase tracking-widest text-slate-400">
                                                            <div className="space-y-4">
                                                                <div className="h-8 border-b border-slate-100 flex items-end justify-center">
                                                                    <span className="font-sans text-[10px] text-slate-300 italic">Electronic Sign</span>
                                                                </div>
                                                                <p>Class Teacher Sign</p>
                                                            </div>
                                                            <div className="space-y-4">
                                                                <div className="h-8 border-b border-slate-100 flex items-end justify-center">
                                                                    <span className="font-sans text-[10px] text-slate-300 italic">Electronic Sign</span>
                                                                </div>
                                                                <p>Headteacher Sign</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-12">
                                                        <div className="w-16 h-16 rounded-[1.5rem] bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 mx-auto mb-4">
                                                            <i className="fas fa-file-invoice text-2xl"></i>
                                                        </div>
                                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No Academic Records Released</p>
                                                        <p className="text-[9px] text-slate-300 max-w-[240px] mx-auto mt-2 leading-relaxed uppercase tracking-tight">
                                                            The school has not entered or approved any academic terminal reports for this learner yet.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action buttons (Print Report Card) */}
                                        {results.length > 0 && (
                                            <button
                                                onClick={() => window.print()}
                                                className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-800 text-white hover:bg-slate-900 shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                            >
                                                <i className="fas fa-print"></i> Print / Download Report Card PDF
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* TAB 3: FINANCIAL FEE TRACKER & LEDGER HISTORY */}
                                {activeTab === 'financials' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        {/* Financial Metric Cards */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            {/* Outstanding metric */}
                                            <div className={`bg-white border rounded-[2rem] shadow-sm p-6 space-y-4 ${
                                                (activeChild.arrears ?? 0) > 0 
                                                    ? 'border-red-100' 
                                                    : (activeChild.arrears ?? 0) < 0 
                                                        ? 'border-cyan-100' 
                                                        : 'border-slate-100'
                                            }`}>
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${
                                                        (activeChild.arrears ?? 0) > 0 
                                                            ? 'text-red-500/60' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'text-cyan-600/80' 
                                                                : 'text-emerald-600/80'
                                                    }`}>
                                                        {(activeChild.arrears ?? 0) > 0 
                                                            ? 'Owed Arrears' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'Credit Balance' 
                                                                : 'Settled Balance'}
                                                    </span>
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${
                                                        (activeChild.arrears ?? 0) > 0 
                                                            ? 'bg-red-50 text-red-500' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'bg-cyan-50 text-cyan-600' 
                                                                : 'bg-emerald-50 text-emerald-600'
                                                    }`}>
                                                        <i className={(activeChild.arrears ?? 0) > 0 
                                                            ? 'fas fa-exclamation-triangle' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'fas fa-piggy-bank' 
                                                                : 'fas fa-check-circle'}></i>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <h3 className={`text-2xl font-black tracking-tight ${
                                                        (activeChild.arrears ?? 0) > 0 
                                                            ? 'text-red-500' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'text-cyan-600' 
                                                                : 'text-emerald-600'
                                                    }`}>
                                                        GH¢ {Math.abs(activeChild.arrears ?? 0).toFixed(2)}
                                                    </h3>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                                        {(activeChild.arrears ?? 0) > 0 
                                                            ? 'Pending balance requiring cash/MoMo deposit' 
                                                            : (activeChild.arrears ?? 0) < 0 
                                                                ? 'Available credit from overpayments' 
                                                                : 'No pending balance for this student'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Total Paid Metric */}
                                            <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm p-6 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest">Fees Paid Today</span>
                                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center text-xs">
                                                        <i className="fas fa-check-circle"></i>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <h3 className="text-2xl font-black tracking-tight text-slate-800">GH¢ {totalFeesPaid.toFixed(2)}</h3>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                                        Aggregated fee payments processed by accountant
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Beautiful receipt Timeline Ledger */}
                                        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Invoice Payment Ledger</h3>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Official Payment receipts Timeline</p>
                                            </div>

                                            {feeHistory.length > 0 ? (
                                                <div className="relative border-l border-slate-100 pl-6 space-y-6 ml-3">
                                                    {feeHistory.map((fee, idx) => (
                                                        <div key={idx} className="relative group">
                                                            {/* Timeline dot */}
                                                            <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-indigo-600 shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                                                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                                                            </div>
                                                            
                                                            {/* Ledger Card */}
                                                            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all space-y-2">
                                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none block">Receipt Number</span>
                                                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">{fee.receipt_no}</h4>
                                                                    </div>
                                                                    <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded-md text-[8px] font-black text-indigo-600 uppercase tracking-wider self-start sm:self-center">
                                                                        {fee.payment_method}
                                                                    </span>
                                                                </div>

                                                                <div className="h-px bg-slate-100"></div>

                                                                <div className="flex items-center justify-between gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                                    <span>Date: <strong className="text-slate-600">{fee.payment_date}</strong></span>
                                                                    <span className="text-slate-800 font-black text-xs">GH¢ {fee.amount_paid.toFixed(2)}</span>
                                                                </div>

                                                                {fee.notes && (
                                                                    <p className="text-[10px] text-slate-500 font-medium italic border-t border-slate-100 pt-1.5">
                                                                        *Remark: {fee.notes}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-12">
                                                    <div className="w-16 h-16 rounded-[1.5rem] bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 mx-auto mb-4">
                                                        <i className="fas fa-file-invoice-dollar text-2xl"></i>
                                                    </div>
                                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No Fee Payments Recorded</p>
                                                    <p className="text-[9px] text-slate-300 max-w-[240px] mx-auto mt-2 leading-relaxed uppercase tracking-tight">
                                                        No transaction receipts found. If you paid fees, please make sure the accountant has posted them.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 4: DAILY ATTENDANCE CALENDAR */}
                                {activeTab === 'attendance' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Learner Attendance Log</h3>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Daily presence checks recorded by teachers</p>
                                            </div>

                                            {/* Summary Pills */}
                                            <div className="grid grid-cols-3 gap-3 text-center">
                                                <div className="bg-green-50/50 border border-green-100 p-3 rounded-2xl">
                                                    <span className="text-[7px] font-black text-green-600/80 uppercase tracking-wider block">Present</span>
                                                    <h4 className="text-lg font-black text-green-600">{attendanceStats.present}</h4>
                                                </div>
                                                <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-2xl">
                                                    <span className="text-[7px] font-black text-amber-600/80 uppercase tracking-wider block">Late</span>
                                                    <h4 className="text-lg font-black text-amber-600">{attendanceStats.late}</h4>
                                                </div>
                                                <div className="bg-red-50/50 border border-red-100 p-3 rounded-2xl">
                                                    <span className="text-[7px] font-black text-red-500/80 uppercase tracking-wider block">Absent</span>
                                                    <h4 className="text-lg font-black text-red-500">{attendanceStats.absent}</h4>
                                                </div>
                                            </div>

                                            {/* Daily timeline log */}
                                            {attendance.length > 0 ? (
                                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                                                    {attendance.map((at, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs
                                                                    ${at.status === 'present' 
                                                                        ? 'bg-green-100 text-green-600' 
                                                                        : at.status === 'late' 
                                                                            ? 'bg-amber-100 text-amber-600' 
                                                                            : 'bg-red-100 text-red-500'}`}>
                                                                    <i className={`fas ${at.status === 'present' ? 'fa-check' : at.status === 'late' ? 'fa-clock' : 'fa-times'}`}></i>
                                                                </div>
                                                                <span className="text-xs font-black text-slate-700">
                                                                    {new Date(at.date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                                                                </span>
                                                            </div>
                                                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border
                                                                ${at.status === 'present' 
                                                                    ? 'bg-green-50 text-green-600 border-green-100' 
                                                                    : at.status === 'late' 
                                                                        ? 'bg-amber-50 text-amber-600 border-amber-100' 
                                                                        : 'bg-red-50 text-red-500 border-red-100'}`}>
                                                                {at.status}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-12">
                                                    <div className="w-16 h-16 rounded-[1.5rem] bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 mx-auto mb-4">
                                                        <i className="fas fa-calendar-check text-2xl"></i>
                                                    </div>
                                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No Attendance Logs Found</p>
                                                    <p className="text-[9px] text-slate-300 max-w-[240px] mx-auto mt-2 leading-relaxed uppercase tracking-tight">
                                                        Teachers have not logged attendance records for this student yet.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 5: ANNOUNCEMENTS BOARD */}
                                {activeTab === 'announcements' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        <div className="space-y-4">
                                            {announcements.length > 0 ? announcements.map((a) => (
                                                <div 
                                                    key={a.id} 
                                                    className={`p-6 rounded-[2rem] border shadow-sm relative overflow-hidden transition-all hover:shadow-md
                                                        ${a.priority === 'urgent' 
                                                            ? 'bg-red-50/50 border-red-100 text-red-950 shadow-red-50' 
                                                            : a.priority === 'important'
                                                                ? 'bg-amber-50/50 border-amber-100 text-amber-950'
                                                                : 'bg-white border-slate-100 text-slate-800'}`}
                                                >
                                                    {/* Pinned urgent visual bar */}
                                                    {a.priority === 'urgent' && (
                                                        <div className="absolute top-0 bottom-0 left-0 w-2.5 bg-red-600 animate-pulse"></div>
                                                    )}

                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border
                                                                    ${a.priority === 'urgent' 
                                                                        ? 'bg-red-500 text-white border-transparent' 
                                                                        : a.priority === 'important'
                                                                            ? 'bg-amber-500 text-white border-transparent'
                                                                            : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                                    {a.priority}
                                                                </span>
                                                                <span className="text-[9px] font-bold text-slate-400">{a.created_at}</span>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <h4 className="text-sm font-black uppercase tracking-tight leading-snug">{a.title}</h4>
                                                            <p className="text-xs font-medium leading-relaxed opacity-85">{a.message}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="bg-white py-16 text-center rounded-[2rem] border border-slate-100 shadow-sm">
                                                    <div className="w-16 h-16 rounded-[1.5rem] bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 mx-auto mb-4">
                                                        <i className="fas fa-bullhorn text-2xl"></i>
                                                    </div>
                                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No School Announcements</p>
                                                    <p className="text-[9px] text-slate-300 max-w-[200px] mx-auto mt-2 leading-relaxed uppercase tracking-tight">
                                                        The bulletin board is empty. Announcements from the headteacher will show up here.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="bg-white py-16 text-center rounded-[2.5rem] border border-slate-100 shadow-sm">
                        <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-slate-300 border border-slate-100">
                            <i className="fas fa-users-slash text-3xl"></i>
                        </div>
                        <h3 className="text-md font-black uppercase tracking-widest text-slate-700">No Learners Context</h3>
                        <p className="text-xs text-slate-400 mt-2 max-w-[280px] mx-auto leading-relaxed uppercase tracking-tight">
                            There are no children linked to your phone record. Please contact your school administrator.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ParentDashboard;
