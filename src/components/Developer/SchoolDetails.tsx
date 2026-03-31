import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { type School } from '../../db';

interface SchoolDetailsProps {
    school: School;
    onClose: () => void;
}

interface LiveData {
    students: number;
    staff: number;
    classes: number;
    results: number;
    subscriptions: any[];
    staffProfiles: any[];
    schoolFull: any;
    inviteUsed?: any;
}

const Field = ({ label, value, mono = false, badge = false, badgeColor = 'slate' }: {
    label: string; value: React.ReactNode; mono?: boolean; badge?: boolean; badgeColor?: string;
}) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3 border-b border-slate-100 last:border-0">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">{label}</span>
        {badge ? (
            <span className={`self-start sm:self-auto text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-${badgeColor}-100 text-${badgeColor}-700 border border-${badgeColor}-200`}>
                {value}
            </span>
        ) : (
            <span className={`font-black text-slate-800 text-sm sm:text-right break-all ${mono ? 'font-mono text-xs text-slate-500' : ''}`}>
                {value || <span className="text-slate-300 font-normal italic">Not provided</span>}
            </span>
        )}
    </div>
);

const Section = ({ icon, title, color = 'blue', children }: {
    icon: string; title: string; color?: string; children: React.ReactNode;
}) => (
    <section className="space-y-3">
        <h4 className={`text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1`}>
            <i className={`fas ${icon} text-${color}-500`}></i>
            {title}
        </h4>
        <div className="bg-slate-50 rounded-2xl px-5 shadow-inner divide-y divide-slate-100">
            {children}
        </div>
    </section>
);

const SchoolDetails: React.FC<SchoolDetailsProps> = ({ school, onClose }) => {
    const [live, setLive] = useState<LiveData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'staff' | 'subscriptions' | 'onboarding'>('overview');

    const schoolUuid = school.idCloud || (school as any).id;
    const s = (school as any); // raw cloud row shorthand
    const schoolName = s.school_name || school.schoolName || 'Unnamed School';
    const schoolCode = s.school_code || school.schoolCode;

    useEffect(() => {
        if (!schoolUuid) return;
        const fetch = async () => {
            setLoading(true);
            try {
                // Fetch stats and lists in parallel
                const results = await Promise.all([
                    supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolUuid).eq('is_deleted', false),
                    supabase.from('staff_profiles').select('*', { count: 'exact', head: true }).eq('school_id', schoolUuid),
                    supabase.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', schoolUuid),
                    supabase.from('results').select('*', { count: 'exact', head: true }).eq('school_id', schoolUuid),
                    supabase.from('school_subscriptions').select('*').eq('school_id', schoolUuid).order('created_at', { ascending: false }),
                    supabase.from('staff_profiles').select('id, full_name, role, auth_email, created_at').eq('school_id', schoolUuid).order('created_at', { ascending: true }),
                    supabase.from('schools').select('*').eq('id', schoolUuid).maybeSingle(),
                    // We'll fetch the invite using the headteacher's ID later if needed, 
                    // or just query for 'used_by' any of the staff for this school
                ]);

                const [resStudents, resStaffCount, resClasses, resResults, resSubs, resProfiles, resSchool] = results;

                // For the invite, we need the headteacher ID which we now have from resProfiles
                const headteacher = resProfiles.data?.find(p => p.role === 'headteacher');
                let inviteData = null;
                if (headteacher) {
                    const { data: inv } = await supabase.from('school_invites').select('*').eq('used_by', headteacher.id).maybeSingle();
                    inviteData = inv;
                }

                setLive({
                    students: resStudents.count ?? 0,
                    staff: resStaffCount.count ?? 0,
                    classes: resClasses.count ?? 0,
                    results: resResults.count ?? 0,
                    subscriptions: resSubs.data ?? [],
                    staffProfiles: resProfiles.data ?? [],
                    schoolFull: resSchool.data ?? s,
                    inviteUsed: inviteData
                });
            } catch (err) {
                console.error('[SchoolDetails] Fetch failed:', err);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [schoolUuid]);

    const full = live?.schoolFull ?? s;
    const onboardingTerm = full.onboarding_term || school.onboardingTerm || '—';
    const onboardingYear = full.onboarding_academic_year || school.onboardingAcademicYear || '—';
    const registeredAt = full.created_at ? new Date(full.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';

    const tabs = [
        { id: 'overview', label: 'Overview', icon: 'fa-info-circle' },
        { id: 'staff', label: 'Staff', icon: 'fa-users', count: live?.staff },
        { id: 'subscriptions', label: 'Subscriptions', icon: 'fa-credit-card', count: live?.subscriptions.length },
        { id: 'onboarding', label: 'Onboarding', icon: 'fa-rocket' },
    ] as const;

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fadeIn" onClick={onClose} />

            <div className="relative w-full sm:max-w-2xl bg-white h-full shadow-2xl animate-slideInRight overflow-hidden flex flex-col">

                {/* ── Header ── */}
                <div className="shrink-0 bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 lg:p-8">
                    <div className="flex items-start justify-between gap-4 mb-5">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center font-black text-2xl shrink-0 overflow-hidden">
                                {full.logo ? (
                                    <img src={full.logo.startsWith('data:') ? full.logo : `data:image/png;base64,${full.logo}`} alt="Logo" className="w-full h-full object-cover" />
                                ) : (
                                    schoolName.charAt(0)
                                )}
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-xl font-black tracking-tight truncate">{schoolName}</h3>
                                <p className="text-slate-400 text-[10px] font-mono uppercase tracking-widest mt-0.5">{schoolCode}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0 mt-1">
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    {/* KPI strip */}
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { label: 'Students', value: live?.students, icon: 'fa-user-graduate', color: 'text-blue-300' },
                            { label: 'Staff', value: live?.staff, icon: 'fa-users', color: 'text-purple-300' },
                            { label: 'Classes', value: live?.classes, icon: 'fa-chalkboard', color: 'text-emerald-300' },
                            { label: 'Results', value: live?.results, icon: 'fa-chart-bar', color: 'text-amber-300' },
                        ].map(k => (
                            <div key={k.label} className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                                <i className={`fas ${k.icon} ${k.color} text-base mb-1`}></i>
                                <p className="font-black text-white text-lg leading-none">{loading ? '…' : k.value}</p>
                                <p className="text-slate-500 text-[8px] uppercase tracking-widest mt-0.5">{k.label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div className="shrink-0 flex border-b border-slate-100 bg-white px-6">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                        >
                            <i className={`fas ${t.icon}`}></i>
                            {t.label}
                            {'count' in t && t.count !== undefined && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${activeTab === t.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                    {loading ? '…' : t.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ── Body ── */}
                <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-4">
                            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Loading school data...</p>
                        </div>
                    ) : (
                        <>
                            {/* ══ OVERVIEW TAB ══ */}
                            {activeTab === 'overview' && (
                                <div className="space-y-6">

                                    {/* Onboarding / Trial */}
                                    <Section icon="fa-gift" title="Onboarding & Free Trial" color="emerald">
                                        <Field label="Registered On" value={registeredAt} />
                                        <Field label="Free Trial Term" value={onboardingTerm} badge badgeColor="emerald" />
                                        <Field label="Free Trial Year" value={onboardingYear} badge badgeColor="emerald" />
                                        <Field label="Trial Status" value={(live?.subscriptions ?? []).some(s => s.status === 'trial') ? 'Trial Row Written ✓' : 'No Trial Record'} badge badgeColor={(live?.subscriptions ?? []).some(s => s.status === 'trial') ? 'green' : 'amber'} />
                                        <Field label="Account Status" value={(full.is_active ?? true) ? 'Active' : 'Deactivated'} badge badgeColor={(full.is_active ?? true) ? 'green' : 'red'} />
                                    </Section>

                                    {/* School Identity */}
                                    <Section icon="fa-school" title="School Identity" color="blue">
                                        <Field label="Full Name" value={schoolName} />
                                        <Field label="School Code" value={schoolCode} mono />
                                        <Field label="Cloud UUID" value={schoolUuid} mono />
                                        <Field label="School Type" value={full.school_type || school.schoolType} />
                                        <Field label="Category" value={full.school_type || school.schoolType} />
                                    </Section>

                                    {/* Headteacher */}
                                    <Section icon="fa-user-shield" title="Headteacher" color="purple">
                                        <Field label="Full Name" value={full.headteacher_name || school.headteacherName} />
                                        <Field label="Email / Username" value={full.email || school.email || (school as any).username} />
                                        <Field label="Auth Email" value={(live?.staffProfiles ?? []).find(p => p.role === 'headteacher')?.auth_email ?? '—'} mono />
                                        <Field label="Staff UUID" value={(live?.staffProfiles ?? []).find(p => p.role === 'headteacher')?.id ?? '—'} mono />
                                    </Section>

                                    {/* Location */}
                                    <Section icon="fa-map-marker-alt" title="Location" color="red">
                                        <Field label="Region" value={full.region || school.region} />
                                        <Field label="District" value={full.district || school.district} />
                                        <Field label="Address" value={full.address || school.address} />
                                    </Section>

                                    {/* System */}
                                    <Section icon="fa-server" title="System Metadata" color="slate">
                                        <Field label="Last Sync" value={(full.last_sync_at ? new Date(full.last_sync_at).toLocaleString() : 'Never')} />
                                        <Field label="Academic Term" value={`${onboardingTerm} — ${onboardingYear}`} />
                                        <Field label="Created At" value={registeredAt} />
                                        <Field label="Updated At" value={full.updated_at ? new Date(full.updated_at).toLocaleString() : '—'} />
                                    </Section>

                                    {/* ── Actions ── */}
                                    <div className="pt-4 flex flex-wrap gap-3">
                                        <button
                                            onClick={async () => {
                                                if (!confirm(`Are you sure you want to manually grant a free trial for ${onboardingTerm} — ${onboardingYear}?`)) return;
                                                const { error } = await supabase.rpc('backfill_trial_subscription', {
                                                    p_school_id: schoolUuid,
                                                    p_term: onboardingTerm,
                                                    p_year: onboardingYear
                                                });
                                                if (error) alert('Failed: ' + error.message);
                                                else {
                                                    alert('Trial granted successfully!');
                                                    onClose(); // Refresh parent or close
                                                }
                                            }}
                                            className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center gap-2"
                                        >
                                            <i className="fas fa-gift"></i>
                                            Grant Manual Trial
                                        </button>
                                        <button
                                            onClick={() => alert('School Secret: ' + (full.school_code || 'N/A'))}
                                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-900 hover:text-white transition-all shadow-sm flex items-center gap-2"
                                        >
                                            <i className="fas fa-shield-halved"></i>
                                            Reveal Secret Key
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ══ STAFF TAB ══ */}
                            {activeTab === 'staff' && (
                                <div className="space-y-3">
                                    {(live?.staffProfiles ?? []).length === 0 ? (
                                        <div className="text-center py-16 text-slate-300">
                                            <i className="fas fa-users text-4xl mb-4"></i>
                                            <p className="font-black text-xs uppercase tracking-widest">No staff profiles found</p>
                                        </div>
                                    ) : (live?.staffProfiles ?? []).map((p, i) => (
                                        <div key={p.id || i} className="bg-slate-50 rounded-2xl p-4 flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                                                p.role === 'headteacher' ? 'bg-purple-100 text-purple-700' :
                                                p.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                                                p.role === 'accountant' ? 'bg-amber-100 text-amber-700' :
                                                'bg-slate-100 text-slate-500'
                                            }`}>
                                                {(p.full_name || '?').charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-black text-slate-800 text-sm truncate">{p.full_name || 'Unnamed'}</p>
                                                <p className="text-[10px] text-slate-400 font-mono truncate">{p.id}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                                                    p.role === 'headteacher' ? 'bg-purple-100 text-purple-700' :
                                                    p.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                                                    p.role === 'accountant' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-slate-100 text-slate-500'
                                                }`}>{p.role}</span>
                                                <p className="text-[9px] text-slate-300 mt-1">{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ══ SUBSCRIPTIONS TAB ══ */}
                            {activeTab === 'subscriptions' && (
                                <div className="space-y-3">
                                    {(live?.subscriptions ?? []).length === 0 ? (
                                        <div className="text-center py-16 text-slate-300">
                                            <i className="fas fa-credit-card text-4xl mb-4"></i>
                                            <p className="font-black text-xs uppercase tracking-widest">No subscription records</p>
                                        </div>
                                    ) : (live?.subscriptions ?? []).map((sub, i) => (
                                        <div key={sub.id || i} className="bg-slate-50 rounded-2xl p-5 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-black text-slate-800">{sub.term} — {sub.academic_year}</p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">{sub.created_at ? new Date(sub.created_at).toLocaleString() : '—'}</p>
                                                </div>
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${
                                                    sub.status === 'active' ? 'bg-green-100 text-green-700 border-green-200' :
                                                    sub.status === 'trial' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                                    sub.status === 'expired' ? 'bg-red-100 text-red-600 border-red-200' :
                                                    'bg-slate-100 text-slate-500 border-slate-200'
                                                }`}>{sub.status}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                                                    <p className="text-slate-400 uppercase tracking-wider font-black mb-0.5">Amount Paid</p>
                                                    <p className="font-black text-slate-800">GHS {sub.amount_paid ?? 0}</p>
                                                </div>
                                                <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                                                    <p className="text-slate-400 uppercase tracking-wider font-black mb-0.5">Activated</p>
                                                    <p className="font-black text-slate-800">{sub.activated_at ? new Date(sub.activated_at).toLocaleDateString() : '—'}</p>
                                                </div>
                                                <div className="col-span-2 bg-white rounded-xl p-2.5 border border-slate-100">
                                                    <p className="text-slate-400 uppercase tracking-wider font-black mb-0.5">Payment Reference</p>
                                                    <p className="font-mono text-slate-600 text-[9px] break-all">{sub.momo_reference || sub.payment_reference || 'N/A'}</p>
                                                </div>
                                                <div className="col-span-2 bg-white rounded-xl p-2.5 border border-slate-100">
                                                    <p className="text-slate-400 uppercase tracking-wider font-black mb-0.5">Record UUID</p>
                                                    <p className="font-mono text-slate-400 text-[9px] break-all">{sub.id}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* ══ ONBOARDING TAB ══ */}
                            {activeTab === 'onboarding' && (
                                <div className="space-y-6">
                                    <Section icon="fa-envelope-open-text" title="Invitation Details" color="amber">
                                        <Field label="Used Invite Token" value={live?.inviteUsed?.id || 'Manual Onboarding'} mono={!!live?.inviteUsed} />
                                        <Field label="Invite Category" value={live?.inviteUsed?.category || '—'} />
                                        <Field label="Invite Created By" value={live?.inviteUsed?.created_by || '—'} mono />
                                        <Field label="Expires At" value={live?.inviteUsed?.expires_at ? new Date(live?.inviteUsed.expires_at).toLocaleString() : 'Never'} />
                                    </Section>

                                    <Section icon="fa-user-astronaut" title="Onboarding Identity" color="indigo">
                                        <Field label="Admin Username" value={full.username || school.username || '—'} mono />
                                        <Field label="Initial Term" value={`${full.onboarding_term || '—'}`} badge badgeColor="indigo" />
                                        <Field label="Initial Year" value={`${full.onboarding_academic_year || '—'}`} badge badgeColor="indigo" />
                                    </Section>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="shrink-0 p-4 bg-red-50 border-t border-red-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center text-red-500 shrink-0">
                        <i className="fas fa-exclamation-triangle text-xs"></i>
                    </div>
                    <p className="text-[10px] text-red-600 font-medium leading-relaxed">
                        <span className="font-black">Sensitive Data.</span> You are viewing live cloud records. Handle with care.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SchoolDetails;
