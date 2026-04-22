import React, { useState, useEffect } from 'react';
import { db, type School, type User } from '../db';
import { eduDb } from '../eduDb';
import { syncService } from '../services/syncService';
import { generateSchoolId } from '../utils/idGenerator';
import { getSupabaseEmail, hashPassword, setSession } from '../utils/auth';
import { supabase } from '../supabaseClient';

type Step = 1 | 2 | 3 | 4;

export interface SchoolOnboardingProps {
    onComplete: (schoolCode: string) => void;
    onLogin?: () => void;
}

const SchoolOnboarding: React.FC<SchoolOnboardingProps> = ({ onComplete, onLogin }) => {
    const [step, setStep] = useState<Step>(1);
    const [formData, setFormData] = useState({
        schoolName: '',
        motto: '',
        schoolType: 'Basic school',
        region: '',
        district: '',
        onboardingTerm: 'Term 1',
        onboardingAcademicYear: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
        headteacherName: '',
        username: '',
        password: '',
        email: '',
        address: '',
    });

    const [logo, setLogo] = useState<Blob | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [generatedId, setGeneratedId] = useState<string | null>(null);

    // Secure Invite State
    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [isValidatingToken, setIsValidatingToken] = useState(true);
    const [tokenError, setTokenError] = useState<string | null>(null);

    useEffect(() => {
        validateInviteToken();
    }, []);

    const validateInviteToken = async () => {
        const searchParams = new URLSearchParams(window.location.search);
        const token = searchParams.get('invite');

        if (!token) {
            setTokenError('Access Denied: Missing invitation token.');
            setIsValidatingToken(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('school_invites')
                .select('*')
                .eq('id', token)
                .single();

            if (error || !data) {
                setTokenError('Access Denied: Invalid or expired invitation link.');
            } else if (data.revoked_at) {
                setTokenError('Access Denied: This invitation link has been deactivated by the administrator.');
            } else if (data.is_used) {
                setTokenError('Access Denied: This invitation link has already been used.');
            } else {
                setInviteToken(token);
            }
        } catch (err) {
            setTokenError('Access Denied: System could not validate the token.');
        } finally {
            setIsValidatingToken(false);
        }
    };

    const validateStep = (currentStep: number) => {
        const newErrors: Record<string, string> = {};

        if (currentStep === 1) {
            if (!formData.schoolName) newErrors.schoolName = 'School name is required';
        } else if (currentStep === 2) {
            if (!formData.region) newErrors.region = 'Region is required';
            if (!formData.district) newErrors.district = 'District is required';
        } else if (currentStep === 3) {
            if (!formData.headteacherName) newErrors.headteacherName = 'Headteacher name is required';
            if (!formData.username) newErrors.username = 'Username is required';
            if (!formData.password) newErrors.password = 'Password is required';
            else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const nextStep = () => {
        if (validateStep(step)) {
            setStep((prev) => (prev + 1) as Step);
            window.scrollTo(0, 0);
        }
    };

    const prevStep = () => {
        setStep((prev) => (prev - 1) as Step);
        window.scrollTo(0, 0);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[name];
                return newErrors;
            });
        }
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setLogo(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const removeLogo = (e: React.MouseEvent) => {
        e.stopPropagation();
        setLogo(null);
        setLogoPreview(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (step !== 4 || isSubmitting) return;

        setIsSubmitting(true);
        try {
            // Check if username exists locally
            const existingUser = await db.users.where('username').equals(formData.username).first();
            if (existingUser) {
                setErrors({ username: 'This username is already taken. Please choose a different one.' });
                setStep(3);
                setIsSubmitting(false);
                return;
            }

            const schoolCode = await generateSchoolId();
            const supabaseEmail = getSupabaseEmail(formData.username, schoolCode);

            // Convert logo to Base64 for cloud sync
            const logoBase64 = logo ? await syncService.blobToBase64(logo) : undefined;

            // 1. Create School Record in Supabase FIRST to get UUID
            const { data: schoolRes, error: schoolError } = await supabase
                .from('schools')
                .insert({
                    school_name: formData.schoolName,
                    school_code: schoolCode, // human-readable ID
                    school_type: formData.schoolType,
                    region: formData.region,
                    district: formData.district,
                    headteacher_name: formData.headteacherName,
                    email: formData.email,
                    address: formData.address,
                    motto: formData.motto.trim() || null,
                    onboarding_term: formData.onboardingTerm,
                    onboarding_academic_year: formData.onboardingAcademicYear,
                    logo: logoBase64, // Sync logo to cloud
                })
                .select('id')
                .single();

            if (schoolError) {
                setErrors({ submit: `Cloud Initialization Error: ${schoolError.message}` });
                setIsSubmitting(false);
                return;
            }

            const schoolUuid = schoolRes.id;

            // 2. Sign up with Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: supabaseEmail,
                password: formData.password,
                options: {
                    data: {
                        full_name: formData.headteacherName,
                        role: 'headteacher',
                        school_id: schoolUuid,
                        school_code: schoolCode,
                        username: formData.username,
                    }
                }
            });

            if (authError) {
                setErrors({ submit: `Authentication Error: ${authError.message}` });
                setIsSubmitting(false);
                return;
            }

            const authUser = authData.user;
            if (!authUser) {
                setErrors({ submit: 'Authentication failed. No user returned.' });
                setIsSubmitting(false);
                return;
            }

            // 3. Create Staff Profile linked by UUID
            const { error: profileError } = await supabase
                .from('staff_profiles')
                .insert({
                    id: authUser.id,
                    school_id: schoolUuid,
                    username: formData.username,
                    full_name: formData.headteacherName,
                    role: 'headteacher',
                    auth_email: supabaseEmail
                });

            if (profileError) {
                setErrors({ submit: `Profile Creation Error: ${profileError.message}` });
                setIsSubmitting(false);
                return;
            }

            // 4. Local DB Saves
            const hashedPassword = await hashPassword(formData.password);

            const schoolData: School = {
                schoolName: formData.schoolName,
                schoolType: formData.schoolType,
                region: formData.region,
                district: formData.district,
                headteacherName: formData.headteacherName,
                username: formData.username,
                password: hashedPassword,
                email: formData.email,
                address: formData.address,
                motto: formData.motto.trim() || null,
                onboardingTerm: formData.onboardingTerm,
                onboardingAcademicYear: formData.onboardingAcademicYear,
                idCloud: schoolUuid,
                schoolId: schoolUuid, // Alias for query compatibility
                schoolCode: schoolCode,
                logo: logo || undefined,
                syncStatus: 'synced',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await db.schools.put(schoolData);

            const userData: User = {
                idCloud: authUser.id,
                schoolId: schoolUuid, // Use UUID for linking
                schoolCode: schoolCode,
                username: formData.username,
                password: hashedPassword,
                fullName: formData.headteacherName,
                role: 'HEADTEACHER',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'synced'
            };
            await db.users.put(userData);

            // 5. Save initial academic settings to eduDb and Supabase
            const academicSettings = [
                { key: 'academicYear', value: formData.onboardingAcademicYear },
                { key: 'currentTerm', value: formData.onboardingTerm }
            ];

            for (const setting of academicSettings) {
                // Save locally
                await eduDb.settings.put({
                    schoolId: schoolUuid,
                    key: setting.key,
                    value: setting.value,
                    syncStatus: 'synced',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });

                // Save to cloud
                await supabase.from('settings').insert({
                    school_id: schoolUuid,
                    key: setting.key,
                    value: setting.value
                });
            }

            // 6. Mark secure invite token as used
            if (inviteToken) {
                await supabase
                    .from('school_invites')
                    .update({ 
                        is_used: true, 
                        used_by: authUser.id, 
                        used_at: new Date().toISOString() 
                    })
                    .eq('id', inviteToken);
            }

            // 7. Write first-term FREE TRIAL subscription row to cloud + local cache
            //    This ensures the trial is auditable, appears in payment history,
            //    and the local subscriptionService resolveStatus check stays accurate.
            const trialSubPayload = {
                school_id: schoolUuid,
                term: formData.onboardingTerm,
                academic_year: formData.onboardingAcademicYear,
                status: 'trial' as const,
                amount_paid: 0,
                activated_at: new Date().toISOString(),
            };

            const { data: trialSubData } = await supabase
                .from('school_subscriptions')
                .insert(trialSubPayload)
                .select('id')
                .single();

            // Mirror trial record to local IndexedDB for offline-first access
            await eduDb.subscriptions.put({
                schoolId: schoolUuid,
                term: formData.onboardingTerm,
                academicYear: formData.onboardingAcademicYear,
                status: 'trial', // correctly set as trial
                verifiedAt: Date.now(),
                idCloud: trialSubData?.id ?? undefined,
                syncStatus: 'synced',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });

            setSession(userData);
            setGeneratedId(schoolCode);
            setSuccess(true);
        } catch (err) {
            console.error('Failed to save school:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            setErrors({ submit: `Initialization Failure: ${errorMessage}. Please check your connection and try again.` });
        } finally {
            setIsSubmitting(false);
        }
    };

    const stepperItems = [
        { icon: 'fa-school', label: 'Profile' },
        { icon: 'fa-map-location-dot', label: 'Location' },
        { icon: 'fa-user-shield', label: 'Security' },
        { icon: 'fa-clipboard-check', label: 'Review' },
    ];

    if (isValidatingToken) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-bold animate-pulse">Verifying secure invitation...</p>
                </div>
            </div>
        );
    }

    if (tokenError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                <div className="max-w-md w-full bg-white p-8 rounded-[2.5rem] shadow-xl border border-red-100 text-center animate-fadeIn">
                    <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i className="fas fa-lock text-3xl"></i>
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-3">Access Restricted</h2>
                    <p className="text-gray-500 font-medium mb-8 leading-relaxed">
                        {tokenError}
                    </p>
                    {onLogin && (
                        <button
                            onClick={onLogin}
                            className="btn-primary w-full py-4 !text-sm"
                        >
                            Return to Login
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="max-w-md mx-auto mt-10 p-10 bg-white rounded-[3rem] shadow-2xl border border-gray-100 text-center animate-zoomIn relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-green-500"></div>
                <div className="w-24 h-24 bg-green-50 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-bounce-slow">
                    <i className="fas fa-check text-4xl text-green-600"></i>
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-3">Portal Initialized!</h2>
                <p className="text-gray-500 mb-8 font-medium">Your institution is now digitally equipped.</p>

                <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100/50 space-y-4">
                    <div className="p-4 bg-white/60 rounded-2xl border border-emerald-100">
                        <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mb-1">Trial Phase Activated</p>
                        <p className="text-emerald-900 font-bold">{formData.onboardingTerm} — {formData.onboardingAcademicYear}</p>
                        <p className="text-[10px] text-emerald-600/70 mt-1">Full access granted for this period.</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-1 p-4 bg-white/60 rounded-2xl border border-emerald-100">
                            <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mb-1">Global ID</p>
                            <p className="text-emerald-900 font-mono font-black">{generatedId}</p>
                        </div>
                        <div className="flex-1 p-4 bg-white/60 rounded-2xl border border-emerald-100">
                            <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mb-1">Username</p>
                            <p className="text-emerald-900 font-black truncate">{formData.username}</p>
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-3 italic font-medium">Please save your Global ID for future reference</p>
                </div>

                <button
                    onClick={() => onComplete(generatedId || '')}
                    className="btn-primary w-full mt-6 py-5 !text-lg !rounded-[1.5rem]"
                >
                    Enter Dashboard <i className="fas fa-arrow-right ml-2"></i>
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto my-12 p-4 md:p-0">
            <div className="bg-white rounded-[3rem] shadow-2xl shadow-blue-100/50 border border-gray-100 overflow-hidden transform transition-all">
                {/* Header */}
                <div className="bg-primary p-10 text-white relative overflow-hidden">
                    <div className="relative z-10">
                        <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 backdrop-blur-md border border-white/20">
                            Genesis Setup
                        </span>
                        <h1 className="text-4xl font-black mb-2 tracking-tight">Onboarding</h1>
                        <p className="opacity-80 text-lg font-medium">Architecting your school's digital management system</p>
                    </div>
                    {/* Decorative elements */}
                    <div className="absolute top-[-40%] right-[-10%] w-96 h-96 bg-blue-400 rounded-full opacity-20 blur-3xl animate-pulse-slow"></div>
                    <div className="absolute bottom-[-30%] left-[-10%] w-64 h-64 bg-white rounded-full opacity-10 blur-2xl"></div>
                </div>

                {/* Progress Stepper */}
                <div className="px-10 py-8 bg-gray-50/50 border-b border-gray-100">
                    <div className="flex justify-between relative">
                        {/* Connecting Line */}
                        <div className="absolute top-5 left-0 w-full h-0.5 bg-gray-200 z-0"></div>
                        <div className="absolute top-5 left-0 h-0.5 bg-primary z-0 transition-all duration-500" style={{ width: `${((step - 1) / (stepperItems.length - 1)) * 100}%` }}></div>

                        {stepperItems.map((item, idx) => {
                            const stepNum = idx + 1;
                            const isActive = stepNum <= step;
                            const isCurrent = stepNum === step;

                            return (
                                <div key={idx} className="relative z-10 flex flex-col items-center group">
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 border-2 ${isCurrent ? 'bg-primary border-primary text-white shadow-lg shadow-blue-200 scale-110' :
                                        isActive ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-400'
                                        }`}>
                                        <i className={`fas ${item.icon} text-sm`}></i>
                                    </div>
                                    <span className={`mt-3 text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${isActive ? 'text-primary' : 'text-gray-400'
                                        }`}>{item.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-10 space-y-8 min-h-[400px]">
                    {/* Step 1: School Profile */}
                    {step === 1 && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="flex flex-col items-center justify-center py-4">
                                <div className="relative group cursor-pointer">
                                    <div className="w-36 h-36 bg-gray-50 border-2 border-dashed border-gray-100 rounded-[2.5rem] flex items-center justify-center overflow-hidden transition-all group-hover:border-primary group-hover:bg-blue-50/50">
                                        {logoPreview ? (
                                            <div className="relative w-full h-full group/logo">
                                                <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={removeLogo}
                                                    className="btn-icon absolute -top-2 -right-2 shadow-lg"
                                                >
                                                    <i className="fas fa-times text-xs"></i>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-center group-hover:scale-110 transition-transform">
                                                <i className="fas fa-camera text-4xl text-gray-200 group-hover:text-primary mb-2"></i>
                                                <p className="text-[10px] font-black text-gray-400 group-hover:text-primary uppercase tracking-widest">School Logo</p>
                                            </div>
                                        )}
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    <div className="absolute -bottom-2 -right-2 bg-primary text-white shadow-xl rounded-2xl w-10 h-10 flex items-center justify-center border-4 border-white transition-transform group-hover:scale-110">
                                        <i className="fas fa-plus text-xs"></i>
                                    </div>
                                </div>
                                <p className="mt-4 text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">Optional But Recommended</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">Institution Name</label>
                                    <input
                                        type="text"
                                        name="schoolName"
                                        value={formData.schoolName}
                                        onChange={handleInputChange}
                                        className={`w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 ${errors.schoolName ? 'border-red-500 bg-red-50' : 'border-gray-50'} focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900`}
                                        placeholder="e.g., Green Valley Secondary"
                                    />
                                    {errors.schoolName && <p className="text-[10px] text-red-500 font-bold ml-1 uppercase">{errors.schoolName}</p>}
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">Category</label>
                                    <div className="relative">
                                        <select
                                            name="schoolType"
                                            value={formData.schoolType}
                                            onChange={handleInputChange}
                                            className="w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 border-gray-50 focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900 appearance-none pointer-events-auto"
                                        >
                                            <option value="Basic School">Basic School (Primary & JHS)</option>
                                            <option value="Secondary">Secondary School</option>
                                            <option value="High School">High School</option>
                                            <option value="Vocational">Vocational / Technical</option>
                                        </select>
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-gray-300">
                                            <i className="fas fa-chevron-down"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">School Motto / Slogan</label>
                                <input
                                    type="text"
                                    name="motto"
                                    value={formData.motto}
                                    onChange={handleInputChange}
                                    className="w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 border-gray-50 focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900"
                                    placeholder="e.g., Knowledge is Power (Optional)"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">Contact Email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        className="w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 border-gray-50 focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900"
                                        placeholder="institutional@email.com"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">Physical Address</label>
                                    <input
                                        type="text"
                                        name="address"
                                        value={formData.address}
                                        onChange={handleInputChange}
                                        className="w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 border-gray-50 focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900"
                                        placeholder="Street name, City, Country"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Location */}
                    {step === 2 && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="p-6 bg-amber-50 rounded-[2rem] border-2 border-amber-100 flex items-center gap-4 text-amber-800 mb-4">
                                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
                                    <i className="fas fa-location-dot"></i>
                                </div>
                                <div>
                                    <h4 className="font-black uppercase text-xs tracking-widest mb-1">Geographic Context</h4>
                                    <p className="text-sm opacity-80 font-medium">Providing local context helps in generating report templates and regional metrics.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">Region / Province</label>
                                    <input
                                        type="text"
                                        name="region"
                                        value={formData.region}
                                        onChange={handleInputChange}
                                        className={`w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 ${errors.region ? 'border-red-500 bg-red-50' : 'border-gray-50'} focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900`}
                                        placeholder="Enter region"
                                    />
                                    {errors.region && <p className="text-[10px] text-red-500 font-bold ml-1 uppercase">{errors.region}</p>}
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">District / Zone</label>
                                    <input
                                        type="text"
                                        name="district"
                                        value={formData.district}
                                        onChange={handleInputChange}
                                        className={`w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 ${errors.district ? 'border-red-500 bg-red-50' : 'border-gray-50'} focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900`}
                                        placeholder="Enter district"
                                    />
                                    {errors.district && <p className="text-[10px] text-red-500 font-bold ml-1 uppercase">{errors.district}</p>}
                                </div>
                            </div>


                            {/* ── Free Trial Term Selector ── */}
                            <div className="mt-2 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50/50 border-2 border-emerald-200 rounded-[2rem] p-6 space-y-5">
                                {/* Header badge */}
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0">
                                        <i className="fas fa-gift text-white text-sm"></i>
                                    </div>
                                    <div>
                                        <p className="font-black text-emerald-900 text-sm uppercase tracking-wider">Free Trial Included</p>
                                        <p className="text-[11px] text-emerald-600 font-medium">Your first term is completely free — no payment required</p>
                                    </div>
                                    <span className="ml-auto px-3 py-1 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm">
                                        GHS 0
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* Academic Year */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-700 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                                            <i className="fas fa-calendar-alt text-emerald-500 text-[10px]"></i>
                                            Academic Year
                                        </label>
                                        <input
                                            type="text"
                                            name="onboardingAcademicYear"
                                            value={formData.onboardingAcademicYear}
                                            onChange={handleInputChange}
                                            className="w-full px-5 py-3.5 rounded-[1.25rem] bg-white border-2 border-emerald-100 focus:border-emerald-400 focus:outline-none transition-all font-bold text-gray-900 shadow-sm"
                                            placeholder="e.g., 2025/2026"
                                        />
                                    </div>

                                    {/* Starting Term — the FREE one */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-700 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                                            <i className="fas fa-star text-emerald-500 text-[10px]"></i>
                                            Free Starting Term
                                        </label>
                                        <div className="relative">
                                            <select
                                                name="onboardingTerm"
                                                value={formData.onboardingTerm}
                                                onChange={handleInputChange}
                                                className="w-full px-5 py-3.5 rounded-[1.25rem] bg-white border-2 border-emerald-100 focus:border-emerald-400 focus:outline-none transition-all font-bold text-gray-900 appearance-none shadow-sm"
                                            >
                                                <option value="Term 1">Term 1</option>
                                                <option value="Term 2">Term 2</option>
                                                <option value="Term 3">Term 3</option>
                                            </select>
                                            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-400">
                                                <i className="fas fa-chevron-down text-xs"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Explanation footer */}
                                <div className="flex items-start gap-3 bg-white/70 rounded-2xl p-4 border border-emerald-100">
                                    <i className="fas fa-circle-info text-emerald-500 mt-0.5 shrink-0"></i>
                                    <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                                        <span className="font-black text-emerald-700">{formData.onboardingTerm} — {formData.onboardingAcademicYear}</span> will be your free trial period.
                                        When you advance to the next term in Settings, a subscription will be required to continue accessing all modules.
                                    </p>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* Step 3: Security */}
                    {step === 3 && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="space-y-3">
                                <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">Administrative Head</label>
                                <div className="relative">
                                    <i className="fas fa-user-tie absolute left-6 top-1/2 -translate-y-1/2 text-primary opacity-30"></i>
                                    <input
                                        type="text"
                                        name="headteacherName"
                                        value={formData.headteacherName}
                                        onChange={handleInputChange}
                                        className={`w-full pl-14 pr-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 ${errors.headteacherName ? 'border-red-500 bg-red-50' : 'border-gray-50'} focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900`}
                                        placeholder="Full name of headteacher"
                                    />
                                </div>
                                {errors.headteacherName && <p className="text-[10px] text-red-500 font-bold ml-1 uppercase">{errors.headteacherName}</p>}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">Portal Username</label>
                                    <div className="relative">
                                        <i className="fas fa-at absolute left-6 top-1/2 -translate-y-1/2 text-primary opacity-30"></i>
                                        <input
                                            type="text"
                                            name="username"
                                            value={formData.username}
                                            onChange={handleInputChange}
                                            className={`w-full pl-14 pr-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 ${errors.username ? 'border-red-500 bg-red-50' : 'border-gray-50'} focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900`}
                                            placeholder="Pick unique username"
                                        />
                                    </div>
                                    {errors.username && <p className="text-[10px] text-red-500 font-bold ml-1 uppercase">{errors.username}</p>}
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-900 ml-1 uppercase tracking-widest">Master Password</label>
                                    <div className="relative">
                                        <i className="fas fa-shield-halved absolute left-6 top-1/2 -translate-y-1/2 text-primary opacity-30"></i>
                                        <input
                                            type="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={handleInputChange}
                                            className={`w-full pl-14 pr-6 py-4 rounded-[1.25rem] bg-gray-50 border-2 ${errors.password ? 'border-red-500 bg-red-50' : 'border-gray-50'} focus:border-primary focus:bg-white focus:outline-none transition-all font-medium text-gray-900`}
                                            placeholder="Min. 6 characters"
                                        />
                                    </div>
                                    {errors.password && <p className="text-[10px] text-red-500 font-bold ml-1 uppercase">{errors.password}</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Final Review */}
                    {step === 4 && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="p-6 bg-blue-50/50 rounded-[2.5rem] border border-blue-100 flex flex-col md:flex-row items-center gap-8">
                                <div className="w-32 h-32 bg-white rounded-[2rem] shadow-lg flex items-center justify-center overflow-hidden shrink-0 border border-blue-50">
                                    {logoPreview ? (
                                        <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                                    ) : (
                                        <i className="fas fa-school text-4xl text-blue-200"></i>
                                    )}
                                </div>
                                <div className="flex-1 text-center md:text-left">
                                    <h3 className="text-2xl font-black text-gray-900 mb-1">{formData.schoolName}</h3>
                                    <p className="text-sm text-gray-500 font-bold uppercase tracking-widest flex items-center justify-center md:justify-start gap-2">
                                        <i className="fas fa-tag text-primary/40"></i> {formData.schoolType}
                                    </p>
                                    <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-4">
                                        <span className="px-4 py-1.5 bg-white rounded-full text-[10px] font-black uppercase text-gray-500 border border-gray-100 shadow-sm">
                                            <i className="fas fa-location-dot mr-2 text-primary/40"></i> {formData.district}, {formData.region}
                                        </span>
                                        {formData.motto && (
                                            <span className="px-4 py-1.5 bg-white rounded-full text-[10px] font-black uppercase text-gray-500 border border-gray-100 shadow-sm italic">
                                                <i className="fas fa-quote-left mr-2 text-primary/40"></i> {formData.motto}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Contact Details</p>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-500 font-medium">Email:</span>
                                            <span className="font-bold text-gray-900">{formData.email || 'Not provided'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-500 font-medium">Address:</span>
                                            <span className="font-bold text-gray-900 text-right truncate max-w-[150px]">{formData.address || 'Not provided'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Administrator</p>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-500 font-medium">Headteacher:</span>
                                            <span className="font-bold text-gray-900">{formData.headteacherName}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-500 font-medium">Username:</span>
                                            <span className="px-2 py-0.5 bg-primary/10 text-primary font-black rounded-lg text-xs tracking-wider">{formData.username}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-indigo-50/30 rounded-[2rem] border border-indigo-100 flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center shrink-0">
                                    <i className="fas fa-circle-info text-indigo-600"></i>
                                </div>
                                <p className="text-xs text-indigo-900/70 font-medium leading-relaxed">
                                    Portal will be initialized with a human-readable <strong>School ID</strong> for login. Data is securely synced to the cloud.
                                </p>
                            </div>

                            {errors.submit && (
                                <div className="bg-red-50 border-2 border-red-100 p-5 rounded-[1.5rem] flex items-center gap-4 text-red-600 text-sm font-bold animate-shake">
                                    <i className="fas fa-exclamation-triangle text-xl"></i>
                                    {errors.submit}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Footer */}
                    <div className="flex items-center gap-4 pt-10 border-t border-gray-50">
                        {step > 1 && (
                            <button
                                type="button"
                                onClick={prevStep}
                                className="btn-secondary px-8 py-5 !rounded-[1.5rem]"
                            >
                                <i className="fas fa-chevron-left"></i> Back
                            </button>
                        )}

                        {step < 4 ? (
                            <button
                                type="button"
                                onClick={nextStep}
                                className="btn-primary flex-1 py-5 !text-lg !rounded-[1.5rem]"
                            >
                                Continue <i className="fas fa-chevron-right text-sm"></i>
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="btn-primary !from-indigo-600 !to-indigo-700 flex-1 py-5 !text-lg !rounded-[1.5rem] shadow-indigo-100"
                            >
                                {isSubmitting ? (
                                    <i className="fas fa-circle-notch fa-spin"></i>
                                ) : (
                                    <i className="fas fa-bolt-lightning"></i>
                                )}
                                {isSubmitting ? 'Architecting Portal...' : 'Initialize Portal'}
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <div className="mt-10 text-center space-y-4">
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.25em] flex items-center justify-center gap-3">
                    <span className="w-8 h-px bg-gray-200"></span>
                    <i className="fas fa-shield-halved text-primary/30"></i>
                    Enterprise Local Security Active
                    <span className="w-8 h-px bg-gray-200"></span>
                </p>
                {onLogin && (
                    <p className="text-gray-400 text-xs font-bold">
                        Already registered?{' '}
                        <button
                            type="button"
                            onClick={onLogin}
                            className="text-primary hover:underline font-black btn-ghost !px-2 !py-1 !rounded-lg"
                        >
                            Login here
                        </button>
                    </p>
                )}
            </div>
        </div>
    );
};

export default SchoolOnboarding;

