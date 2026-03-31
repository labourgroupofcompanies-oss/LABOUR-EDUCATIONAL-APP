import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { showToast } from '../Common/Toast';
import { showConfirm } from '../Common/ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';

interface SchoolInvite {
    id: string;
    created_at: string;
    created_by: string;
    is_used: boolean;
    used_at: string | null;
    used_by: string | null;
    notes: string | null;
    revoked_at: string | null;
    revoked_by: string | null;
}

type InviteStatus = 'active' | 'used' | 'revoked';

function getInviteStatus(invite: SchoolInvite): InviteStatus {
    if (invite.revoked_at) return 'revoked';
    if (invite.is_used) return 'used';
    return 'active';
}

const StatusBadge: React.FC<{ status: InviteStatus }> = ({ status }) => {
    if (status === 'active') {
        return (
            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 font-bold text-[10px] uppercase tracking-widest rounded-lg inline-flex items-center gap-1.5 border border-emerald-100">
                <i className="fas fa-circle text-[6px] animate-pulse"></i> Active
            </span>
        );
    }
    if (status === 'revoked') {
        return (
            <span className="px-3 py-1 bg-red-50 text-red-500 font-bold text-[10px] uppercase tracking-widest rounded-lg inline-flex items-center gap-1.5 border border-red-100">
                <i className="fas fa-ban text-[8px]"></i> Revoked
            </span>
        );
    }
    // used
    return (
        <span className="px-3 py-1 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-widest rounded-lg inline-flex items-center gap-1.5 border border-slate-100">
            <i className="fas fa-check text-[8px]"></i> Used
        </span>
    );
};

const SchoolInvites: React.FC = () => {
    const { user } = useAuth();
    const [invites, setInvites] = useState<SchoolInvite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        fetchInvites();
    }, []);

    const fetchInvites = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('school_invites')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setInvites(data || []);
        } catch (err: any) {
            console.error('Error fetching invites:', err);
            showToast('Failed to load invites: ' + err.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const generateInvite = async () => {
        if (!user) return;
        setIsGenerating(true);
        try {
            const { error } = await supabase
                .from('school_invites')
                .insert({
                    created_by: user.id,
                    notes: notes.trim() || null
                })
                .select()
                .single();

            if (error) throw error;
            showToast('Secure invite generated successfully', 'success');
            setNotes('');
            fetchInvites();
        } catch (err: any) {
            console.error('Error generating invite:', err);
            showToast('Failed to generate invite: ' + err.message, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const revokeInvite = async (invite: SchoolInvite) => {
        const confirmed = await showConfirm({
            title: 'Revoke Invite Link',
            message: `This will permanently disable the invite${invite.notes ? ` for "${invite.notes}"` : ''}. The link will stop working immediately. You can re-activate it later.`,
            confirmText: 'Revoke Link',
            cancelText: 'Keep Active',
            variant: 'danger',
        });
        if (!confirmed) return;

        setActionLoading(invite.id);
        try {
            const { error } = await supabase
                .from('school_invites')
                .update({
                    revoked_at: new Date().toISOString(),
                    revoked_by: user?.id ?? null,
                })
                .eq('id', invite.id);

            if (error) throw error;
            showToast('Invite link has been revoked', 'success');
            fetchInvites();
        } catch (err: any) {
            showToast('Failed to revoke invite: ' + err.message, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const reactivateInvite = async (invite: SchoolInvite) => {
        const confirmed = await showConfirm({
            title: 'Re-activate Invite Link',
            message: `This will make the invite${invite.notes ? ` for "${invite.notes}"` : ''} active again. Anyone with the link will be able to register a new school.`,
            confirmText: 'Re-activate',
            cancelText: 'Cancel',
            variant: 'warning',
        });
        if (!confirmed) return;

        setActionLoading(invite.id);
        try {
            const { error } = await supabase
                .from('school_invites')
                .update({
                    revoked_at: null,
                    revoked_by: null,
                })
                .eq('id', invite.id);

            if (error) throw error;
            showToast('Invite link re-activated', 'success');
            fetchInvites();
        } catch (err: any) {
            showToast('Failed to re-activate invite: ' + err.message, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const copyInviteLink = (inviteId: string) => {
        const link = `${window.location.origin}/?invite=${inviteId}`;
        navigator.clipboard.writeText(link)
            .then(() => showToast('Invite link copied to clipboard', 'success'))
            .catch(() => showToast('Failed to copy link', 'error'));
    };

    const activeCount = invites.filter(i => getInviteStatus(i) === 'active').length;
    const usedCount = invites.filter(i => getInviteStatus(i) === 'used').length;
    const revokedCount = invites.filter(i => getInviteStatus(i) === 'revoked').length;

    return (
        <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Active Links', value: activeCount, color: 'emerald', icon: 'fa-circle-dot' },
                    { label: 'Used (Schools)', value: usedCount, color: 'slate', icon: 'fa-check-circle' },
                    { label: 'Revoked', value: revokedCount, color: 'red', icon: 'fa-ban' },
                ].map(stat => (
                    <div key={stat.label} className={`bg-${stat.color}-50 border border-${stat.color}-100 rounded-2xl p-4 flex items-center gap-3`}>
                        <div className={`w-10 h-10 bg-${stat.color}-100 text-${stat.color}-600 rounded-xl flex items-center justify-center shrink-0`}>
                            <i className={`fas ${stat.icon}`}></i>
                        </div>
                        <div>
                            <p className={`text-2xl font-black text-${stat.color}-700`}>{stat.value}</p>
                            <p className={`text-[10px] font-bold uppercase tracking-widest text-${stat.color}-400`}>{stat.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Generate New Invite Card */}
            <div className="bg-white p-6 rounded-[2rem] border border-blue-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <div className="flex-1">
                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                                <i className="fas fa-ticket-alt"></i>
                            </div>
                            Create One-Time Invite
                        </h3>
                        <p className="text-sm text-gray-500 font-medium">
                            Generate a secure, single-use token to allow a new Headteacher to onboard their school. The link auto-expires immediately after successful registration.
                        </p>
                    </div>

                    <div className="flex max-w-sm w-full gap-3">
                        <input
                            type="text"
                            placeholder="Optional label (e.g. 'Accra Academy')"
                            className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 outline-none focus:border-blue-500 font-medium text-sm"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && generateInvite()}
                        />
                        <button
                            disabled={isGenerating}
                            onClick={generateInvite}
                            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition disabled:opacity-50 shrink-0"
                        >
                            {isGenerating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-plus"></i>}
                            Generate
                        </button>
                    </div>
                </div>
            </div>

            {/* Invite List */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">All Invites</h3>
                    <button onClick={fetchInvites} className="text-gray-400 hover:text-blue-500 transition" title="Refresh">
                        <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin text-blue-500' : ''}`}></i>
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                <th className="p-4 border-b border-gray-100">Token</th>
                                <th className="p-4 border-b border-gray-100">Generated</th>
                                <th className="p-4 border-b border-gray-100">Label</th>
                                <th className="p-4 border-b border-gray-100">Status</th>
                                <th className="p-4 border-b border-gray-100">Activity</th>
                                <th className="p-4 border-b border-gray-100 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm font-medium text-gray-700">
                            {invites.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-gray-400 font-bold">
                                        <i className="fas fa-ticket-alt text-3xl text-gray-100 block mb-3"></i>
                                        No invites generated yet.
                                    </td>
                                </tr>
                            )}
                            {isLoading && invites.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center">
                                        <i className="fas fa-spinner fa-spin text-blue-400 text-2xl"></i>
                                    </td>
                                </tr>
                            )}
                            {invites.map((invite) => {
                                const status = getInviteStatus(invite);
                                const isThisLoading = actionLoading === invite.id;

                                return (
                                    <tr key={invite.id} className="hover:bg-gray-50/50 transition border-b border-gray-50 last:border-0">
                                        {/* Token */}
                                        <td className="p-4 font-mono text-xs" title={invite.id}>
                                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                                                {invite.id.split('-')[0]}
                                                <span className="text-gray-300">••••</span>
                                            </span>
                                        </td>

                                        {/* Generated */}
                                        <td className="p-4 text-gray-500 whitespace-nowrap text-xs">
                                            {new Date(invite.created_at).toLocaleDateString()}<br />
                                            <span className="text-gray-400">{new Date(invite.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </td>

                                        {/* Label */}
                                        <td className="p-4 text-gray-600 max-w-[160px] truncate">
                                            {invite.notes && invite.notes !== 'Cancelled by Developer'
                                                ? invite.notes
                                                : <span className="text-gray-300 italic text-xs">No label</span>
                                            }
                                        </td>

                                        {/* Status */}
                                        <td className="p-4">
                                            <StatusBadge status={status} />
                                        </td>

                                        {/* Activity timestamp */}
                                        <td className="p-4 text-xs text-gray-400 whitespace-nowrap">
                                            {status === 'used' && invite.used_at && (
                                                <span title="Used at">
                                                    <i className="fas fa-check-circle text-slate-300 mr-1.5"></i>
                                                    {new Date(invite.used_at).toLocaleDateString()}
                                                </span>
                                            )}
                                            {status === 'revoked' && invite.revoked_at && (
                                                <span title="Revoked at">
                                                    <i className="fas fa-ban text-red-300 mr-1.5"></i>
                                                    {new Date(invite.revoked_at).toLocaleDateString()}
                                                </span>
                                            )}
                                            {status === 'active' && (
                                                <span className="text-emerald-400 font-bold text-[10px] uppercase tracking-widest">
                                                    Ready
                                                </span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="p-4">
                                            <div className="flex justify-end gap-2">
                                                {/* Copy link — only for active */}
                                                <button
                                                    onClick={() => copyInviteLink(invite.id)}
                                                    disabled={status !== 'active'}
                                                    className={`w-9 h-9 flex justify-center items-center rounded-lg transition text-sm ${status === 'active'
                                                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                        }`}
                                                    title="Copy invite link"
                                                >
                                                    <i className="fas fa-link"></i>
                                                </button>

                                                {/* Revoke — only for active */}
                                                {status === 'active' && (
                                                    <button
                                                        onClick={() => revokeInvite(invite)}
                                                        disabled={isThisLoading}
                                                        className="w-9 h-9 flex justify-center items-center rounded-lg transition bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50"
                                                        title="Revoke invite link"
                                                    >
                                                        {isThisLoading
                                                            ? <i className="fas fa-spinner fa-spin text-xs"></i>
                                                            : <i className="fas fa-ban"></i>
                                                        }
                                                    </button>
                                                )}

                                                {/* Re-activate — only for revoked */}
                                                {status === 'revoked' && (
                                                    <button
                                                        onClick={() => reactivateInvite(invite)}
                                                        disabled={isThisLoading}
                                                        className="w-9 h-9 flex justify-center items-center rounded-lg transition bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"
                                                        title="Re-activate invite link"
                                                    >
                                                        {isThisLoading
                                                            ? <i className="fas fa-spinner fa-spin text-xs"></i>
                                                            : <i className="fas fa-rotate-left"></i>
                                                        }
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2">
                <span><i className="fas fa-circle text-[6px] text-emerald-400 mr-1.5"></i>Active — usable link</span>
                <span><i className="fas fa-check text-[8px] text-slate-400 mr-1.5"></i>Used — school onboarded</span>
                <span><i className="fas fa-ban text-[8px] text-red-400 mr-1.5"></i>Revoked — disabled by developer</span>
            </div>
        </div>
    );
};

export default SchoolInvites;
