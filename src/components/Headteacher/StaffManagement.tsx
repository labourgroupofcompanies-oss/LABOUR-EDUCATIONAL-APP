import React, { useState } from 'react';
import { db, type User } from '../../db';
import { useAuth } from '../../hooks/useAuth';
import { useLiveQuery } from 'dexie-react-hooks';
import { hashPassword } from '../../utils/auth';
import { supabase } from '../../supabaseClient';
import { dbService } from '../../services/dbService';
import { staffService } from '../../services/staffService';
import { showToast } from '../Common/Toast';
import { showConfirm } from '../Common/ConfirmDialog';
import { eduDb } from '../../eduDb';
import SyncStatusBadge from '../Common/SyncStatusBadge';

const StaffManagement: React.FC = () => {
    const { user: currentUser } = useAuth();

    // Replace manual staff state with useLiveQuery for real-time sync status updates
    const staff = useLiveQuery(
        async () => {
            if (currentUser?.schoolId) {
                return await dbService.staff.getAll(currentUser.schoolId);
            }
            return [];
        },
        [currentUser?.schoolId]
    ) || [];

    // Fetch all classes to determine assignment status
    const classes = useLiveQuery(
        async () => {
            if (currentUser?.schoolId) {
                return await dbService.classes.getAll(currentUser.schoolId);
            }
            return [];
        },
        [currentUser?.schoolId]
    ) || [];

    const classSubjects = useLiveQuery(
        async () => {
            if (currentUser?.schoolId) {
                return await eduDb.classSubjects.where('schoolId').equals(currentUser.schoolId).toArray();
            }
            return [];
        },
        [currentUser?.schoolId]
    ) || [];

    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [newStaff, setNewStaff] = useState({
        username: '',
        password: '',
        fullName: '',
        role: 'TEACHER' as 'TEACHER' | 'ACCOUNTANT',
        phoneNumber: '',
        email: '',
        qualification: '',
        specialization: '',
        gender: 'male' as 'male' | 'female',
        address: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [lastCreatedStaff, setLastCreatedStaff] = useState<{ username: string; name: string; tempPass?: string } | null>(null);

    const school = useLiveQuery(async () => {
        if (currentUser?.schoolId) {
            return await db.schools
                .where('schoolId').equals(currentUser.schoolId)
                .or('idCloud').equals(currentUser.schoolId)
                .first();
        }
        return null;
    }, [currentUser?.schoolId]);

    const copyToClipboard = async (text: string, description: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(`${description} copied to clipboard`, 'success');
        } catch (err) {
            console.error('Failed to copy:', err);
            showToast('Failed to copy to clipboard', 'error');
        }
    };

    const shareLoginLink = () => {
        const link = window.location.origin;
        copyToClipboard(link, 'Login link');
    };

    const shareStaffInvitationInfo = (s: User, tempPass?: string) => {
        const link = window.location.origin;
        const schoolName = school?.schoolName || 'the school';
        const schoolCode = school?.schoolCode || school?.idCloud || currentUser?.schoolId;
        
        let message = `Hello ${s.fullName},\n\nYour ${s.role?.toUpperCase() === 'ACCOUNTANT' ? 'Accountant' : 'Teacher'} portal access for ${schoolName} is ready.\n\n`;
        message += `Please use the following details to log in to your account:\n\n`;
        message += `🔗 Login URL: ${link}\n`;
        message += `🏫 School ID: ${schoolCode}\n`;
        message += `👤 Username: ${s.username}\n`;
        
        if (tempPass) {
            message += `🔑 Password: ${tempPass}\n\n`;
            message += `Please make sure to keep this password safe.\n`;
        } else {
            message += `🔑 Password: (Your pre-assigned password)\n`;
        }

        copyToClipboard(message, 'Account access details');
    };

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser?.schoolId) return;

        setIsLoading(true);
        console.log('[StaffManagement] Starting handleAddStaff...');

        const safetyTimeout = setTimeout(() => {
            setIsLoading(false);
            console.warn('[StaffManagement] Submit timed out (90s fallback).');
        }, 90000);

        try {
            if (editingId) {
                console.log('[StaffManagement] Mode: Update', { editingId });
                // UPDATE
                const updateData: Partial<User> = {
                    fullName: newStaff.fullName,
                    role: newStaff.role,
                    phoneNumber: newStaff.phoneNumber,
                    email: newStaff.email,
                    qualification: newStaff.qualification,
                    specialization: newStaff.specialization,
                    gender: newStaff.gender,
                    address: newStaff.address,
                };

                // Only hash and update password if provided
                if (newStaff.password) {
                    updateData.password = await hashPassword(newStaff.password);
                }

                const originalStaff = staff.find(s => s.id === editingId);
                if (!originalStaff) throw new Error("Staff record not found locally");

                const isOnlineSuccess = await staffService.updateStaffProfileOnlineFirst(
                    editingId, 
                    updateData, 
                    originalStaff, 
                    currentUser.schoolId
                );
                
                if (isOnlineSuccess) {
                    showToast(`${newStaff.fullName}'s profile saved & synced successfully`, 'success');
                } else {
                    showToast(`Saved locally. Network/RLS prevents instant sync.`, 'warning');
                }
            } else {
                // CREATE
                console.log('[StaffManagement] Checking username uniqueness locally...', newStaff.username);
                const existing = await dbService.staff.checkUsername(newStaff.username);
                console.log('[StaffManagement] Username check complete. Existing:', !!existing);
                if (existing) {
                    showToast('Username already taken locally', 'error');
                    setIsLoading(false);
                    return;
                }

                // 1. Create in Supabase (Cloud) ONLY IF ONLINE
                try {
                    if (!navigator.onLine) {
                        showToast('Staff creation requires internet connection because login accounts are created securely online first.', 'error');
                        setIsLoading(false);
                        return;
                    }

                    // CRITICAL: Double-check with the Auth server directly.
                    // getUser() forces a network check and is more reliable than getSession() in catching 401s early.
                    console.log('[StaffManagement] Validating session with auth.getUser()...');
                    const { data: { user: authUser }, error: authUserError } = await supabase.auth.getUser();
                    console.log('[StaffManagement] getUser() complete. Error:', authUserError?.message, 'User ID:', authUser?.id);

                    if (authUserError || !authUser) {
                        showToast('Session stale or invalid. Please Log Out and Log In again once to refresh your identity.', 'error');
                        return;
                    }

                    const formData = {
                        school_id: currentUser.schoolId,
                        full_name: newStaff.fullName,
                        gender: newStaff.gender ? (newStaff.gender.charAt(0).toUpperCase() + newStaff.gender.slice(1)) : 'Other',
                        phone: newStaff.phoneNumber,
                        email: newStaff.email,
                        qualification: newStaff.qualification,
                        specialization: newStaff.specialization,
                        role: 'staff',
                        username: newStaff.username,
                        password: newStaff.password,
                        address: newStaff.address,
                    };

                    // Map UI role (TEACHER/ACCOUNTANT/HEADTEACHER) to a valid Edge Function role.
                    // Headteachers map to 'headteacher'; teachers and accountants pass through.
                    const uiRole = newStaff.role.toLowerCase();
                    const targetRole = uiRole === 'headteacher' ? 'headteacher' : uiRole;

                    console.log('[StaffManagement] Calling staffService.createStaff...', { username: formData.username, targetRole });
                    // ONLINE-FIRST: Identity created in cloud first, service handles local cache on success.
                    await staffService.createStaff({
                        ...formData,
                        role: targetRole as any
                    } as any);
                    console.log('[StaffManagement] staffService.createStaff Success.');

                } catch (staffErr: any) {
                    console.warn('[Security] Staff account creation could not be completed.');
                    const errorMsg = staffErr.message || '';

                    if (errorMsg === 'MISSING_SESSION' || errorMsg === '401_UNAUTHORIZED') {
                        showToast('Authentication failed. Please re-login.', 'error');
                    } else if (errorMsg.includes('requires internet connection')) {
                        showToast(errorMsg, 'error');
                    } else if (errorMsg.includes('already registered') || errorMsg.includes('already exists')) {
                        showToast('Registration Conflict: This username may already be in use.', 'error');
                    } else if (errorMsg === 'UNAUTHORIZED_ROLE' || errorMsg.includes('403')) {
                        showToast('Access Denied: Only headteachers can create staff.', 'error');
                    } else if (errorMsg.includes('401') || errorMsg.includes('unauthorized') || errorMsg.includes('session stale')) {
                        showToast('Your session has expired or is stale. Please Log Out and Log In again.', 'error');
                    } else {
                        showToast(staffErr.message || 'Staff account creation could not be completed online. Check your connection.', 'error');
                    }
                    
                    setIsLoading(false);
                    return; // Early exit to prevent partial UI state corruption
                }

                // SUCCESS
                showToast(`${newStaff.role} account created and sync started!`, 'success');
                setLastCreatedStaff({
                    name: newStaff.fullName,
                    username: newStaff.username,
                    tempPass: newStaff.password,
                });
            }

            handleCancel();
        } catch (err: any) {
            console.error('[StaffManagement] Error caught in handleAddStaff:', err);
            const errMsg = err.message?.toLowerCase();
            if (errMsg?.includes('fetch') || errMsg?.includes('network')) {
                showToast('Network unstable. Local data saved but cloud sync failed.', 'warning');
            } else {
                showToast(err.message || 'Failed to save staff member', 'error');
            }
        } finally {
            clearTimeout(safetyTimeout);
            setIsLoading(false);
        }
    };

    const handleEdit = (s: User) => {
        setEditingId(s.id!);
        setNewStaff({
            username: s.username,
            password: '',
            fullName: s.fullName,
            // Normalize to uppercase so the select finds the correct option (TEACHER / ACCOUNTANT).
            // Cloud pulls store lowercase roles; the local User type and option values use uppercase.
            role: (s.role?.toUpperCase() as any) || 'TEACHER',
            phoneNumber: s.phoneNumber || '',
            email: s.email || '',
            qualification: s.qualification || '',
            specialization: s.specialization || '',
            gender: (s.gender as any) || 'male',
            address: s.address || '',
        });
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsAdding(false);
        setEditingId(null);
        setNewStaff({
            username: '',
            password: '',
            fullName: '',
            role: 'TEACHER',
            phoneNumber: '',
            email: '',
            qualification: '',
            specialization: '',
            gender: 'male',
            address: '',
        });
    };

    const handleDeleteStaff = async (staffId: number, staffName: string) => {
        if (!currentUser?.schoolId) return;

        const confirmed = await showConfirm({
            title: 'Remove Staff Member',
            message: `Are you sure you want to remove ${staffName}? This will also un-assign them from any class or subject.`,
            confirmText: 'Remove',
            cancelText: 'Keep',
            variant: 'danger',
        });
        if (confirmed) {
            try {
                await dbService.staff.delete(currentUser.schoolId, staffId);
                showToast(`${staffName} removed successfully`, 'success');
            } catch (err) {
                console.error('Failed to delete staff:', err);
                showToast('Failed to remove staff member', 'error');
            }
        }
    };

    return (
        <div className="mt-12 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Staff Directory</h2>
                    <p className="text-sm text-gray-400 font-medium">Manage teacher and accountant access</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <button
                        onClick={shareLoginLink}
                        className="btn-outline flex-1 md:flex-none border-gray-200 text-gray-700 hover:bg-gray-50"
                        title="Copy Login Page Link"
                    >
                        <i className="fas fa-link text-primary"></i>
                        Share Link
                    </button>
                    <button
                        onClick={() => {
                            setIsAdding(!isAdding);
                            setLastCreatedStaff(null);
                        }}
                        className={`btn-primary flex-1 md:flex-none ${isAdding ? '!from-slate-400 !to-slate-500 shadow-slate-200' : ''}`}
                    >
                        <i className={`fas ${isAdding ? 'fa-times' : 'fa-plus'}`}></i>
                        {isAdding ? 'Cancel' : 'Add Staff Member'}
                    </button>
                </div>
            </div>

            {lastCreatedStaff && !isAdding && (
                <div className="mb-8 p-6 bg-green-50 border-2 border-green-100 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 animate-fadeIn">
                    <div className="flex items-center gap-4 text-center md:text-left">
                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-green-500 shadow-sm border border-green-100">
                            <i className="fas fa-check-circle text-2xl"></i>
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-green-800">Staff Account Ready!</h3>
                            <p className="text-green-600 text-sm font-medium">You can now share access details with **{lastCreatedStaff.name}**.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            const staffObj = staff.find(s => s.username === lastCreatedStaff.username);
                            if (staffObj) shareStaffInvitationInfo(staffObj, lastCreatedStaff.tempPass);
                        }}
                        className="btn-success w-full md:w-auto"
                    >
                        <i className="fas fa-share-alt"></i>
                        Copy & Share Credentials
                    </button>
                </div>
            )}

            {isAdding && (
                <form onSubmit={handleAddStaff} className="premium-card p-6 md:p-10 mb-8 space-y-8 animate-slideDown overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full -translate-y-16 translate-x-16"></div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 relative z-10">
                        {/* Primary Identity */}
                        <div className="space-y-2 lg:col-span-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Full Name</label>
                            <input
                                type="text"
                                value={newStaff.fullName}
                                onChange={(e) => setNewStaff({ ...newStaff, fullName: e.target.value })}
                                required
                                className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700"
                                placeholder="e.g. Ama Serwaa"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Gender</label>
                            <select
                                value={newStaff.gender}
                                onChange={(e) => setNewStaff({ ...newStaff, gender: e.target.value as any })}
                                className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700"
                            >
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </div>

                        {/* Contact & Professional */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Phone Number</label>
                            <input
                                type="tel"
                                value={newStaff.phoneNumber}
                                onChange={(e) => setNewStaff({ ...newStaff, phoneNumber: e.target.value })}
                                required
                                className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700"
                                placeholder="+233..."
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Email Address</label>
                            <input
                                type="email"
                                value={newStaff.email}
                                onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                                className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700"
                                placeholder="ama@email.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Qualification</label>
                            <input
                                type="text"
                                value={newStaff.qualification}
                                onChange={(e) => setNewStaff({ ...newStaff, qualification: e.target.value })}
                                className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700"
                                placeholder="e.g. B.Ed Education"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Specialization</label>
                            <input
                                type="text"
                                value={newStaff.specialization}
                                onChange={(e) => setNewStaff({ ...newStaff, specialization: e.target.value })}
                                className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700"
                                placeholder="e.g. Mathematics"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">System Role</label>
                            <select
                                value={newStaff.role}
                                onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as any })}
                                className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700"
                            >
                                <option value="TEACHER">Teacher</option>
                                <option value="ACCOUNTANT">Accountant</option>
                            </select>
                        </div>

                        {/* Account Access */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Username</label>
                            <input
                                type="text"
                                value={newStaff.username}
                                onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
                                required
                                disabled={!!editingId}
                                className={`w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700 ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
                                placeholder="aserwaa"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Security Password</label>
                            <input
                                type="text"
                                value={newStaff.password}
                                onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                                required={!editingId}
                                className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700 font-mono"
                                placeholder={editingId ? "Leave blank to keep current" : "Set password"}
                            />
                        </div>

                        {/* Full Width Address */}
                        <div className="space-y-2 md:col-span-2 lg:col-span-3">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Residential Address</label>
                            <textarea
                                value={newStaff.address}
                                onChange={(e) => setNewStaff({ ...newStaff, address: e.target.value })}
                                className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-bold text-gray-700 min-h-[100px]"
                                placeholder="House number, Street, City..."
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4 relative z-10">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="btn-secondary flex-1"
                        >
                            Discard
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-primary flex-[2]"
                        >
                            {isLoading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className={`fas ${editingId ? 'fa-save' : 'fa-plus-circle'}`}></i>}
                            {editingId ? 'Save Changes' : 'Create Staff Member'}
                        </button>
                    </div>
                </form>
            )}

            {/* Desktop Table View */}
            <div className="hidden md:block premium-card overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                        <tr>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Staff Identification</th>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">System Access</th>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Designated Role</th>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Sync Status</th>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Commission Date</th>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Access Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {staff.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-8 py-20 text-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                                        <i className="fas fa-users-slash text-2xl"></i>
                                    </div>
                                    <p className="text-gray-400 font-bold italic">No auxiliary staff members commissioned.</p>
                                </td>
                            </tr>
                        ) : (
                            staff.map((s) => {
                                const isHeadteacher = s.role?.toUpperCase() === 'HEADTEACHER';
                                const isAccountant = s.role?.toUpperCase() === 'ACCOUNTANT';
                                // Build a set of all IDs this staff member may be stored as:
                                // - numeric local ID string (legacy)
                                // - Supabase UUID (post-sync)
                                // - username (post-migration)
                                const staffIdSet = new Set<string>([
                                    s.username,
                                    ...(s.id ? [s.id.toString()] : []),
                                    ...((s as any).idCloud ? [(s as any).idCloud] : []),
                                ]);
                                const assignedClasses = classes.filter(c => c.classTeacherId && staffIdSet.has(c.classTeacherId));
                                const isClassTeacher = assignedClasses.length > 0;
                                const isSubjectTeacher = classSubjects.some(cs => cs.teacherId && staffIdSet.has(cs.teacherId));

                                let statusColor = 'bg-gray-50 text-gray-400';
                                let statusLabel = s.role === 'TEACHER' ? 'Teacher' : (s.role === 'ACCOUNTANT' ? 'Accountant' : (s.role === 'HEADTEACHER' ? 'Headteacher' : 'Staff'));

                                if (isHeadteacher) {
                                    statusColor = 'bg-blue-600 text-white border-blue-700 shadow-md';
                                    statusLabel = 'Headteacher';
                                } else if (isAccountant) {
                                    statusColor = 'bg-purple-50 text-purple-600 border-purple-100';
                                    statusLabel = 'Accountant';
                                } else if (isClassTeacher) {
                                    const classNames = assignedClasses.map(c => c.name).join(', ');
                                    if (isSubjectTeacher) {
                                        statusColor = 'bg-green-50 text-green-600 border-green-100';
                                        statusLabel = `${classNames} & Subject Teacher`;
                                    } else {
                                        statusColor = 'bg-blue-50 text-blue-600 border-blue-100';
                                        statusLabel = classNames;
                                    }
                                } else if (isSubjectTeacher) {
                                    statusColor = 'bg-orange-50 text-orange-600 border-orange-100';
                                    statusLabel = 'Subject Teacher';
                                }

                                return (
                                    <tr key={s.id} onClick={() => handleEdit(s)} className="hover:bg-blue-50/30 transition-all group cursor-pointer">
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-sm group-hover:scale-110 transition-transform ${isHeadteacher ? 'bg-blue-600 text-white' : statusColor}`}>
                                                    {s.fullName.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-black text-gray-800 group-hover:text-primary transition-colors">{s.fullName}</div>
                                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{isHeadteacher ? 'School Administrator' : (s.qualification || 'Internal Member')}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                <span className="text-gray-500 font-mono text-sm font-bold">{s.username}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${statusColor}`}>
                                                {statusLabel}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <SyncStatusBadge status={s.syncStatus} />
                                        </td>
                                        <td className="px-8 py-5 text-center text-gray-400 text-sm font-bold">
                                            {new Date(s.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); shareStaffInvitationInfo(s); }}
                                                    className="btn-icon !w-8 !h-8 !rounded-full !bg-indigo-50 !text-indigo-500 opacity-0 group-hover:opacity-100"
                                                    title="Share Access Details"
                                                >
                                                    <i className="fas fa-share-alt text-[10px]"></i>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEdit(s); }}
                                                    className="btn-icon !w-8 !h-8 !rounded-full !bg-blue-50 !text-blue-500 opacity-0 group-hover:opacity-100"
                                                    title="Edit Staff"
                                                >
                                                    <i className="fas fa-edit text-[10px]"></i>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteStaff(s.id!, s.fullName); }}
                                                    className="btn-icon !w-8 !h-8 !rounded-full !bg-red-50 !text-red-500 opacity-0 group-hover:opacity-100"
                                                    title="Delete Staff"
                                                >
                                                    <i className="fas fa-trash-alt text-[10px]"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {staff.length === 0 ? (
                    <div className="premium-card p-12 text-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                            <i className="fas fa-users-slash text-2xl"></i>
                        </div>
                        <p className="text-gray-400 font-bold italic">No auxiliary staff members commissioned.</p>
                    </div>
                ) : (
                    staff.map((s) => {
                        const isHeadteacher = s.role?.toUpperCase() === 'HEADTEACHER';
                        const isAccountant = s.role?.toUpperCase() === 'ACCOUNTANT';
                        // Build a set of all IDs this staff member may be stored as:
                        // - numeric local ID string (legacy)
                        // - Supabase UUID (post-sync)
                        // - username (post-migration)
                        const staffIdSet = new Set<string>([
                            s.username,
                            ...(s.id ? [s.id.toString()] : []),
                            ...((s as any).idCloud ? [(s as any).idCloud] : []),
                        ]);
                        const assignedClasses = classes.filter(c => c.classTeacherId && staffIdSet.has(c.classTeacherId));
                        const isClassTeacher = assignedClasses.length > 0;
                        const isSubjectTeacher = classSubjects.some(cs => cs.teacherId && staffIdSet.has(cs.teacherId));

                        let statusColor = 'bg-gray-50 text-gray-400';
                        let statusLabel = s.role === 'TEACHER' ? 'Teacher' : (s.role === 'ACCOUNTANT' ? 'Accountant' : (s.role === 'HEADTEACHER' ? 'Headteacher' : 'Staff'));
                        let borderColor = 'border-l-gray-300';

                        if (isHeadteacher) {
                            statusColor = 'bg-blue-600 text-white';
                            statusLabel = 'Headteacher';
                            borderColor = 'border-l-blue-600';
                        } else if (isAccountant) {
                            statusColor = 'bg-purple-50 text-purple-600';
                            statusLabel = 'Accountant';
                            borderColor = 'border-l-purple-500';
                        } else if (isClassTeacher) {
                            const classNames = assignedClasses.map(c => c.name).join(', ');
                            if (isSubjectTeacher) {
                                statusColor = 'bg-green-50 text-green-600';
                                statusLabel = `${classNames} & Subject Teacher`;
                                borderColor = 'border-l-green-500';
                            } else {
                                statusColor = 'bg-blue-50 text-blue-600';
                                statusLabel = classNames;
                                borderColor = 'border-l-blue-500';
                            }
                        } else if (isSubjectTeacher) {
                            statusColor = 'bg-orange-50 text-orange-600';
                            statusLabel = 'Subject Teacher';
                            borderColor = 'border-l-orange-500';
                        }

                        return (
                            <div key={s.id} onClick={() => handleEdit(s)} className={`premium-card p-6 flex items-start justify-between gap-4 border-l-4 ${borderColor} active:scale-95 transition-all cursor-pointer`}>
                                <div className="flex gap-4 min-w-0">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-sm flex-shrink-0 ${isHeadteacher ? 'bg-blue-600 text-white' : statusColor}`}>
                                        {s.fullName.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-black text-gray-800 truncate">{s.fullName}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                            <span className="text-gray-500 font-mono text-xs font-bold leading-none">{s.username}</span>
                                            <SyncStatusBadge status={s.syncStatus} showLabel={false} />
                                        </div>
                                        <div className="flex gap-2 mt-3 items-center">
                                            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${statusColor} border`}>
                                                {statusLabel}
                                            </span>
                                            <span className="text-gray-400 text-[10px] font-bold">
                                                {s.phoneNumber || 'No Phone'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); shareStaffInvitationInfo(s); }}
                                        className="btn-icon !bg-indigo-50 !text-indigo-500 shadow-sm"
                                        title="Share Access Details"
                                    >
                                        <i className="fas fa-share-alt"></i>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleEdit(s); }}
                                        className="btn-icon !bg-blue-50 !text-blue-500 shadow-sm"
                                        title="Edit Staff"
                                    >
                                        <i className="fas fa-edit"></i>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteStaff(s.id!, s.fullName); }}
                                        className="btn-icon !bg-red-50 !text-red-500 shadow-sm"
                                        title="Delete Staff"
                                    >
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

        </div>
    );
};

export default StaffManagement;
