import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabaseClient';
import { type School } from '../../db';
import SchoolDetails from './SchoolDetails';
import PasswordResetTool from './PasswordResetTool';

const SchoolRegistry: React.FC = () => {
    const [schools, setSchools] = useState<School[]>([]);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<string | number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
    const [activeModal, setActiveModal] = useState<'details' | 'password' | null>(null);

    useEffect(() => {
        fetchSchools();
    }, []);

    const fetchSchools = async () => {
        setLoading(true);
        try {
            const [schoolsRes, subsRes] = await Promise.all([
                supabase.from('schools').select('*').order('created_at', { ascending: false }),
                supabase.from('school_subscriptions').select('school_id, status, term, academic_year')
                    .in('status', ['active', 'trial'])
            ]);

            if (schoolsRes.error) throw schoolsRes.error;

            const enrichedSchools = (schoolsRes.data || []).map(s => {
                const sub = subsRes.data?.find(sub => sub.school_id === (s as any).school_id || sub.school_id === s.id);
                return { ...s, subscription: sub };
            });

            setSchools(enrichedSchools);
        } catch (err) {
            console.error('Failed to fetch schools:', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleSchoolStatus = async (school: any) => {
        setToggling(school.id);
        const newStatus = !(school.is_active ?? true);
        try {
            const { error } = await supabase
                .from('schools')
                .update({ is_active: newStatus })
                .eq('id', school.id);

            if (error) throw error;

            // Log action
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('developer_actions').insert([{
                    admin_id: user.id,
                    action: newStatus ? 'ACTIVATE_SCHOOL' : 'DEACTIVATE_SCHOOL',
                    target_id: school.school_id || school.id,
                    details: { school_name: school.school_name }
                }]);
            }

            fetchSchools();
        } catch (err) {
            console.error('Failed to toggle school status:', err);
        } finally {
            setToggling(null);
        }
    };

    const filteredSchools = schools.filter(s => {
        const name = (s as any).school_name || s.schoolName || '';
        const id = (s as any).school_code || s.schoolCode || '';
        const district = s.district || '';

        return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            district.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i>
                    <input
                        type="text"
                        placeholder="Search schools..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 rounded-2xl bg-white border border-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-bold text-slate-700 shadow-sm text-sm"
                    />
                </div>

                <button
                    onClick={fetchSchools}
                    className="w-full md:w-auto px-6 py-4 bg-white border border-slate-100 rounded-2xl text-slate-500 hover:text-blue-500 hover:border-blue-100 transition-all shadow-sm flex items-center justify-center gap-2 font-bold text-sm"
                >
                    <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`}></i>
                    Refresh List
                </button>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px] md:min-w-0">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 md:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">School Identity</th>
                                <th className="hidden lg:table-cell px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">System ID</th>
                                <th className="hidden xl:table-cell px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Subscription</th>
                                <th className="hidden md:table-cell px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                                <th className="hidden xl:table-cell px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Onboarded</th>
                                <th className="px-6 md:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Sync Status</th>
                                <th className="px-6 md:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-slate-400 font-bold animate-pulse text-xs uppercase tracking-widest">Accessing Global Registry...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredSchools.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-20 text-center text-slate-400 font-bold italic">
                                        No schools matching your search.
                                    </td>
                                </tr>
                            ) : (
                                filteredSchools.map((school) => (
                                    <tr key={(school as any).school_code || school.schoolCode || (school as any).id} className="hover:bg-slate-50/50 transition-all group">
                                        <td className="px-6 md:px-8 py-6">
                                            <div className="flex items-center gap-3 md:gap-4">
                                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-black shadow-inner group-hover:bg-blue-50 group-hover:text-blue-500 transition-all text-sm md:text-base">
                                                    {((school as any).school_name || school.schoolName || 'S').charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-black text-slate-800 text-sm md:text-base truncate max-w-[150px] md:max-w-none">{(school as any).school_name || school.schoolName || 'Unnamed School'}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate max-w-[150px] md:max-w-none">{school.email || (school as any).username || 'No Email'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="hidden lg:table-cell px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                <div className="px-3 py-1 bg-slate-100 rounded-lg text-slate-500 font-mono text-[11px] font-black uppercase group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                                                    {(school as any).school_code || school.schoolCode}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="hidden xl:table-cell px-8 py-6">
                                            <div className="flex flex-col gap-1">
                                                {(school as any).subscription ? (
                                                    <>
                                                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border self-start ${(school as any).subscription.status === 'trial' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${(school as any).subscription.status === 'trial' ? 'bg-emerald-500' : 'bg-blue-500'}`}></span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest">
                                                                {(school as any).subscription.status === 'trial' ? 'Free Trial' : 'Professional'}
                                                            </span>
                                                        </div>
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">{(school as any).subscription.term} • {(school as any).subscription.academic_year}</p>
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 text-slate-400 rounded-lg self-start">
                                                        <span className="text-[9px] font-black uppercase tracking-widest">No Plan</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="hidden md:table-cell px-8 py-6">
                                            <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                                                <i className="fas fa-map-marker-alt text-red-300 text-xs"></i>
                                                {school.district}
                                            </div>
                                        </td>
                                        <td className="hidden xl:table-cell px-8 py-6 text-center text-slate-400 font-bold text-xs">
                                            {school.created_at ? new Date(school.created_at).toLocaleDateString() : 'N/A'}
                                        </td>
                                        <td className="px-6 md:px-8 py-6">
                                            <div className="flex flex-col items-center gap-1">
                                                {(() => {
                                                    const lastSync = (school as any).last_sync_at;
                                                    if (!lastSync) return (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-500 rounded-lg border border-red-100">
                                                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest">Never</span>
                                                        </div>
                                                    );

                                                    const diff = Date.now() - new Date(lastSync).getTime();
                                                    const hours = diff / (1000 * 60 * 60);

                                                    if (hours < 24) return (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-600 rounded-lg border border-green-100">
                                                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest">Active</span>
                                                        </div>
                                                    );
                                                    if (hours < 72) return (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-600 rounded-lg border border-amber-100">
                                                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest">Idle</span>
                                                        </div>
                                                    );
                                                    return (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-500 rounded-lg border border-red-100">
                                                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest">Offline</span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-6 md:px-8 py-6 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSchoolStatus(school); }}
                                                    disabled={toggling === (school as any).id}
                                                    className={`w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center transition-all ${
                                                        (school as any).is_active ?? true 
                                                        ? 'bg-green-50 text-green-500 hover:bg-green-600 hover:text-white' 
                                                        : 'bg-red-50 text-red-500 hover:bg-red-600 hover:text-white'
                                                    }`}
                                                    title={(school as any).is_active ?? true ? 'Deactivate School' : 'Activate School'}
                                                >
                                                    {toggling === (school as any).id ? <i className="fas fa-spinner animate-spin"></i> : <i className={`fas ${(school as any).is_active ?? true ? 'fa-unlock' : 'fa-lock'} text-xs`}></i>}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { 
                                                        e.preventDefault(); e.stopPropagation(); 
                                                        console.log("Details clicked for:", school); 
                                                        setSelectedSchool(school); setActiveModal('details'); 
                                                    }}
                                                    className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                                    title="View Insight"
                                                >
                                                    <i className="fas fa-eye text-xs"></i>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { 
                                                        e.preventDefault(); e.stopPropagation(); 
                                                        console.log("Password clicked for:", school); 
                                                        setSelectedSchool(school); setActiveModal('password'); 
                                                    }}
                                                    className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-all shadow-sm"
                                                    title="Reset Access"
                                                >
                                                    <i className="fas fa-key text-xs"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        Total Schools: {filteredSchools.length}
                    </p>
                    <div className="flex items-center gap-4">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-center">
                            <i className="fas fa-info-circle mr-2 text-blue-400"></i>
                            Real-time Cloud Data
                        </p>
                    </div>
                </div>
            </div>

            {/* Modals using Portal to prevent CSS clipping */}
            {activeModal === 'details' && selectedSchool && createPortal(
                <SchoolDetails
                    school={selectedSchool}
                    onClose={() => { setActiveModal(null); setSelectedSchool(null); }}
                />,
                document.body
            )}

            {activeModal === 'password' && selectedSchool && createPortal(
                <PasswordResetTool
                    school={selectedSchool}
                    onClose={() => { setActiveModal(null); setSelectedSchool(null); }}
                />,
                document.body
            )}
        </div>
    );
};

export default SchoolRegistry;
