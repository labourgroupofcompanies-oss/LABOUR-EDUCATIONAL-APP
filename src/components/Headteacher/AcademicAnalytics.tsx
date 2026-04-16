import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb } from '../../eduDb';
import { useAuth } from '../../hooks/useAuth';
import { useAcademicSession } from '../../hooks/useAcademicSession';

/* ── UI HELPERS ── */
const Section = ({ title, icon, color, children, badge }: { title: string; icon: string; color: string; children: React.ReactNode, badge?: string }) => (
    <div className="bg-white/40 backdrop-blur-md border border-white/40 rounded-[2rem] p-6 lg:p-8 space-y-6 shadow-xl shadow-blue-900/5 h-full">
        <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl ${color} text-white flex items-center justify-center text-sm shadow-lg shadow-current/20`}>
                    <i className={`fas ${icon}`}></i>
                </div>
                {title}
            </h3>
            {badge && (
                <span className="px-3 py-1 bg-white/60 border border-white rounded-full text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {badge}
                </span>
            )}
        </div>
        {children}
    </div>
);

const TrendBadge = ({ value }: { value: number }) => {
    if (value === 0) return <span className="text-[10px] text-slate-400 font-black uppercase">Steady</span>;
    const isUp = value > 0;
    return (
        <span className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wider ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            <i className={`fas fa-caret-${isUp ? 'up' : 'down'}`}></i>
            {Math.abs(value).toFixed(1)}% {isUp ? 'Up' : 'Down'}
        </span>
    );
};

const AcademicAnalytics: React.FC = () => {
    const { user } = useAuth();
    const { currentTerm, currentYear } = useAcademicSession();
    const [selectedClassId, setSelectedClassId] = useState<string>('');

    // ── DATA FETCHING ──
    const analyticsData = useLiveQuery(async () => {
        if (!user?.schoolId) return null;

        const [allResults, allStudents, allSubjects, allClasses] = await Promise.all([
            eduDb.results.where('schoolId').equals(user.schoolId).toArray(),
            eduDb.students.where('schoolId').equals(user.schoolId).toArray(),
            eduDb.subjects.where('schoolId').equals(user.schoolId).toArray(),
            eduDb.classes.where('schoolId').equals(user.schoolId).toArray()
        ]);

        if (allResults.length === 0) return { classes: allClasses };

        // Helper: Calculate average performance
        const getAvg = (res: any[]) => {
            if (res.length === 0) return 0;
            return res.reduce((sum, r) => sum + (r.totalScore || 0), 0) / res.length;
        };

        // 1. SESSIONS & TRENDS
        const sessions = [...new Set(allResults.map(r => `${r.term}-${r.year}`))];
        sessions.sort((a,b) => {
            const [tA, yA] = a.split('-');
            const [tB, yB] = b.split('-');
            if (yA !== yB) return parseInt(yA) - parseInt(yB);
            const termRank = (t: string) => t.includes('1') ? 1 : t.includes('2') ? 2 : 3;
            return termRank(tA) - termRank(tB);
        });

        // Filter results by context (Whole School vs Selected Class)
        const contextResults = selectedClassId 
            ? allResults.filter(r => r.classId === parseInt(selectedClassId))
            : allResults;

        const historicalTrends = sessions.map(session => {
             const [term, year] = session.split('-');
             const sessionResults = contextResults.filter(r => r.term === term && r.year === parseInt(year));
             return { session, avg: getAvg(sessionResults) };
        });

        const currentAvg = historicalTrends[historicalTrends.length - 1]?.avg || 0;
        const prevAvg = historicalTrends.length > 1 ? historicalTrends[historicalTrends.length - 2]?.avg : 0;
        const globalTrend = prevAvg > 0 ? ((currentAvg - prevAvg) / prevAvg) * 100 : 0;

        // 2. SUBJECT HEATMAP (Context Filtered)
        const subjectPerformance = allSubjects.map(sub => {
            const subResults = contextResults.filter(r => r.subjectId === sub.id && r.term === currentTerm && r.year === currentYear);
            return {
                id: sub.id,
                name: sub.name,
                avg: getAvg(subResults),
                count: subResults.length
            };
        }).filter(s => s.count > 0).sort((a,b) => b.avg - a.avg);

        // 3. STUDENT INSIGHTS
        const targetStudents = selectedClassId
            ? allStudents.filter(s => s.classId === parseInt(selectedClassId))
            : allStudents;

        const prevSession = sessions.length > 1 ? sessions[sessions.length - 2] : null;

        const allLearners = targetStudents.map(student => {
            const currRes = allResults.filter(r => r.studentId === student.id && r.term === currentTerm && r.year === currentYear);
            const sAvg = getAvg(currRes);

            let sPrevAvg = 0;
            if (prevSession) {
                const [pT, pY] = prevSession.split('-');
                const pRes = allResults.filter(r => r.studentId === student.id && r.term === pT && r.year === parseInt(pY));
                sPrevAvg = getAvg(pRes);
            }

            const sDelta = sPrevAvg > 0 ? ((sAvg - sPrevAvg) / sPrevAvg) * 100 : 0;

            return {
                id: student.id,
                name: student.fullName,
                avg: sAvg,
                prevAvg: sPrevAvg,
                delta: sDelta,
                className: allClasses.find(c => c.id === student.classId)?.name || 'N/A'
            };
        }).filter(s => s.avg > 0).sort((a,b) => b.avg - a.avg);

        // Add Rank in current context
        const rankedLearners = allLearners.map((s, idx) => ({ ...s, rank: idx + 1 }));

        return {
            classes: allClasses,
            historicalTrends,
            currentAvg,
            globalTrend,
            subjectPerformance,
            allLearners: rankedLearners,
            highFlyers: rankedLearners.slice(0, 5),
            risingStars: [...rankedLearners].filter(s => s.delta > 5).sort((a,b) => b.delta - a.delta).slice(0, 5),
            atRisk: [...rankedLearners].filter(s => s.avg < 45 || s.delta < -10).sort((a,b) => a.avg - b.avg).slice(0, 5)
        };
    }, [user?.schoolId, currentTerm, currentYear, selectedClassId]);

    if (!analyticsData || (analyticsData.allLearners && analyticsData.allLearners.length === 0 && !selectedClassId)) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 text-3xl">
                    <i className="fas fa-chart-line"></i>
                </div>
                <div>
                    <h3 className="text-xl font-black text-slate-800">No Analytics Data Yet</h3>
                    <p className="text-slate-500 max-w-sm mx-auto text-sm mt-1">
                        Select a class or approve results to generate insights and trends.
                    </p>
                </div>
            </div>
        );
    }

    const currentClassName = selectedClassId 
        ? analyticsData.classes?.find(c => c.id === parseInt(selectedClassId))?.name 
        : 'Whole School';

    return (
        <div className="space-y-8 lg:space-y-10 animate-fadeIn pb-24">
            
            {/* ── Filter Header ── */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/60 backdrop-blur-xl border border-white p-6 rounded-[2rem] shadow-xl shadow-blue-900/5">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl shadow-lg shadow-indigo-200">
                        <i className="fas fa-filter"></i>
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-800 leading-none">Analysis Context</h2>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{currentClassName}</p>
                    </div>
                </div>

                <div className="w-full sm:w-64 relative group">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none"></i>
                    <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl border-none bg-slate-100/50 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all text-sm font-black text-slate-700 appearance-none"
                    >
                        <option value="">Whole School Overview</option>
                        {analyticsData.classes?.map(cls => (
                            <option key={cls.id} value={cls.id}>{cls.name}</option>
                        ))}
                    </select>
                    <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
                </div>
            </div>

            {/* ── Top Metric Strip ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-200/50 relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                    <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest mb-1">
                        {selectedClassId ? 'Class Average' : 'Global School Average'}
                    </p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-5xl font-black tracking-tighter">
                            {analyticsData.currentAvg?.toFixed(1) || '0.0'}
                        </h4>
                        <span className="text-indigo-200 font-bold text-sm">/ 100</span>
                    </div>
                </div>

                <div className="bg-white/80 p-8 rounded-[2.5rem] border border-white shadow-xl shadow-slate-200/20">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">Core Competency</p>
                    <div className="space-y-4">
                        {analyticsData.subjectPerformance?.slice(0, 3).map(sub => (
                            <div key={sub.id} className="space-y-1">
                                <div className="flex justify-between text-[11px] font-black uppercase tracking-tight text-slate-600">
                                    <span className="truncate pr-2">{sub.name}</span>
                                    <span>{sub.avg.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-indigo-500 rounded-full" 
                                        style={{ width: `${sub.avg}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                        {(!analyticsData.subjectPerformance || analyticsData.subjectPerformance.length === 0) && (
                            <p className="text-slate-300 text-[10px] font-black uppercase italic py-2">Insufficient subject data</p>
                        )}
                    </div>
                </div>

                <div className="bg-white/80 p-8 rounded-[2.5rem] border border-white shadow-xl shadow-slate-200/20 flex flex-col justify-center">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1 text-center">Progression Trend</p>
                    <div className="text-center">
                        {analyticsData.historicalTrends && analyticsData.historicalTrends.length > 1 ? (
                            <div className="space-y-1">
                                <div className={`text-4xl font-black ${
                                    analyticsData.globalTrend >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                }`}>
                                    <i className={`fas fa-chart-${analyticsData.globalTrend >= 0 ? 'line' : 'line-down'} mr-3`}></i>
                                    {Math.abs(analyticsData.globalTrend).toFixed(1)}%
                                </div>
                                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{analyticsData.globalTrend >= 0 ? 'Improvement' : 'Decline'} vs Last Term</p>
                            </div>
                        ) : (
                            <div className="text-slate-300 text-sm font-black uppercase tracking-[0.2em] py-2">First Term Logged</div>
                        )}
                    </div>
                </div>
            </div>

            {selectedClassId ? (
                /* ── CLASS SPECIFIC VIEW: ALL LEARNERS ── */
                <Section title={`Performance Registry: ${currentClassName}`} icon="fa-list-ol" color="bg-indigo-600" badge={`${analyticsData.allLearners?.length} Learners`}>
                    <div className="overflow-x-auto -mx-6 lg:-mx-8 px-6 lg:px-8">
                        <table className="w-full text-left border-separate border-spacing-y-3">
                            <thead>
                                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <th className="px-4 py-2">Rank</th>
                                    <th className="px-4 py-2">Learner</th>
                                    <th className="px-4 py-2 text-center">Current Avg</th>
                                    <th className="px-4 py-2 text-center">Trend</th>
                                    <th className="px-4 py-2 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analyticsData.allLearners?.map((s) => (
                                    <tr key={s.id} className="group bg-white/50 hover:bg-white hover:shadow-lg hover:shadow-blue-900/5 transition-all outline outline-1 outline-transparent hover:outline-blue-100 rounded-3xl">
                                        <td className="px-4 py-5 first:rounded-l-[1.5rem]">
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                                                s.rank === 1 ? 'bg-amber-100 text-amber-600' : 
                                                s.rank === 2 ? 'bg-slate-100 text-slate-600' :
                                                s.rank === 3 ? 'bg-orange-100 text-orange-600' : 'text-slate-400'
                                            }`}>
                                                {s.rank}
                                            </div>
                                        </td>
                                        <td className="px-4 py-5 font-black text-slate-700 text-sm">
                                            {s.name}
                                        </td>
                                        <td className="px-4 py-5 text-center">
                                            <span className="text-lg font-black text-slate-800">{s.avg.toFixed(1)}</span>
                                        </td>
                                        <td className="px-4 py-5 text-center">
                                            <TrendBadge value={s.delta} />
                                        </td>
                                        <td className="px-4 py-5 text-right last:rounded-r-[1.5rem]">
                                            {s.avg >= 80 ? <span className="text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">Distinction</span> :
                                             s.delta >= 10 ? <span className="text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">Improving</span> :
                                             s.avg < 45 ? <span className="text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 bg-rose-50 text-rose-600 rounded-full border border-rose-100">Critical</span> :
                                             <span className="text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 bg-slate-50 text-slate-400 rounded-full">Stable</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            ) : (
                /* ── GLOBAL VIEW: TOP PERFORMERS ACROSS SCHOOL ── */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                    <Section title="Academic Champions" icon="fa-crown" color="bg-amber-500" badge="Global Top 5">
                        <div className="space-y-4">
                            {analyticsData.highFlyers?.map((s, idx) => (
                                <div key={s.id} className="flex items-center gap-4 p-5 rounded-3xl bg-amber-50/50 border border-amber-100/50 group hover:shadow-lg transition-all">
                                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-amber-600 font-black text-lg">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h5 className="font-black text-slate-800 truncate">{s.name}</h5>
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{s.className}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-black text-slate-800 leading-none">{s.avg.toFixed(1)}</p>
                                        <TrendBadge value={s.delta} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="Rising Stars" icon="fa-rocket" color="bg-indigo-600" badge="Top Growth">
                        <div className="space-y-4">
                            {analyticsData.risingStars?.map((s) => (
                                <div key={s.id} className="flex items-center gap-4 p-5 rounded-3xl bg-indigo-50/50 border border-indigo-100/50 group hover:shadow-lg transition-all">
                                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-indigo-600 text-lg">
                                        <i className="fas fa-arrow-up"></i>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h5 className="font-black text-slate-800 truncate">{s.name}</h5>
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{s.className}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-black text-indigo-600 leading-none">+{s.delta.toFixed(1)}%</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Growth Delta</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                {/* ── At Risk (Works in both views) ── */}
                <Section title="Attention Required" icon="fa-exclamation-triangle" color="bg-rose-500" badge={selectedClassId ? "Class Alerts" : "School Alerts"}>
                    <div className="space-y-4">
                        {analyticsData.atRisk?.map((s) => (
                            <div key={s.id} className="flex items-center gap-4 p-5 rounded-3xl bg-rose-50/50 border border-rose-100/50 group hover:shadow-lg transition-all">
                                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-rose-600 text-lg">
                                    <i className="fas fa-heartbeat"></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h5 className="font-black text-slate-800 truncate">{s.name}</h5>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{s.className}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xl font-black text-rose-700 leading-none">{s.avg.toFixed(1)}</p>
                                    <TrendBadge value={s.delta} />
                                </div>
                            </div>
                        ))}
                        {(!analyticsData.atRisk || analyticsData.atRisk.length === 0) && (
                            <div className="text-center py-10">
                                <i className="fas fa-check-circle text-emerald-400 text-2xl mb-3 opacity-20"></i>
                                <p className="text-slate-300 font-black uppercase tracking-widest text-[10px]">No critical alerts in this context</p>
                            </div>
                        )}
                    </div>
                </Section>

                {/* ── Subject Mastery (Context Filtered) ── */}
                <Section title="Detailed Subject analysis" icon="fa-brain" color="bg-emerald-500" badge={selectedClassId ? "Class Average" : "School Average"}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {analyticsData.subjectPerformance?.map(sub => (
                            <div key={sub.id} className="bg-white/80 p-5 rounded-3xl border border-white shadow-sm hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="min-w-0 flex-1 pr-2">
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1 truncate">{sub.name}</p>
                                        <h5 className="font-black text-slate-800 truncate text-xs">{sub.name}</h5>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-lg font-black text-emerald-600 leading-none">{sub.avg.toFixed(0)}%</p>
                                    </div>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                            sub.avg >= 70 ? 'bg-emerald-500' : sub.avg >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                        }`}
                                        style={{ width: `${sub.avg}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                        {(!analyticsData.subjectPerformance || analyticsData.subjectPerformance.length === 0) && (
                            <div className="col-span-2 text-center py-10 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                                <p className="text-slate-400 font-bold text-xs">No subject-specific results found.</p>
                            </div>
                        )}
                    </div>
                </Section>
            </div>
        </div>
    );
};

export default AcademicAnalytics;
