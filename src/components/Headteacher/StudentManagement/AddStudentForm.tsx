import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { generateStudentId } from '../../../utils/idGenerator';
import { useAssetPreview } from '../../../hooks/useAssetPreview';
import { eduDb, type Student } from '../../../eduDb';
import { showToast } from '../../Common/Toast';
import { supabase } from '../../../supabaseClient';
import { dbService } from '../../../services/dbService';
import { syncService } from '../../../services/syncService';

interface AddStudentFormProps {
    studentId: number | null;
    onCancel: () => void;
    onSave: () => void;
}

const steps = [
    { id: 'personal', title: 'Personal Details', icon: 'fa-user' },
    { id: 'academic', title: 'Academic Details', icon: 'fa-graduation-cap' },
    { id: 'guardian', title: 'Guardian Details', icon: 'fa-users' },
    { id: 'review', title: 'Review & Save', icon: 'fa-check-circle' }
] as const;

type StepId = typeof steps[number]['id'];

const AddStudentForm: React.FC<AddStudentFormProps> = ({ studentId, onCancel, onSave }) => {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [formData, setFormData] = useState({
        fullName: '',
        studentIdString: '',
        gender: 'male',
        dateOfBirth: '',
        classId: '',
        religion: '',
        residentialAddress: '',
        isBoarding: false,
        guardianName: '',
        guardianPrimaryContact: '',
        guardianSecondaryContact: '',
        guardianEmail: '',
        guardianOccupation: '',
        arrears: ''
    });

    const [photo, setPhoto] = useState<Blob | null>(null);
    const photoPreview = useAssetPreview(photo);
    const [loading, setLoading] = useState(false);

    // Photo capture state
    const [photoMode, setPhotoMode] = useState<'idle' | 'camera' | 'preview'>('idle');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
            });
            streamRef.current = stream;
            // Now that we have the stream, we can set the photo mode to 'camera'
            // which will mount the video element.
            setPhotoMode('camera');
        } catch (error) {
            console.error('Camera access error:', error);
            showToast('Camera access denied or unavailable on this device.', 'error');
        }
    };

    // Use an effect to attach the stream to the video element once it mounts
    useEffect(() => {
        const video = videoRef.current;
        const stream = streamRef.current;
        
        if (photoMode === 'camera' && video && stream) {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play().catch(err => console.warn('Video play error:', err));
            };
        }
    }, [photoMode, videoRef.current]);

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setPhotoMode('idle');
    };

    const captureSnapshot = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        // Ensure video is ready with valid dimensions
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            showToast('Initializing camera... Please wait a moment.', 'warning');
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(video, 0, 0);
            canvas.toBlob(blob => {
                if (blob) {
                    setPhoto(blob);
                    stopCamera();
                    setPhotoMode('preview');
                }
            }, 'image/jpeg', 0.92);
        }
    };

    const clearPhoto = () => {
        setPhoto(null);
        setPhotoMode('idle');
    };

    const [isFlashActive, setIsFlashActive] = useState(false);

    const triggerFlash = () => {
        setIsFlashActive(true);
        setTimeout(() => setIsFlashActive(false), 300);
    };

    const [currentStep, setCurrentStep] = useState<StepId>('personal');
    const stepIndex = steps.findIndex(s => s.id === currentStep);

    // Fetch Classes
    const classes = useLiveQuery(() =>
        user?.schoolId ? eduDb.classes.where('schoolId').equals(user.schoolId).toArray() : []
        , [user?.schoolId]);

    // Fetch existing students to auto-suggest ID
    const students = useLiveQuery(() =>
        user?.schoolId ? eduDb.students.where('schoolId').equals(user.schoolId).toArray() : []
        , [user?.schoolId]);

    // Auto-suggest student ID
    useEffect(() => {
        if (!studentId && students && students.length > 0 && !formData.studentIdString) {
            // Find the most recently added student with a custom ID string
            const studentsWithIds = students.filter(s => s.studentIdString && s.studentIdString.trim() !== '');
            if (studentsWithIds.length > 0) {
                // Sort by creation time descending to get the latest
                studentsWithIds.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                const lastId = studentsWithIds[0].studentIdString!;
                
                // Extract prefix and number
                const match = lastId.match(/^(.*?)(\d+)$/);
                if (match) {
                    const prefix = match[1];
                    const numStr = match[2];
                    const nextNum = parseInt(numStr, 10) + 1;
                    // Pad with same number of zeros
                    const nextNumStr = nextNum.toString().padStart(numStr.length, '0');
                    setFormData(prev => ({ ...prev, studentIdString: `${prefix}${nextNumStr}` }));
                }
            }
        }
    }, [students, studentId, formData.studentIdString]);

    // Load Student Data if Editing
    useEffect(() => {
        if (studentId) {
            eduDb.students.get(studentId).then(student => {
                if (student) {
                    setFormData({
                        fullName: student.fullName || '',
                        studentIdString: student.studentIdString || '',
                        gender: student.gender || 'male',
                        dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
                        classId: student.classId?.toString() || '',
                        religion: student.religion || '',
                        residentialAddress: student.residentialAddress || '',
                        isBoarding: student.isBoarding || false,
                        guardianName: student.guardianName || '',
                        guardianPrimaryContact: student.guardianPrimaryContact || '',
                        guardianSecondaryContact: student.guardianSecondaryContact || '',
                        guardianEmail: student.guardianEmail || '',
                        guardianOccupation: student.guardianOccupation || '',
                        arrears: student.arrears ? student.arrears.toString() : ''
                    });
                    if (student.photo) setPhoto(student.photo);
                }
            });
        }
    }, [studentId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData(prev => ({ ...prev, [e.target.name]: value }));
    };

    const handleNext = () => {
        if (currentStep === 'personal') {
            if (!formData.fullName) return showToast('Full Name is required', 'error');
            if (!formData.dateOfBirth) return showToast('Date of Birth is required', 'error');
        } else if (currentStep === 'academic') {
            if (!formData.classId) return showToast('Class assignment is required', 'error');
        } else if (currentStep === 'guardian') {
            if (!formData.guardianName) return showToast('Guardian Name is required', 'error');
            if (!formData.guardianPrimaryContact) return showToast('Primary Contact is required', 'error');
            if (formData.guardianEmail) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(formData.guardianEmail)) {
                    return showToast('Please enter a valid email address', 'error');
                }
            }
        }
        if (stepIndex < steps.length - 1) setCurrentStep(steps[stepIndex + 1].id);
    };

    const handleBack = () => {
        if (stepIndex > 0) setCurrentStep(steps[stepIndex - 1].id);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.schoolId) return;

        setLoading(true);
        console.log('[AddStudentForm] Starting handleSubmit...');
        
        // Safety timeout — clear loading after 15s if it hangs
        const safetyTimeout = setTimeout(() => {
            setLoading(false);
            console.warn('[AddStudentForm] Submit timed out (15s fallback triggered).');
        }, 15000);
        
        try {
            const parsedArrears = formData.arrears ? parseFloat(formData.arrears) : 0;
            const safeArrears = isNaN(parsedArrears) ? 0 : parsedArrears;

            const studentData: Partial<Student> = {
                schoolId: user.schoolId,
                classId: parseInt(formData.classId),
                fullName: formData.fullName,
                studentIdString: formData.studentIdString,
                gender: formData.gender as 'male' | 'female',
                dateOfBirth: formData.dateOfBirth ? new Date(formData.dateOfBirth).getTime() : undefined,
                religion: formData.religion,
                residentialAddress: formData.residentialAddress,
                isBoarding: formData.isBoarding as boolean,
                arrears: safeArrears,
                guardianName: formData.guardianName,
                guardianPrimaryContact: formData.guardianPrimaryContact,
                guardianSecondaryContact: formData.guardianSecondaryContact,
                guardianEmail: formData.guardianEmail,
                guardianOccupation: formData.guardianOccupation,
                photo: photo || undefined,
                updatedAt: Date.now(),
                syncStatus: 'pending'
            };

            if (studentId) {
                console.log('[AddStudentForm] Mode: Update', { studentId });
                const localStudent = await eduDb.students.get(studentId);
                const cloudId = localStudent?.idCloud;

                if (cloudId) {
                    console.log('[AddStudentForm] Cloud update starting...', { cloudId });
                    const localClass = await eduDb.classes.get(parseInt(formData.classId));
                    const classCloudId = localClass?.idCloud || null;

                    const supabasePayload = {
                        class_id: classCloudId,
                        student_id_string: formData.studentIdString || localStudent?.studentIdString,
                        full_name: formData.fullName,
                        gender: formData.gender,
                        date_of_birth: formData.dateOfBirth ? new Date(formData.dateOfBirth).toISOString() : null,
                        guardian_name: formData.guardianName || 'Unknown',
                        guardian_primary_contact: formData.guardianPrimaryContact || null,
                        guardian_secondary_contact: formData.guardianSecondaryContact || null,
                        guardian_email: formData.guardianEmail || null,
                        guardian_occupation: formData.guardianOccupation || null,
                        religion: formData.religion || null,
                        residential_address: formData.residentialAddress || null,
                        is_boarding: formData.isBoarding as boolean,
                        arrears: safeArrears,
                        updated_at: new Date().toISOString()
                    };

                    const { error } = await supabase
                        .from('students')
                        .update(supabasePayload)
                        .eq('id', cloudId);

                    if (error) {
                        console.error('[AddStudentForm] Supabase Update Error:', error);
                        throw new Error(`Cloud Update Error: ${error.message}`);
                    }
                    console.log('[AddStudentForm] Cloud update success.');
                }

                console.log('[AddStudentForm] Local update starting...');
                await dbService.students.update(studentId, {
                    ...studentData,
                    syncStatus: (!cloudId || photo) ? 'pending' : 'synced'
                });
                console.log('[AddStudentForm] Local update success.');

                showToast('Student updated successfully!', 'success');
            } else {
                console.log('[AddStudentForm] Mode: Add NEW student');
                const newIdStr = formData.studentIdString || await generateStudentId();
                console.log('[AddStudentForm] Generated ID:', newIdStr);
                
                const localClass = await eduDb.classes.get(parseInt(formData.classId));
                const classCloudId = localClass?.idCloud || null;
                console.log('[AddStudentForm] Resolved Class Cloud ID:', classCloudId);

                // Create the Supabase payload inline based on our strict schema map
                const supabasePayload = {
                    school_id: user.schoolId,
                    class_id: classCloudId,
                    student_id_string: newIdStr,
                    full_name: formData.fullName,
                    gender: formData.gender,
                    date_of_birth: formData.dateOfBirth ? new Date(formData.dateOfBirth).toISOString() : null,
                    guardian_name: formData.guardianName || 'Unknown',
                    guardian_primary_contact: formData.guardianPrimaryContact || null,
                    guardian_secondary_contact: formData.guardianSecondaryContact || null,
                    guardian_email: formData.guardianEmail || null,
                    guardian_occupation: formData.guardianOccupation || null,
                    religion: formData.religion || null,
                    residential_address: formData.residentialAddress || null,
                    is_boarding: formData.isBoarding as boolean,
                    arrears: safeArrears,
                    is_deleted: false
                };

                // Online Supabase Insert FIRST
                console.log('[AddStudentForm] Calling Supabase insert...', supabasePayload);
                const { data, error } = await supabase
                    .from('students')
                    .insert(supabasePayload)
                    .select('id')
                    .single();

                if (error) {
                    console.error('[AddStudentForm] Supabase Insert Error:', error);
                    throw new Error(`Cloud Sync Error: ${error.message}`);
                }

                if (!data) {
                    console.error('[AddStudentForm] Supabase returned no data but no error.');
                    throw new Error('Cloud Sync Error: No data returned from server.');
                }

                console.log('[AddStudentForm] Cloud insert success. Received ID:', data.id);

                // If online insertion succeeds, mirror to IndexedDB cache
                console.log('[AddStudentForm] Local save starting...');
                await dbService.students.save({
                    ...studentData,
                    idCloud: data.id, 
                    studentIdString: newIdStr,
                    createdAt: Date.now(),
                    isDeleted: false,
                    deletedAt: null, 
                    syncStatus: photo ? 'pending' : 'synced'
                } as unknown as Student);
                console.log('[AddStudentForm] Local save success.');
                
                showToast('Student added successfully!', 'success');
            }

            // Trigger real-time broadcast to notify other portals (Teachers/Accountants)
            if (user?.schoolId) {
                syncService.broadcastSyncNeeded(user.schoolId);
            }
            
            onSave();
        } catch (error: any) {
            console.error('Error saving student:', error);
            const errMsg = error.message || '';
            
            // Explicitly handle "Permission Denied" (likely RLS failure)
            if (errMsg.includes('42501') || errMsg.toLowerCase().includes('permission denied')) {
                showToast('Cloud permission denied. Please log out and back in to refresh your security token.', 'error');
            } else if (errMsg.includes('Cloud Sync Error')) {
                showToast('Failed to save to cloud. Your offline data is safe.', 'warning');
            } else {
                showToast(errMsg || 'Failed to save student. Please try again.', 'error');
            }
        } finally {
            clearTimeout(safetyTimeout);
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex items-start sm:items-center justify-between border-b border-gray-100 pb-4 flex-col sm:flex-row gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">
                        {studentId ? 'Edit Student Profile' : 'Student Registration'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1 font-medium">
                        {studentId ? 'Update existing student records securely offline.' : 'Fill in the details to enroll a new student.'}
                    </p>
                </div>
                <button onClick={onCancel} className="w-10 h-10 rounded-xl bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 flex items-center justify-center transition-all border border-transparent self-end sm:self-auto">
                    <i className="fas fa-times"></i>
                </button>
            </div>

            {/* Stepper Progress */}
            <div className="relative mb-12 hidden md:block px-4">
                <div className="absolute top-1/2 left-4 right-4 h-1 bg-gray-100 -translate-y-1/2 rounded-full z-0"></div>
                <div
                    className="absolute top-1/2 left-4 h-1 bg-blue-500 -translate-y-1/2 rounded-full z-0 transition-all duration-500 ease-out"
                    style={{ width: `calc(${(stepIndex / (steps.length - 1)) * 100}% - 2rem)` }}
                ></div>
                <div className="relative z-10 flex justify-between">
                    {steps.map((step, idx) => {
                        const isPast = idx < stepIndex;
                        const isCurrent = idx === stepIndex;
                        return (
                            <div key={step.id} className="flex flex-col items-center gap-2 group cursor-pointer" onClick={() => idx < stepIndex && setCurrentStep(step.id)}>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm transition-all duration-300 ${isCurrent ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl shadow-blue-200 scale-110' :
                                    isPast ? 'bg-blue-100 text-blue-600 border-2 border-blue-200 hover:bg-blue-200' : 'bg-white text-gray-400 border-2 border-gray-100'
                                    }`}>
                                    <i className={`fas ${isPast ? 'fa-check' : step.icon}`}></i>
                                </div>
                                <span className={`text-xs font-black tracking-wider uppercase transition-colors ${isCurrent ? 'text-blue-600' : isPast ? 'text-blue-400' : 'text-gray-400'}`}>
                                    {step.title}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Mobile Header indicator */}
            <div className="md:hidden flex items-center justify-between text-blue-600 font-bold text-sm border-b border-blue-100 pb-2">
                <div className="flex items-center gap-2">
                    <i className={`fas ${steps[stepIndex].icon}`}></i> {steps[stepIndex].title}
                </div>
                <span>Step {stepIndex + 1} of 4</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

                {currentStep === 'personal' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                        {/* ── Photo Widget ── */}
                        <div className="col-span-1 md:col-span-2">
                            <canvas ref={canvasRef} className="hidden" />

                            <div className="flex flex-col items-center justify-center">
                                {/* IDLE STATE — choice mode or profile placeholder */}
                                {photoMode === 'idle' && !photo && (
                                    <div className="relative group">
                                        <div 
                                            onClick={startCamera}
                                            className="w-48 h-48 rounded-[3rem] bg-gradient-to-br from-gray-50 to-gray-100 border-4 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer transition-all duration-500 hover:border-blue-400 hover:bg-blue-50/30 group-hover:scale-[1.02] shadow-sm relative overflow-hidden"
                                        >
                                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors mb-3">
                                                <i className="fas fa-camera text-2xl"></i>
                                            </div>
                                            <p className="text-xs font-black text-gray-400 group-hover:text-blue-600 uppercase tracking-widest transition-colors text-center px-4">
                                                Take Photo <br/> <span className="text-[10px] font-medium normal-case">(Click to start)</span>
                                            </p>
                                        </div>
                                        
                                        {/* Quick Upload Button */}
                                        <button 
                                            type="button" 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="absolute -bottom-2 -right-2 w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-110 active:scale-95 transition-all border-4 border-white"
                                            title="Upload from device"
                                        >
                                            <i className="fas fa-upload"></i>
                                        </button>
                                    </div>
                                )}

                                {/* CAMERA STATE — live viewfinder */}
                                {photoMode === 'camera' && (
                                    <div className="w-full max-w-md bg-gray-950 rounded-[3rem] overflow-hidden shadow-2xl border-4 border-white relative">
                                        <div className="aspect-square relative overflow-hidden bg-black">
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                className="w-full h-full object-cover"
                                            />
                                            
                                            {/* Face guide overlay */}
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="w-64 h-72 border-2 border-white/20 rounded-[4rem] relative">
                                                    <div className="absolute inset-x-0 top-1/4 h-px bg-white/10"></div>
                                                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/10"></div>
                                                    <span className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-3xl"></span>
                                                    <span className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-3xl"></span>
                                                    <span className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-3xl"></span>
                                                    <span className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-3xl"></span>
                                                </div>
                                            </div>

                                            {/* Flash effect overlay */}
                                            {isFlashActive && (
                                                <div className="absolute inset-0 bg-white animate-fadeOut z-20"></div>
                                            )}

                                            {/* Camera Controls Overlay */}
                                            <div className="absolute bottom-6 inset-x-0 flex items-center justify-around px-8">
                                                <button
                                                    type="button"
                                                    onClick={stopCamera}
                                                    className="w-12 h-12 bg-white/10 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-black/40 transition-all border border-white/20"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                                
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        triggerFlash();
                                                        setTimeout(captureSnapshot, 150);
                                                    }}
                                                    className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl shadow-white/20 hover:scale-110 active:scale-95 transition-all"
                                                >
                                                    <div className="w-12 h-12 rounded-full border-2 border-black/5 flex items-center justify-center">
                                                        <i className="fas fa-camera text-black text-xl"></i>
                                                    </div>
                                                </button>

                                                <div className="w-12 h-12 flex items-center justify-center">
                                                    {/* Empty for spacing */}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* PREVIEW STATE — photo taken or uploaded */}
                                {(photo && photoMode !== 'camera') && (
                                    <div className="relative group">
                                        <div className="w-48 h-48 rounded-[3rem] overflow-hidden shadow-2xl border-4 border-white">
                                            {photoPreview && <img src={photoPreview} alt="Student" className="w-full h-full object-cover" />}
                                        </div>
                                        
                                        {/* Status Badge */}
                                        <div className="absolute -top-3 -right-3 px-3 py-1 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg border-2 border-white flex items-center gap-1.5">
                                            <i className="fas fa-check"></i> Ready
                                        </div>

                                        {/* Actions Overlay — appear on hover */}
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-[3rem] opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3">
                                            <button 
                                                type="button" 
                                                onClick={startCamera} 
                                                className="w-10 h-10 bg-white text-blue-600 rounded-xl flex items-center justify-center hover:scale-110 transition-all shadow-lg"
                                                title="Retake"
                                            >
                                                <i className="fas fa-camera"></i>
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={clearPhoto} 
                                                className="w-10 h-10 bg-white text-red-500 rounded-xl flex items-center justify-center hover:scale-110 transition-all shadow-lg"
                                                title="Remove"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Hidden file input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 5 * 1024 * 1024) {
                                        showToast('File too large. Max 5MB.', 'error');
                                        return;
                                    }
                                    setPhoto(file);
                                    setPhotoMode('preview');
                                    e.target.value = '';
                                }}
                            />
                        </div>


                        <div className="col-span-1 md:col-span-2 space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Full Legal Name <span className="text-red-500">*</span></label>
                            <input
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleChange}
                                placeholder="e.g. Samuel Omen"
                                className="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Gender <span className="text-red-500">*</span></label>
                            <div className="grid grid-cols-2 gap-3 h-[58px]">
                                <button type="button" onClick={() => setFormData({ ...formData, gender: 'male' })} className={`rounded-xl border-2 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${formData.gender === 'male' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600'}`}>
                                    <i className="fas fa-male text-lg"></i> Male
                                </button>
                                <button type="button" onClick={() => setFormData({ ...formData, gender: 'female' })} className={`rounded-xl border-2 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${formData.gender === 'female' ? 'bg-pink-50 border-pink-500 text-pink-700 shadow-sm' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600'}`}>
                                    <i className="fas fa-female text-lg"></i> Female
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Date of Birth <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                name="dateOfBirth"
                                value={formData.dateOfBirth}
                                onChange={handleChange}
                                className="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white h-[58px]"
                            />
                        </div>

                        <div className="col-span-1 md:col-span-2 flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors shadow-sm" onClick={() => setFormData({ ...formData, isBoarding: !formData.isBoarding })}>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${formData.isBoarding ? 'bg-indigo-600 text-white shadow-md' : 'border-2 border-gray-300 bg-white'}`}>
                                {formData.isBoarding && <i className="fas fa-check"></i>}
                            </div>
                            <div>
                                <p className="font-black text-gray-800 tracking-tight">Boarding Student</p>
                                <p className="text-sm text-gray-500 font-medium">Check this if the student will reside in the campus dormitories.</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Religion</label>
                            <input
                                name="religion"
                                value={formData.religion}
                                onChange={handleChange}
                                placeholder="e.g. Christian, Muslim"
                                className="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white"
                            />
                        </div>

                        <div className="col-span-1 md:col-span-2 space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Residential Address</label>
                            <textarea
                                name="residentialAddress"
                                value={formData.residentialAddress}
                                onChange={handleChange}
                                placeholder="Enter home address or digital GPS code"
                                className="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white min-h-[120px] resize-y"
                            />
                        </div>
                    </div>
                )}

                {currentStep === 'academic' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">



                        <div className="col-span-1 md:col-span-2 space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Assign Class <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <select
                                    name="classId"
                                    value={formData.classId}
                                    onChange={handleChange}
                                    className="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all bg-gray-50 focus:bg-white font-black text-gray-800 appearance-none shadow-sm cursor-pointer"
                                    style={{ WebkitAppearance: 'none' }}
                                >
                                    <option value="" className="text-gray-400">Select a Class...</option>
                                    {classes?.map(cls => (
                                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                    <i className="fas fa-chevron-down text-gray-400"></i>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Custom Student ID</label>
                            <input
                                name="studentIdString"
                                value={formData.studentIdString}
                                onChange={handleChange}
                                placeholder="Leave blank to auto-generate"
                                className="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white"
                            />
                            <p className="text-xs font-medium text-gray-500 mt-2 px-1">Useful if your school uses a specific naming convention.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Arrears Brought Forward (GHS)</label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-gray-400">₵</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    name="arrears"
                                    value={formData.arrears}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    className="w-full pl-10 pr-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <p className="text-xs font-medium text-gray-500 mt-2 px-1">Unpaid fees from previous academic periods.</p>
                        </div>
                    </div>
                )}

                {currentStep === 'guardian' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">

                        <div className="col-span-1 md:col-span-2 space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Guardian Full Name <span className="text-red-500">*</span></label>
                            <input
                                name="guardianName"
                                value={formData.guardianName}
                                onChange={handleChange}
                                placeholder="e.g. Mr. Robert Smith"
                                className="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Primary Phone <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"><i className="fas fa-phone"></i></span>
                                <input
                                    type="tel"
                                    name="guardianPrimaryContact"
                                    value={formData.guardianPrimaryContact}
                                    onChange={handleChange}
                                    placeholder="024 XXXX XXX"
                                    className="w-full pl-12 pr-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white tracking-wide"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Secondary Phone</label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"><i className="fas fa-phone-alt"></i></span>
                                <input
                                    type="tel"
                                    name="guardianSecondaryContact"
                                    value={formData.guardianSecondaryContact}
                                    onChange={handleChange}
                                    placeholder="Optional"
                                    className="w-full pl-12 pr-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white tracking-wide"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Email Address</label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"><i className="fas fa-envelope"></i></span>
                                <input
                                    type="email"
                                    name="guardianEmail"
                                    value={formData.guardianEmail}
                                    onChange={handleChange}
                                    placeholder="parent@example.com"
                                    className="w-full pl-12 pr-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-black text-gray-700 uppercase tracking-wider">Occupation</label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"><i className="fas fa-briefcase"></i></span>
                                <input
                                    name="guardianOccupation"
                                    value={formData.guardianOccupation}
                                    onChange={handleChange}
                                    placeholder="e.g. Teacher, Trader"
                                    className="w-full pl-12 pr-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-300 font-bold text-gray-800 shadow-sm bg-gray-50 focus:bg-white"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 'review' && (
                    <div className="animate-fadeIn space-y-6">
                        <div className="bg-gray-50 rounded-[2rem] p-6 sm:p-8 border border-gray-200 shadow-inner">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xl font-black text-gray-800 tracking-tight">Registration Summary</h3>
                                <button type="button" onClick={() => setCurrentStep('personal')} className="text-sm font-bold text-blue-600 hover:text-blue-800 underline decoration-2 underline-offset-4">Edit All</button>
                            </div>

                            <div className="flex flex-col md:flex-row gap-8 sm:gap-12">
                                <div className="shrink-0 flex flex-col items-center">
                                    <div className="w-32 h-32 rounded-[2.5rem] bg-white border-4 border-gray-100 shadow-md overflow-hidden mb-4">
                                        {photoPreview ? (
                                            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                <i className="fas fa-user text-5xl"></i>
                                            </div>
                                        )}
                                    </div>
                                    <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-sm ${formData.isBoarding ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
                                        {formData.isBoarding ? <><i className="fas fa-bed mr-1"></i> Boarding</> : <><i className="fas fa-sun mr-1"></i> Day Student</>}
                                    </span>
                                </div>

                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1 flex items-center justify-between">
                                            Full Name
                                            <i className="fas fa-pen text-gray-300 cursor-pointer hover:text-blue-500" onClick={() => setCurrentStep('personal')}></i>
                                        </p>
                                        <p className="font-black text-gray-900 text-lg leading-tight">{formData.fullName}</p>
                                    </div>

                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1 flex items-center justify-between">
                                            Academic Class
                                            <i className="fas fa-pen text-gray-300 cursor-pointer hover:text-blue-500" onClick={() => setCurrentStep('academic')}></i>
                                        </p>
                                        <p className="font-black text-blue-600 text-lg leading-tight">{classes?.find(c => c.id?.toString() === formData.classId)?.name || 'N/A'}</p>
                                    </div>

                                    <div>
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Date of Birth</p>
                                        <p className="font-bold text-gray-800 flex items-center gap-2">
                                            {formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString() : 'N/A'}
                                            <span className="text-gray-300">|</span>
                                            <span className="capitalize">{formData.gender}</span>
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Student ID</p>
                                        {formData.studentIdString ? (
                                            <p className="font-bold text-gray-800">{formData.studentIdString}</p>
                                        ) : (
                                            <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg border border-yellow-200">System Generated</span>
                                        )}
                                    </div>

                                    <div className="sm:col-span-2 pt-5 border-t border-gray-200 mt-2">
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-3 flex items-center justify-between">
                                            Guardian Information
                                            <i className="fas fa-pen text-gray-300 cursor-pointer hover:text-blue-500" onClick={() => setCurrentStep('guardian')}></i>
                                        </p>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 bg-white p-4 rounded-xl border border-gray-100">
                                            <span className="font-black text-gray-800"><i className="fas fa-user text-gray-400 mr-2"></i>{formData.guardianName}</span>
                                            <span className="hidden sm:inline text-gray-300">|</span>
                                            <span className="font-bold text-gray-600"><i className="fas fa-phone text-gray-400 mr-2"></i>{formData.guardianPrimaryContact}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 justify-center text-sm font-bold text-indigo-600 bg-indigo-50 py-3 px-6 rounded-xl border border-indigo-100 shadow-sm mx-auto w-fit">
                            <i className="fas fa-cloud-upload-alt text-lg"></i>
                            Ready to save securely offline.
                        </div>
                    </div>
                )}

                {/* Navigation Buttons Area */}
                <div className="flex items-center justify-between pt-8 mt-6 border-t border-gray-100 bg-white sticky bottom-0 pb-6 z-20">
                    <button
                        type="button"
                        onClick={handleBack}
                        className={`px-5 sm:px-6 py-4 rounded-2xl font-black uppercase tracking-wider text-xs sm:text-sm transition-all focus:outline-none flex items-center gap-2 md:gap-3 ${stepIndex > 0 ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95' : 'bg-transparent text-transparent cursor-default select-none'
                            }`}
                        aria-hidden={stepIndex === 0}
                    >
                        <i className="fas fa-arrow-left"></i> <span className="hidden sm:inline">Back</span>
                    </button>

                    {stepIndex < steps.length - 1 ? (
                        <button
                            type="button"
                            onClick={handleNext}
                            className="px-8 sm:px-12 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black uppercase tracking-widest text-sm hover:shadow-xl hover:shadow-blue-200 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center gap-3 focus:outline-none focus:ring-4 focus:ring-blue-500/30"
                        >
                            <span className="hidden sm:inline">Next Step</span>
                            <span className="sm:hidden">Next</span>
                            <i className="fas fa-arrow-right"></i>
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 sm:px-10 py-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black uppercase tracking-widest text-sm hover:shadow-xl hover:shadow-green-200 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none focus:outline-none focus:ring-4 focus:ring-green-500/30"
                        >
                            {loading ? <i className="fas fa-spinner fa-spin text-lg"></i> : <i className="fas fa-check-circle text-lg"></i>}
                            {studentId ? 'Confirm Update' : 'Finalize Save'}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};

export default AddStudentForm;
