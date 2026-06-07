import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { eduDb, type Student } from '../../../eduDb';
import { useAuth } from '../../../hooks/useAuth';
import { showToast } from '../../Common/Toast';
import { dbService } from '../../../services/dbService';
import { syncService } from '../../../services/syncService';
import { generateStudentId } from '../../../utils/idGenerator';

interface ExcelImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportSuccess: () => void;
}

interface ParsedRow {
    id: string; // Temporary UI key
    fullName: string;
    classId: string; // Dexie Class ID as string
    rawClassName: string; // The text imported from spreadsheet
    studentIdString: string;
    gender: 'male' | 'female';
    dateOfBirth: string; // YYYY-MM-DD
    isBoarding: boolean;
    arrears: string;
    religion: string;
    residentialAddress: string;
    guardianName: string;
    guardianPrimaryContact: string;
    guardianSecondaryContact: string;
    guardianEmail: string;
    guardianOccupation: string;
    selected: boolean; // For checkboxes
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ isOpen, onClose, onImportSuccess }) => {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // States
    const [fileName, setFileName] = useState<string>('');
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [step, setStep] = useState<'upload' | 'preview'>('upload');

    // Fetch school classes and students from Dexie for resolving names and duplicate checks
    const classes = useLiveQuery(() =>
        user?.schoolId ? eduDb.classes.where('schoolId').equals(user.schoolId).filter(c => !c.isDeleted).toArray() : []
    , [user?.schoolId]);

    const students = useLiveQuery(() =>
        user?.schoolId ? eduDb.students.where('schoolId').equals(user.schoolId).toArray() : []
    , [user?.schoolId]);

    if (!isOpen) return null;

    // Generate and download sample CSV Template
    const downloadTemplate = () => {
        const headers = [
            'Full Name',
            'Class',
            'Student ID (Optional)',
            'Gender (male/female)',
            'Date of Birth (YYYY-MM-DD)',
            'Is Boarding (yes/no)',
            'Arrears (Optional)',
            'Religion (Optional)',
            'Residential Address (Optional)',
            'Guardian Name (Optional)',
            'Guardian Primary Contact (Optional)',
            'Guardian Secondary Contact (Optional)',
            'Guardian Email (Optional)',
            'Guardian Occupation (Optional)'
        ];
        const rows = [
            ['John Doe', 'Class 1', 'STU-001', 'male', '2015-05-15', 'no', '0', 'Christian', 'Accra', 'Mr. Robert Doe', '0240000001', '', 'parent@example.com', 'Trader'],
            ['Jane Smith', 'Class 2', '', 'female', '2014-10-22', 'yes', '50.00', 'Muslim', 'Kumasi', 'Mrs. Mary Smith', '0550000002', '0200000003', '', 'Teacher']
        ];

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'learner_registration_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Flexible column mapping based on synonyms
    const mapHeaderToField = (header: string): string | null => {
        const h = header.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

        if (['fullname', 'name', 'studentname', 'learnername', 'fulllegalname'].includes(h)) return 'fullName';
        if (['class', 'classname', 'classroom', 'grade', 'classassignment'].includes(h)) return 'rawClassName';
        if (['studentid', 'studentidoptional', 'student_id', 'customid', 'studentidstring', 'learnerid'].includes(h)) return 'studentIdString';
        if (['gender', 'sex', 'gendermalefemale'].includes(h)) return 'gender';
        if (['dateofbirth', 'dob', 'birthdate', 'dateofbirthyyyymmdd'].includes(h)) return 'dateOfBirth';
        if (['isboarding', 'boarding', 'isboardingyesno', 'boardingstudent'].includes(h)) return 'isBoarding';
        if (['arrears', 'arrearsoptional', 'outstanding', 'balance', 'owed'].includes(h)) return 'arrears';
        if (['religion', 'religionoptional'].includes(h)) return 'religion';
        if (['residentialaddress', 'address', 'residentialaddressoptional', 'residence'].includes(h)) return 'residentialAddress';
        if (['guardianname', 'guardian', 'parentname', 'parent', 'guardiannameoptional'].includes(h)) return 'guardianName';
        if (['guardianprimarycontact', 'phone', 'primarycontact', 'contact', 'phonenumber', 'guardianprimarycontactoptional'].includes(h)) return 'guardianPrimaryContact';
        if (['guardiansecondarycontact', 'secondaryphone', 'secondarycontact', 'phone2', 'guardiansecondarycontactoptional'].includes(h)) return 'guardianSecondaryContact';
        if (['guardianemail', 'email', 'parentemail', 'guardianemailoptional'].includes(h)) return 'guardianEmail';
        if (['guardianoccupation', 'occupation', 'parentoccupation', 'guardianoccupationoptional'].includes(h)) return 'guardianOccupation';

        return null;
    };

    // File parsing logic
    const handleFileParse = (file: File) => {
        setFileName(file.name);
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

                if (rawData.length === 0) {
                    showToast('The spreadsheet appears to be empty.', 'error');
                    return;
                }

                // Parse headers and map columns
                const rawHeaders = rawData[0] as string[];
                const columnMap: { [key: number]: string } = {};
                rawHeaders.forEach((header, idx) => {
                    const field = mapHeaderToField(header);
                    if (field) columnMap[idx] = field;
                });

                // Verify critical columns
                const mappedFields = Object.values(columnMap);
                if (!mappedFields.includes('fullName')) {
                    showToast('Could not find a "Full Name" column. Please match the template.', 'error');
                    return;
                }

                // Process rows
                const rows: ParsedRow[] = [];
                for (let i = 1; i < rawData.length; i++) {
                    const rowData = rawData[i];
                    if (!rowData || rowData.length === 0) continue;

                    // Skip completely empty lines
                    const isEmptyLine = rowData.every((val: any) => val === undefined || val === null || val === '');
                    if (isEmptyLine) continue;

                    const parsedRow: any = {
                        id: `row-${i}-${Date.now()}`,
                        fullName: '',
                        classId: '',
                        rawClassName: '',
                        studentIdString: '',
                        gender: 'male',
                        dateOfBirth: '',
                        isBoarding: false,
                        arrears: '',
                        religion: '',
                        residentialAddress: '',
                        guardianName: '',
                        guardianPrimaryContact: '',
                        guardianSecondaryContact: '',
                        guardianEmail: '',
                        guardianOccupation: '',
                        selected: true
                    };

                    rowData.forEach((val: any, idx: number) => {
                        const field = columnMap[idx];
                        if (!field) return;

                        let cleanVal = String(val ?? '').trim();

                        if (field === 'gender') {
                            parsedRow[field] = cleanVal.toLowerCase().startsWith('f') ? 'female' : 'male';
                        } else if (field === 'isBoarding') {
                            const low = cleanVal.toLowerCase();
                            parsedRow[field] = (low === 'yes' || low === 'y' || low === 'true' || low === 'boarding');
                        } else if (field === 'dateOfBirth') {
                            // Handle spreadsheet date serialization numbers
                            if (!isNaN(Number(val)) && Number(val) > 20000) {
                                const parsedDate = XLSX.SSF.parse_date_code(Number(val));
                                parsedRow[field] = `${parsedDate.y}-${String(parsedDate.m).padStart(2, '0')}-${String(parsedDate.d).padStart(2, '0')}`;
                            } else {
                                parsedRow[field] = cleanVal;
                            }
                        } else {
                            parsedRow[field] = cleanVal;
                        }
                    });

                    // Auto-resolve class by name lookup
                    if (parsedRow.rawClassName && classes) {
                        const matchedClass = classes.find(c => 
                            c.name.toLowerCase().trim() === parsedRow.rawClassName.toLowerCase().trim()
                        );
                        if (matchedClass) {
                            parsedRow.classId = String(matchedClass.id);
                        }
                    }

                    rows.push(parsedRow);
                }

                if (rows.length === 0) {
                    showToast('No valid rows found in sheet.', 'warning');
                    return;
                }

                setParsedRows(rows);
                setStep('preview');
            } catch (err) {
                console.error('[Import] Parsing error:', err);
                showToast('Failed to parse file. Ensure it is a valid Excel or CSV sheet.', 'error');
            }
        };

        reader.readAsArrayBuffer(file);
    };

    // Drag & Drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileParse(file);
    };

    // In-place edits handlers
    const handleRowChange = (id: string, field: keyof ParsedRow, value: any) => {
        setParsedRows(prev =>
            prev.map(row => (row.id === id ? { ...row, [field]: value } : row))
        );
    };

    // Validation Checkers
    const isRowDuplicate = (row: ParsedRow): boolean => {
        if (!students) return false;
        // Check if student id string matches any existing
        if (row.studentIdString && students.some(s => s.studentIdString?.toLowerCase() === row.studentIdString.toLowerCase())) {
            return true;
        }
        // Check if duplicate in spreadsheet
        const sheetMatches = parsedRows.filter(r => r.studentIdString && r.studentIdString.toLowerCase() === row.studentIdString.toLowerCase());
        if (sheetMatches.length > 1 && sheetMatches[0].id !== row.id) {
            return true;
        }
        return false;
    };

    const isRowValid = (row: ParsedRow): boolean => {
        if (!row.fullName.trim()) return false;
        if (!row.classId) return false;
        return true;
    };

    // Save imported records to IndexedDB (Dexie)
    const handleRegisterLearners = async () => {
        if (!user?.schoolId) return;

        const validSelectedRows = parsedRows.filter(r => r.selected && isRowValid(r) && !isRowDuplicate(r));
        if (validSelectedRows.length === 0) {
            showToast('No valid rows selected for import.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            console.log(`[Import] Registering ${validSelectedRows.length} learners...`);
            let savedCount = 0;

            for (const row of validSelectedRows) {
                const parsedArrears = parseFloat(row.arrears) || 0;
                const finalIdString = row.studentIdString || await generateStudentId();

                const studentData: Student = {
                    schoolId: user.schoolId,
                    classId: parseInt(row.classId),
                    fullName: row.fullName,
                    studentIdString: finalIdString,
                    gender: row.gender,
                    dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth).getTime() : undefined,
                    religion: row.religion,
                    residentialAddress: row.residentialAddress,
                    isBoarding: row.isBoarding,
                    arrears: parsedArrears,
                    guardianName: row.guardianName,
                    guardianPrimaryContact: row.guardianPrimaryContact,
                    guardianSecondaryContact: row.guardianSecondaryContact,
                    guardianEmail: row.guardianEmail,
                    guardianOccupation: row.guardianOccupation,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    isDeleted: false,
                    syncStatus: 'pending'
                };

                await dbService.students.save(studentData);
                savedCount++;
            }

            showToast(`Successfully registered ${savedCount} learners locally!`, 'success');

            // Optimistic cloud sync
            if (navigator.onLine) {
                syncService.syncStudents(user.schoolId)
                    .then(() => {
                        showToast('Cloud sync complete!', 'success');
                        syncService.broadcastSyncNeeded(user.schoolId);
                    })
                    .catch(e => {
                        console.warn('[Import] Background sync failed:', e);
                        showToast('Saved locally. Will sync automatically online.', 'warning');
                    });
            } else {
                showToast('Imported locally. Records will sync when online.', 'warning');
            }

            onImportSuccess();
            onClose();
        } catch (err) {
            console.error('[Import] Database insert error:', err);
            showToast('Failed to save imported learners. Please try again.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
            <div className={`bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-300 w-full ${
                step === 'upload' ? 'max-w-xl h-auto' : 'max-w-6xl h-[85vh]'
            }`}>
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2">
                            <i className="fas fa-file-excel text-emerald-600"></i> Import Learners Spreadsheet
                        </h3>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                            {step === 'upload' ? 'Upload your student CSV or Excel file to begin.' : `Verify and edit details for ${parsedRows.length} parsed records.`}
                        </p>
                    </div>
                    <button onClick={onClose} className="btn-icon !w-9 !h-9 !bg-gray-100 !text-gray-500 hover:!bg-red-50 hover:!text-red-500 transition-colors">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Content */}
                {step === 'upload' ? (
                    <div className="p-8 space-y-6">
                        {/* Download Template Card */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-100/50 rounded-2xl p-5 flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <h4 className="font-black text-blue-900 text-sm uppercase tracking-wider">Use the template for best results</h4>
                                <p className="text-xs text-blue-700/80 font-medium leading-relaxed">
                                    Download our formatted spreadsheet template to ensure column headers and data structures align perfectly.
                                </p>
                            </div>
                            <button
                                onClick={downloadTemplate}
                                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-lg shadow-blue-100 active:scale-95 transition-all flex items-center gap-2"
                            >
                                <i className="fas fa-download"></i> Template
                            </button>
                        </div>

                        {/* Dropzone */}
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-4 border-dashed rounded-[2rem] p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                                isDragging 
                                    ? 'border-indigo-500 bg-indigo-50/20 scale-[0.99]' 
                                    : 'border-gray-200 hover:border-indigo-400 hover:bg-gray-50/50'
                            }`}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".xlsx, .xls, .csv"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileParse(file);
                                }}
                            />
                            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 shadow-inner">
                                <i className="fas fa-cloud-upload-alt text-2xl animate-bounce"></i>
                            </div>
                            <h5 className="font-black text-gray-800 text-base">Drag & Drop file here</h5>
                            <p className="text-xs text-gray-400 mt-1">or click to browse from device</p>
                            <span className="text-[10px] text-gray-400 mt-4 px-3 py-1 bg-gray-50 border border-gray-100 rounded-lg">Supports .xlsx, .xls, .csv</span>
                        </div>
                    </div>
                ) : (
                    // PREVIEW GRID STEP
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Validation Summary Bar */}
                        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 text-xs font-bold text-gray-600">
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg border border-gray-100">
                                File: <strong className="text-gray-800">{fileName}</strong>
                            </span>
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100">
                                Total Parsed: <strong>{parsedRows.length}</strong>
                            </span>
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                                Valid: <strong>{parsedRows.filter(r => isRowValid(r) && !isRowDuplicate(r)).length}</strong>
                            </span>
                            {parsedRows.some(r => isRowDuplicate(r)) && (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-100">
                                    Duplicates Detected: <strong>{parsedRows.filter(r => isRowDuplicate(r)).length} (will be skipped)</strong>
                                </span>
                            )}
                            {parsedRows.some(r => !isRowValid(r)) && (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-lg border border-red-100 animate-pulse">
                                    Requires Correction: <strong>{parsedRows.filter(r => !isRowValid(r)).length}</strong>
                                </span>
                            )}
                        </div>

                        {/* Interactive Data Table */}
                        <div className="flex-1 overflow-auto p-6">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b border-gray-200 text-gray-400 font-black uppercase tracking-wider">
                                        <th className="py-3 px-2 w-10">Import</th>
                                        <th className="py-3 px-3 w-48">Full Name *</th>
                                        <th className="py-3 px-3 w-40">Class Assignment *</th>
                                        <th className="py-3 px-3 w-32">Custom ID</th>
                                        <th className="py-3 px-3 w-28">Gender</th>
                                        <th className="py-3 px-3 w-32">DOB</th>
                                        <th className="py-3 px-3 w-24">Boarding</th>
                                        <th className="py-3 px-3 w-28">Arrears (GHS)</th>
                                        <th className="py-3 px-3 w-40">Guardian Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedRows.map((row) => {
                                        const duplicate = isRowDuplicate(row);
                                        
                                        return (
                                            <tr key={row.id} className={`border-b border-gray-100 transition-colors hover:bg-gray-50/50 ${
                                                !row.selected ? 'opacity-40' : ''
                                            }`}>
                                                {/* CHECKBOX */}
                                                <td className="py-3 px-2 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={row.selected}
                                                        onChange={(e) => handleRowChange(row.id, 'selected', e.target.checked)}
                                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                                                    />
                                                </td>

                                                {/* FULL NAME */}
                                                <td className="py-2 px-3">
                                                    <input
                                                        type="text"
                                                        value={row.fullName}
                                                        onChange={(e) => handleRowChange(row.id, 'fullName', e.target.value)}
                                                        className={`w-full px-2.5 py-1.5 rounded-lg border font-bold text-gray-800 ${
                                                            !row.fullName.trim() 
                                                                ? 'border-red-300 bg-red-50/20 focus:border-red-500' 
                                                                : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10'
                                                        }`}
                                                        placeholder="Name required"
                                                    />
                                                </td>

                                                {/* CLASS ASSIGNMENT */}
                                                <td className="py-2 px-3">
                                                    <select
                                                        value={row.classId}
                                                        onChange={(e) => handleRowChange(row.id, 'classId', e.target.value)}
                                                        className={`w-full px-2 py-1.5 rounded-lg border font-bold text-gray-800 cursor-pointer ${
                                                            !row.classId 
                                                                ? 'border-red-300 bg-red-50/30 text-red-600 focus:border-red-500' 
                                                                : 'border-gray-200 focus:border-indigo-500'
                                                        }`}
                                                    >
                                                        <option value="">
                                                            {row.rawClassName ? `Select for "${row.rawClassName}"` : 'Select Class...'}
                                                        </option>
                                                        {classes?.map(c => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                </td>

                                                {/* CUSTOM STUDENT ID */}
                                                <td className="py-2 px-3 relative">
                                                    <input
                                                        type="text"
                                                        value={row.studentIdString}
                                                        onChange={(e) => handleRowChange(row.id, 'studentIdString', e.target.value)}
                                                        className={`w-full px-2.5 py-1.5 rounded-lg border font-bold text-gray-800 ${
                                                            duplicate 
                                                                ? 'border-amber-300 bg-amber-50/20 focus:border-amber-500' 
                                                                : 'border-gray-200 focus:border-indigo-500'
                                                        }`}
                                                        placeholder="Auto-generate"
                                                    />
                                                    {duplicate && (
                                                        <span className="absolute bottom-[-10px] left-3 text-[8px] font-bold text-amber-600 leading-none">ID exists, skipped</span>
                                                    )}
                                                </td>

                                                {/* GENDER */}
                                                <td className="py-2 px-3">
                                                    <select
                                                        value={row.gender}
                                                        onChange={(e) => handleRowChange(row.id, 'gender', e.target.value)}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 font-bold text-gray-800"
                                                    >
                                                        <option value="male">Male</option>
                                                        <option value="female">Female</option>
                                                    </select>
                                                </td>

                                                {/* DATE OF BIRTH */}
                                                <td className="py-2 px-3">
                                                    <input
                                                        type="date"
                                                        value={row.dateOfBirth}
                                                        onChange={(e) => handleRowChange(row.id, 'dateOfBirth', e.target.value)}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 font-bold text-gray-800"
                                                    />
                                                </td>

                                                {/* IS BOARDING */}
                                                <td className="py-2 px-3 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRowChange(row.id, 'isBoarding', !row.isBoarding)}
                                                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                                            row.isBoarding 
                                                                ? 'bg-indigo-50 border border-indigo-100 text-indigo-700' 
                                                                : 'bg-gray-50 border border-gray-200 text-gray-400'
                                                        }`}
                                                    >
                                                        {row.isBoarding ? 'Boarding' : 'Day'}
                                                    </button>
                                                </td>

                                                {/* ARREARS */}
                                                <td className="py-2 px-3">
                                                    <div className="relative">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₵</span>
                                                        <input
                                                            type="text"
                                                            value={row.arrears}
                                                            onChange={(e) => handleRowChange(row.id, 'arrears', e.target.value)}
                                                            className="w-full pl-5 pr-2.5 py-1.5 rounded-lg border border-gray-200 font-bold text-gray-800"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </td>

                                                {/* GUARDIAN DETAILS QUICK PANEL */}
                                                <td className="py-2 px-3 space-y-1">
                                                    <input
                                                        type="text"
                                                        value={row.guardianName}
                                                        onChange={(e) => handleRowChange(row.id, 'guardianName', e.target.value)}
                                                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 font-semibold text-gray-700 text-[10px]"
                                                        placeholder="Guardian Name"
                                                    />
                                                    <input
                                                        type="tel"
                                                        value={row.guardianPrimaryContact}
                                                        onChange={(e) => handleRowChange(row.id, 'guardianPrimaryContact', e.target.value)}
                                                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 font-semibold text-gray-700 text-[10px]"
                                                        placeholder="Primary Phone"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Actions Footer */}
                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                            <button
                                onClick={() => { setStep('upload'); setParsedRows([]); }}
                                className="btn-secondary px-5 py-3"
                                disabled={isSaving}
                            >
                                <i className="fas fa-arrow-left"></i> Re-upload File
                            </button>
                            
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="btn-secondary px-5 py-3"
                                    disabled={isSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRegisterLearners}
                                    disabled={isSaving || parsedRows.filter(r => r.selected && isRowValid(r) && !isRowDuplicate(r)).length === 0}
                                    className="btn-success px-8 py-3 shadow-lg shadow-emerald-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? (
                                        <><i className="fas fa-circle-notch fa-spin mr-2"></i> Registering...</>
                                    ) : (
                                        <><i className="fas fa-check-circle mr-2"></i> Register Learners ({
                                            parsedRows.filter(r => r.selected && isRowValid(r) && !isRowDuplicate(r)).length
                                        })</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
