import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { eduDb, type AssessmentConfig } from '../../eduDb';
import { useAuth } from '../../hooks/useAuth';
import { exportDatabase, importDatabase } from '../../utils/backupUtils';
import { showConfirm } from '../Common/ConfirmDialog';
import { showToast } from '../Common/Toast';
import { syncService } from '../../services/syncService';

const Settings: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'general' | 'academic' | 'assessment' | 'system' | 'security'>('general');
    const [isLoading, setIsLoading] = useState(false);

    // School Data
    const schoolData = useLiveQuery(async () => {
        if (user?.schoolId) {
            // Check both for backward compatibility
            return await db.schools
                .where('schoolId').equals(user.schoolId)
                .or('idCloud').equals(user.schoolId)
                .first();
        }
        return null;
    }, [user?.schoolId]);

    // Academic Settings
    const academicSettings = useLiveQuery(async () => {
        if (user?.schoolId) {
            const settings = await eduDb.settings.where('schoolId').equals(user.schoolId).toArray();
            return settings.reduce((acc: any, curr) => ({ ...acc, [curr.key]: curr.value }), {});
        }
        return {};
    }, [user?.schoolId]);

    // Form States
    const [schoolName, setSchoolName] = useState('');
    const [schoolLogo, setSchoolLogo] = useState<Blob | null>(null);
    const [schoolType, setSchoolType] = useState('');
    const [region, setRegion] = useState('');
    const [district, setDistrict] = useState('');
    const [headteacherName, setHeadteacherName] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [motto, setMotto] = useState('');
    const [academicYear, setAcademicYear] = useState('');
    const [currentTerm, setCurrentTerm] = useState('Term 1');
    const [gradingSystem, setGradingSystem] = useState<{ min: number; max: number; grade: string; remark: string }[]>([
        { min: 80, max: 100, grade: 'A', remark: 'Excellent' },
        { min: 70, max: 79, grade: 'B', remark: 'Very Good' },
        { min: 60, max: 69, grade: 'C', remark: 'Good' },
        { min: 50, max: 59, grade: 'D', remark: 'Credit' },
        { min: 0, max: 49, grade: 'F', remark: 'Fail' },
    ]);
    const [vacationDate, setVacationDate] = useState('');
    const [nextTermBegins, setNextTermBegins] = useState('');
    const [termStartDate, setTermStartDate] = useState('');

    // Assessment Configuration States
    const [selectedTerm, setSelectedTerm] = useState('Term 1');
    const [numTests, setNumTests] = useState(3);
    const [numExercises, setNumExercises] = useState(2);
    const [numAssignments, setNumAssignments] = useState(2);
    const [numProjects, setNumProjects] = useState(1);
    const [caPercentage, setCaPercentage] = useState(30);
    const [examPercentage, setExamPercentage] = useState(70);
    const [testWeight, setTestWeight] = useState(10);
    const [exerciseWeight, setExerciseWeight] = useState(5);
    const [assignmentWeight, setAssignmentWeight] = useState(10);
    const [projectWeight, setProjectWeight] = useState(5);
    const [caPolicy, setCaPolicy] = useState<'best_n' | 'sum_all'>('best_n');
    const [bestNCount, setBestNCount] = useState(2);

    // Max Scores
    const [testMaxScore, setTestMaxScore] = useState(20);
    const [exerciseMaxScore, setExerciseMaxScore] = useState(10);
    const [assignmentMaxScore, setAssignmentMaxScore] = useState(20);
    const [projectMaxScore, setProjectMaxScore] = useState(50);
    const [examMaxScore, setExamMaxScore] = useState(100);

    // Password Change States
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Fetch Existing Assessment Config
    const existingConfig = useLiveQuery(async () => {
        if (user?.schoolId && academicYear && selectedTerm) {
            const year = parseInt(academicYear.split('/')[0]);
            if (isNaN(year)) return null;

            const config = await eduDb.assessmentConfigs
                .where('[schoolId+year+term]')
                .equals([user.schoolId, year, selectedTerm])
                .first();
            return config || null;
        }
        return null;
    }, [user?.schoolId, academicYear, selectedTerm]);

    // Sync Existing Config to Form State
    useEffect(() => {
        if (existingConfig) {
            setNumTests(existingConfig.numTests);
            setNumExercises(existingConfig.numExercises);
            setNumAssignments(existingConfig.numAssignments);
            setNumProjects(existingConfig.numProjects);
            setCaPercentage(existingConfig.caPercentage ?? 30);
            setExamPercentage(existingConfig.examPercentage ?? 70);
            setTestWeight(existingConfig.testWeight);
            setExerciseWeight(existingConfig.exerciseWeight);
            setAssignmentWeight(existingConfig.assignmentWeight);
            setProjectWeight(existingConfig.projectWeight);
            setCaPolicy(existingConfig.caPolicy || 'best_n');
            setBestNCount(existingConfig.bestNCount || 2);
            setTestMaxScore(existingConfig.testMaxScore || 100);
            setExerciseMaxScore(existingConfig.exerciseMaxScore || 100);
            setAssignmentMaxScore(existingConfig.assignmentMaxScore || 100);
            setProjectMaxScore(existingConfig.projectMaxScore || 100);
            setExamMaxScore(existingConfig.examMaxScore || 100);
        } else if (existingConfig === null && academicYear && selectedTerm) {
            // Only reset if we explicitly got null (found nothing), not while loading
            setNumTests(3);
            setNumExercises(2);
            setNumAssignments(2);
            setNumProjects(1);
            setCaPercentage(30);
            setExamPercentage(70);
            setTestWeight(10);
            setExerciseWeight(5);
            setAssignmentWeight(10);
            setProjectWeight(5);
            setCaPolicy('best_n');
            setBestNCount(2);
            setTestMaxScore(20);
            setExerciseMaxScore(10);
            setAssignmentMaxScore(20);
            setProjectMaxScore(50);
            setExamMaxScore(100);
        }
    }, [existingConfig, academicYear, selectedTerm]);

    // Initialize Form Data
    useEffect(() => {
        if (schoolData) {
            setSchoolName(schoolData.schoolName);
            if (schoolData.logo) setSchoolLogo(schoolData.logo);
            if (schoolData.schoolType) setSchoolType(schoolData.schoolType);
            if (schoolData.region) setRegion(schoolData.region);
            if (schoolData.district) setDistrict(schoolData.district);
            if (schoolData.headteacherName) setHeadteacherName(schoolData.headteacherName);
            if (schoolData.email) setEmail(schoolData.email || '');
            if (schoolData.address) setAddress(schoolData.address || '');
            if (schoolData.motto) setMotto(schoolData.motto || '');
        }
    }, [schoolData]);

    useEffect(() => {
        if (academicSettings) {
            if (academicSettings.academicYear) setAcademicYear(academicSettings.academicYear);
            if (academicSettings.currentTerm) setCurrentTerm(academicSettings.currentTerm);
            if (academicSettings.gradingSystem) setGradingSystem(academicSettings.gradingSystem);
            if (academicSettings.vacationDate) setVacationDate(academicSettings.vacationDate);
            if (academicSettings.nextTermBegins) setNextTermBegins(academicSettings.nextTermBegins);
            if (academicSettings.termStartDate) setTermStartDate(academicSettings.termStartDate);
        }
    }, [academicSettings]);

    // Handlers
    const handleSaveGeneral = async () => {
        if (!user?.schoolId || !schoolData?.id) return;
        try {
            await db.schools.update(schoolData.id, {
                schoolName,
                schoolType,
                region,
                district,
                headteacherName,
                email,
                address,
                motto: motto.trim() || null,
                logo: schoolLogo || undefined,
                syncStatus: 'pending'
            });

            // Also save vacation and next term dates to eduDb.settings
            const now = Date.now();
            await eduDb.transaction('rw', eduDb.settings, async () => {
                const termSettings = [
                    { key: 'vacationDate', value: vacationDate },
                    { key: 'nextTermBegins', value: nextTermBegins },
                    { key: 'termStartDate', value: termStartDate }
                ];

                for (const item of termSettings) {
                    const existing = await eduDb.settings
                        .where('[schoolId+key]')
                        .equals([user.schoolId, item.key])
                        .first();

                    if (existing) {
                        await eduDb.settings.update(existing.id!, {
                            value: item.value,
                            updatedAt: now,
                            syncStatus: 'pending'
                        });
                    } else {
                        await eduDb.settings.add({
                            schoolId: user.schoolId,
                            key: item.key,
                            value: item.value,
                            createdAt: now,
                            updatedAt: now,
                            syncStatus: 'pending'
                        });
                    }
                }
            });

            showMessage('success', 'School details updated successfully!');
            syncService.syncAll(user.schoolId).catch(console.error);
        } catch (error) {
            console.error(error);
            showMessage('error', 'Failed to update school details.');
        }
    };

    const handleSaveAcademic = async () => {
        if (!user?.schoolId) return;
        try {
            const now = Date.now();
            await eduDb.transaction('rw', eduDb.settings, async () => {
                const keys = ['academicYear', 'currentTerm', 'gradingSystem'];
                const values = [academicYear.trim(), currentTerm.trim(), gradingSystem];

                for (let i = 0; i < keys.length; i++) {
                    const existing = await eduDb.settings
                        .where('[schoolId+key]')
                        .equals([user.schoolId, keys[i]])
                        .first();

                    if (existing) {
                        await eduDb.settings.update(existing.id!, {
                            value: values[i],
                            updatedAt: now,
                            syncStatus: 'pending'
                        });
                    } else {
                        await eduDb.settings.add({
                            schoolId: user.schoolId,
                            key: keys[i],
                            value: values[i],
                            createdAt: now,
                            updatedAt: now,
                            syncStatus: 'pending'
                        });
                    }
                }
            });
            showMessage('success', 'Academic settings saved successfully!');
            syncService.syncAll(user.schoolId).catch(console.error);
        } catch (error) {
            console.error(error);
            showMessage('error', 'Failed to save academic settings.');
        }
    };

    const handleSaveAssessment = async () => {
        if (!user?.schoolId || !academicYear) return;

        // Validation
        const totalWeights = testWeight + exerciseWeight + assignmentWeight + projectWeight;
        if (totalWeights !== caPercentage) {
            showMessage('error', `Component weights (${totalWeights}%) must equal CA percentage (${caPercentage}%)`);
            return;
        }

        if (caPercentage + examPercentage !== 100) {
            showMessage('error', 'CA% + Exam% must equal 100%');
            return;
        }

        try {
            const now = Date.now();
            const config: Partial<AssessmentConfig> = {
                schoolId: user.schoolId,
                year: parseInt(academicYear.split('/')[0]) || new Date().getFullYear(),
                term: selectedTerm,
                numTests,
                numExercises,
                numAssignments,
                numProjects,
                caPercentage,
                examPercentage,
                testWeight,
                exerciseWeight,
                assignmentWeight,
                projectWeight,
                caPolicy,
                bestNCount,
                testMaxScore,
                exerciseMaxScore,
                assignmentMaxScore,
                projectMaxScore,
                examMaxScore,
                resultsLocked: false,
                syncStatus: 'pending',
                createdAt: now,
                updatedAt: now
            };

            // Check if config exists for this term
            const existing = await eduDb.assessmentConfigs
                .where('[schoolId+year+term]')
                .equals([user.schoolId, config.year!, selectedTerm])
                .first();

            if (existing) {
                await eduDb.assessmentConfigs.update(existing.id!, { ...config, updatedAt: now });
            } else {
                await eduDb.assessmentConfigs.add(config as any);
            }

            showMessage('success', 'Assessment configuration saved successfully!');
            syncService.syncAll(user.schoolId).catch(console.error);
        } catch (error) {
            console.error(error);
            showMessage('error', 'Failed to save assessment configuration.');
        }
    };

    const handleChangePassword = async () => {
        if (!user?.id) return;
        if (!currentPassword || !newPassword || !confirmPassword) { showMessage('error', 'Fill in all fields'); return; }
        if (newPassword !== confirmPassword) { showMessage('error', 'New passwords do not match'); return; }
        if (newPassword.length < 6) { showMessage('error', 'Password must be at least 6 characters'); return; }

        setIsLoading(true);
        try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData.session?.user?.email) {
                showMessage('error', 'Session expired. Please log in again.');
                return;
            }

            // Verify current password via Supabase
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: sessionData.session.user.email,
                password: currentPassword
            });

            if (signInError) {
                showMessage('error', 'Current password is incorrect');
                return;
            }

            // 1. Update Supabase Auth first
            const { error: authError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (authError) {
                console.error('Supabase Password Update Error:', authError.message);
                showMessage('error', `Cloud update failed: ${authError.message}`);
                return;
            }

            // 2. Update local Dexie DB
            const { hashPassword } = await import('../../utils/auth');
            const hashedNew = await hashPassword(newPassword);
            const dbUser = await db.users.where('idCloud').equals(user.id).first();
            if (dbUser) {
                await db.users.update(dbUser.id!, { password: hashedNew });
            }
            showMessage('success', 'Password changed successfully!');
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        } catch (err) {
            console.error('Password Change Error:', err);
            showMessage('error', 'Failed to change password');
        }
        finally { setIsLoading(false); }
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSchoolLogo(e.target.files[0]);
        }
    };

    const handleBackup = async () => {
        setIsLoading(true);
        try {
            const data = await exportDatabase();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `labour-app-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showMessage('success', 'Backup downloaded successfully!');
        } catch (error) {
            console.error(error);
            showMessage('error', 'Backup failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        const confirmed = await showConfirm({
            title: 'Restore Backup',
            message: 'WARNING: This will completely overwrite all current school data with the backup file. This cannot be undone.',
            confirmText: 'Yes, Restore',
            cancelText: 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;

        setIsLoading(true);
        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const json = event.target?.result as string;
                await importDatabase(json);
                showMessage('success', 'System restored successfully! Reloading...');
                setTimeout(() => window.location.reload(), 2000);
            } catch (error) {
                console.error(error);
                showMessage('error', 'Restore failed. Invalid backup file.');
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const showMessage = (type: 'success' | 'error', text: string) => {
        showToast(text, type);
    };

    // Render Helpers
    const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3 font-bold rounded-xl transition-all flex-shrink-0 text-sm ${activeTab === id
                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'
                }`}
        >
            <i className={`fas ${icon}`}></i>
            <span className="hidden sm:inline">{label}</span>
        </button>
    );

    return (
        <div className="space-y-4 md:space-y-6">
            <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                <TabButton id="general" label="General Info" icon="fa-school" />
                <TabButton id="academic" label="Academic" icon="fa-graduation-cap" />
                <TabButton id="assessment" label="Assessment" icon="fa-clipboard-list" />
                <TabButton id="security" label="Security" icon="fa-shield-alt" />
                <TabButton id="system" label="Backup" icon="fa-cogs" />
            </div>

            <div className="bg-white p-4 sm:p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm">
                {activeTab === 'general' && (
                    <div className="max-w-xl space-y-6">
                        <h2 className="text-xl font-bold text-gray-800 border-b pb-4">School Details</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">School Name</label>
                                <input
                                    type="text"
                                    value={schoolName}
                                    onChange={(e) => setSchoolName(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">School Type</label>
                                <select
                                    value={schoolType}
                                    onChange={(e) => setSchoolType(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                >
                                    <option value="">Select Type</option>
                                    <option value="Basic School">Basic School (Primary & JHS)</option>
                                    <option value="Secondary">Secondary School</option>
                                    <option value="High School">High School</option>
                                    <option value="Vocational">Vocational / Technical</option>
                                    <option value="Combined">Combined</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">School Motto / Slogan</label>
                            <input
                                type="text"
                                value={motto}
                                onChange={(e) => setMotto(e.target.value)}
                                className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                placeholder="e.g., Knowledge is Power"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Region</label>
                                <input
                                    type="text"
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">District</label>
                                <input
                                    type="text"
                                    value={district}
                                    onChange={(e) => setDistrict(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Headteacher Name</label>
                                <input
                                    type="text"
                                    value={headteacherName}
                                    onChange={(e) => setHeadteacherName(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">School Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">School Address</label>
                            <textarea
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors h-24"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">School Logo</label>
                            <div className="flex items-center gap-6">
                                {schoolLogo ? (
                                    <div className="w-24 h-24 rounded-2xl border-2 border-gray-200 p-1">
                                        <img src={URL.createObjectURL(schoolLogo)} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                                    </div>
                                ) : (
                                    <div className="w-24 h-24 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-300">
                                        <i className="fas fa-image text-2xl"></i>
                                    </div>
                                )}
                                <label className="cursor-pointer bg-blue-50 text-blue-600 px-6 py-3 rounded-xl font-bold hover:bg-blue-100 transition-colors">
                                    <i className="fas fa-upload mr-2"></i> Upload New Logo
                                    <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Term Start Date</label>
                                <input
                                    type="date"
                                    value={termStartDate}
                                    onChange={(e) => setTermStartDate(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Vacation Date</label>
                                <input
                                    type="date"
                                    value={vacationDate}
                                    onChange={(e) => setVacationDate(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Next Term Begins</label>
                                <input
                                    type="date"
                                    value={nextTermBegins}
                                    onChange={(e) => setNextTermBegins(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700 transition-colors"
                                />
                            </div>
                        </div>

                        <button onClick={handleSaveGeneral} className="bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/30 hover:scale-105 transition-all">
                            Save Changes
                        </button>
                    </div>
                )}

                {activeTab === 'academic' && (
                    <div className="space-y-8">
                        <h2 className="text-xl font-bold text-gray-800 border-b pb-4">Academic Session</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Academic Year</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 2025/2026"
                                    value={academicYear}
                                    onChange={(e) => setAcademicYear(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Current Term</label>
                                <select
                                    value={currentTerm}
                                    onChange={(e) => setCurrentTerm(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700"
                                >
                                    <option>Term 1</option>
                                    <option>Term 2</option>
                                    <option>Term 3</option>
                                </select>
                            </div>
                        </div>

                        <h2 className="text-xl font-bold text-gray-800 border-b pb-4 pt-4">Grading System</h2>
                        {/* Mobile: card rows; Desktop: table */}
                        <div className="space-y-3 md:hidden">
                            {gradingSystem.map((g, idx) => (
                                <div key={idx} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <input type="text" value={g.grade} onChange={e => { const n = [...gradingSystem]; n[idx].grade = e.target.value; setGradingSystem(n); }}
                                                className="w-12 p-2 bg-white border border-gray-200 rounded-xl font-black text-center text-lg text-primary" placeholder="A" />
                                            <input type="text" value={g.remark} onChange={e => { const n = [...gradingSystem]; n[idx].remark = e.target.value; setGradingSystem(n); }}
                                                className="flex-1 p-2 bg-white border border-gray-200 rounded-xl font-bold text-gray-700" placeholder="Remark" />
                                        </div>
                                        <button onClick={() => setGradingSystem(gradingSystem.filter((_, i) => i !== idx))} className="text-red-400 p-2">
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex-1">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Min</label>
                                            <input type="number" value={g.min} onChange={e => { const n = [...gradingSystem]; n[idx].min = parseInt(e.target.value); setGradingSystem(n); }}
                                                className="w-full p-2 bg-white border border-gray-200 rounded-xl font-bold text-center" />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Max</label>
                                            <input type="number" value={g.max} onChange={e => { const n = [...gradingSystem]; n[idx].max = parseInt(e.target.value); setGradingSystem(n); }}
                                                className="w-full p-2 bg-white border border-gray-200 rounded-xl font-bold text-center" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => setGradingSystem([...gradingSystem, { min: 0, max: 0, grade: '', remark: '' }])}
                                className="w-full py-3 border-2 border-dashed border-gray-200 text-gray-400 font-bold rounded-2xl hover:border-primary hover:text-primary transition-all">
                                + Add Grade Range
                            </button>
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-gray-400 text-sm border-b">
                                        <th className="p-3">Min</th><th className="p-3">Max</th><th className="p-3">Grade</th><th className="p-3">Remark</th><th className="p-3">Del</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {gradingSystem.map((g, idx) => (
                                        <tr key={idx} className="border-b border-gray-50">
                                            <td className="p-2"><input type="number" value={g.min} onChange={e => { const n = [...gradingSystem]; n[idx].min = parseInt(e.target.value); setGradingSystem(n); }} className="w-20 p-2 bg-gray-50 rounded-lg font-bold" /></td>
                                            <td className="p-2"><input type="number" value={g.max} onChange={e => { const n = [...gradingSystem]; n[idx].max = parseInt(e.target.value); setGradingSystem(n); }} className="w-20 p-2 bg-gray-50 rounded-lg font-bold" /></td>
                                            <td className="p-2"><input type="text" value={g.grade} onChange={e => { const n = [...gradingSystem]; n[idx].grade = e.target.value; setGradingSystem(n); }} className="w-16 p-2 bg-gray-50 rounded-lg font-bold" /></td>
                                            <td className="p-2"><input type="text" value={g.remark} onChange={e => { const n = [...gradingSystem]; n[idx].remark = e.target.value; setGradingSystem(n); }} className="w-full p-2 bg-gray-50 rounded-lg font-bold" /></td>
                                            <td className="p-2"><button onClick={() => setGradingSystem(gradingSystem.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-2"><i className="fas fa-trash"></i></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={() => setGradingSystem([...gradingSystem, { min: 0, max: 0, grade: '', remark: '' }])} className="mt-4 text-primary font-bold hover:underline">+ Add Grade Range</button>
                        </div>

                        <button onClick={handleSaveAcademic} className="bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/30 hover:scale-105 transition-all">
                            Save Academic Settings
                        </button>
                    </div>
                )}

                {activeTab === 'assessment' && (
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 border-b pb-4">Assessment Configuration</h2>
                            <p className="text-sm text-gray-500 mt-2">
                                Configure how many tests, exercises, assignments, and projects students will complete per term,
                                and set the percentage weights for each component.
                            </p>
                        </div>

                        {/* Term Selection */}
                        <div className="max-w-xs">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Configure for Term</label>
                            <select
                                value={selectedTerm}
                                onChange={(e) => setSelectedTerm(e.target.value)}
                                className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700"
                            >
                                <option>Term 1</option>
                                <option>Term 2</option>
                                <option>Term 3</option>
                            </select>
                        </div>

                        {/* CA Policy Selection */}
                        <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 space-y-5">
                            <div>
                                <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                                    <i className="fas fa-magic"></i>
                                    CA Calculation Model
                                </h3>
                                <p className="text-xs text-indigo-600 mt-1">Determine how the system processes multiple assessment scores</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                    { id: 'best_n', label: 'Best-N Model', desc: 'Selects the top N scores per category. Ignores lowest marks to reward peak performance.', icon: 'fa-trophy' },
                                    { id: 'sum_all', label: 'Simple Mean', desc: 'Averages all scores equally. Every single assessment counts toward the final grade.', icon: 'fa-divide' },
                                ].map(policy => (
                                    <button
                                        key={policy.id}
                                        onClick={() => setCaPolicy(policy.id as any)}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all hover:scale-[1.02] ${caPolicy === policy.id
                                            ? 'bg-white border-indigo-500 shadow-md ring-4 ring-indigo-500/10'
                                            : 'bg-white/50 border-transparent hover:border-indigo-200'
                                            }`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${caPolicy === policy.id ? 'bg-indigo-600 text-white shadow-lg' : 'bg-indigo-100 text-indigo-400'}`}>
                                            <i className={`fas ${policy.icon}`}></i>
                                        </div>
                                        <p className="font-black text-xs text-gray-800 uppercase tracking-tight">{policy.label}</p>
                                        <p className="text-[10px] text-gray-400 font-medium leading-tight mt-1">{policy.desc}</p>
                                    </button>
                                ))}
                            </div>

                            {caPolicy === 'best_n' && (
                                <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-indigo-100 animate-fadeIn">
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-800 text-sm">Target Score Count</p>
                                        <p className="text-xs text-gray-400">Number of best scores to keep per category</p>
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        max="5"
                                        value={bestNCount}
                                        onChange={e => setBestNCount(parseInt(e.target.value) || 1)}
                                        className="w-20 p-3 bg-indigo-50 border-2 border-indigo-100 rounded-xl text-center font-black text-indigo-700 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Calculation Insight Box */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                            <div className="bg-white/60 border border-indigo-100/50 p-4 rounded-2xl">
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Calculation Logic (The "How")</p>
                                <p className="text-xs text-gray-700 font-bold leading-relaxed">
                                    {caPolicy === 'best_n' && `Selects top ${bestNCount || 2} scores from each category → Averages them → Applies Category Weight.`}
                                    {caPolicy === 'sum_all' && "Total Sum of all items ÷ Total Number of items → Applies Category Weight."}
                                </p>
                            </div>
                            <div className="bg-indigo-50/30 border border-indigo-100/50 p-4 rounded-2xl">
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Pedagogical Value (The "Why")</p>
                                <p className="text-xs text-gray-600 italic leading-relaxed">
                                    {caPolicy === 'best_n' && "Forgives 'off days' and rewards students for their best work, building long-term confidence."}
                                    {caPolicy === 'sum_all' && "Promotes consistent discipline. Students learn that every single effort contributes to their success."}
                                </p>
                            </div>
                        </div>

                        {/* Component Counts */}
                        <div>
                            <h3 className="text-lg font-bold text-gray-700 mb-4">Number of Assessments</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Tests</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={numTests}
                                        onChange={(e) => setNumTests(parseInt(e.target.value) || 0)}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-center text-2xl"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Exercises</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={numExercises}
                                        onChange={(e) => setNumExercises(parseInt(e.target.value) || 0)}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-center text-2xl"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Assignments</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={numAssignments}
                                        onChange={(e) => setNumAssignments(parseInt(e.target.value) || 0)}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-center text-2xl"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Projects</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={numProjects}
                                        onChange={(e) => setNumProjects(parseInt(e.target.value) || 0)}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-center text-2xl"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Component Max Scores */}
                        <div>
                            <h3 className="text-lg font-bold text-gray-700 mb-4">Maximum Component Scores (Full Marks)</h3>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Test Max</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={testMaxScore}
                                        onChange={(e) => setTestMaxScore(parseInt(e.target.value) || 1)}
                                        className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:outline-none font-black text-center text-lg text-indigo-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Exercise Max</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={exerciseMaxScore}
                                        onChange={(e) => setExerciseMaxScore(parseInt(e.target.value) || 1)}
                                        className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:outline-none font-black text-center text-lg text-indigo-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Assignment Max</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={assignmentMaxScore}
                                        onChange={(e) => setAssignmentMaxScore(parseInt(e.target.value) || 1)}
                                        className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:outline-none font-black text-center text-lg text-indigo-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Project Max</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={projectMaxScore}
                                        onChange={(e) => setProjectMaxScore(parseInt(e.target.value) || 1)}
                                        className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:outline-none font-black text-center text-lg text-indigo-600"
                                    />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center text-blue-500">Exam Max</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={examMaxScore}
                                        onChange={(e) => setExamMaxScore(parseInt(e.target.value) || 1)}
                                        className="w-full p-3 bg-blue-50/50 border-2 border-blue-100 rounded-xl focus:border-blue-500 focus:outline-none font-black text-center text-lg text-blue-600"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Component Weights */}
                        <div>
                            <h3 className="text-lg font-bold text-gray-700 mb-2">Component Weights</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Assign percentage weights to each component. Total must equal CA percentage ({caPercentage}%).
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Test Weight (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={testWeight}
                                        onChange={(e) => setTestWeight(parseInt(e.target.value) || 0)}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Exercise Weight (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={exerciseWeight}
                                        onChange={(e) => setExerciseWeight(parseInt(e.target.value) || 0)}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Assignment Weight (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={assignmentWeight}
                                        onChange={(e) => setAssignmentWeight(parseInt(e.target.value) || 0)}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Project Weight (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={projectWeight}
                                        onChange={(e) => setProjectWeight(parseInt(e.target.value) || 0)}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* CA vs Exam Percentage */}
                        <div>
                            <h3 className="text-lg font-bold text-gray-700 mb-4">Score Distribution</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Continuous Assessment (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={caPercentage}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            setCaPercentage(val);
                                            setExamPercentage(100 - val);
                                        }}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Exam (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={examPercentage}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            setExamPercentage(val);
                                            setCaPercentage(100 - val);
                                        }}
                                        className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-primary focus:outline-none font-bold text-gray-700"
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleSaveAssessment}
                            className="bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/30 hover:scale-105 transition-all"
                        >
                            Save Assessment Configuration
                        </button>
                    </div>
                )}

                {activeTab === 'system' && (
                    <div className="max-w-2xl space-y-8">
                        <h2 className="text-xl font-bold text-gray-800 border-b pb-4">System Maintenance</h2>

                        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                            <h3 className="text-lg font-bold text-blue-800 mb-2">Backup Data</h3>
                            <p className="text-blue-600 text-sm mb-4">
                                Download a complete backup of your school's data, including students, results, and photos.
                                Keep this file safe.
                            </p>
                            <button
                                onClick={handleBackup}
                                disabled={isLoading}
                                className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                {isLoading ? <span className="animate-spin text-xl">↻</span> : <i className="fas fa-download"></i>}
                                Export Database
                            </button>
                        </div>

                        <div className="bg-yellow-50 p-6 rounded-2xl border border-yellow-100">
                            <h3 className="text-lg font-bold text-yellow-800 mb-2">Restore Data</h3>
                            <p className="text-yellow-700 text-sm mb-4">
                                Restore a previously saved backup file. <span className="font-bold">Warning: This will overwrite all current data.</span>
                            </p>
                            <label className={`cursor-pointer bg-yellow-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-yellow-700 transition-colors inline-flex items-center gap-2 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                                <i className="fas fa-upload"></i>
                                Import Database
                                <input type="file" accept="application/json" onChange={handleRestore} className="hidden" disabled={isLoading} />
                            </label>
                        </div>
                    </div>
                )}

                {activeTab === 'security' && (
                    <div className="max-w-xl space-y-8 animate-fadeIn">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 border-b pb-4">Security Settings</h2>
                            <p className="text-sm text-gray-400 mt-2">Manage your password and platform access</p>
                        </div>

                        <div className="bg-white rounded-3xl border-2 border-gray-100 p-6 space-y-6">
                            <h3 className="font-black text-gray-700 text-sm uppercase tracking-widest flex items-center gap-2">
                                <i className="fas fa-key text-primary"></i>
                                Change Master Password
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Current Password</label>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold focus:border-primary focus:bg-white bg-gray-50 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">New Password</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold focus:border-primary focus:bg-white bg-gray-50 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Confirm New Password</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold focus:border-primary focus:bg-white bg-gray-50 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    onClick={handleChangePassword}
                                    disabled={isLoading}
                                    className="w-full bg-primary text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-blue-100 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-shield-halved"></i>}
                                    {isLoading ? 'Updating Safety Lock...' : 'Commit New Password'}
                                </button>
                                <p className="text-[10px] text-gray-400 font-medium text-center mt-4">
                                    <i className="fas fa-info-circle mr-1"></i>
                                    Changing your password will update your access on all linked devices.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Settings;
