
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb, type Subject } from '../../../eduDb';
import { useAuth } from '../../../hooks/useAuth';
import { showToast } from '../../Common/Toast';
import { showConfirm } from '../../Common/ConfirmDialog';
import { supabase } from '../../../supabaseClient';

const SubjectList: React.FC = () => {
    const { user } = useAuth();
    const [isAdding, setIsAdding] = useState(false);
    const [newSubject, setNewSubject] = useState({ name: '', code: '', category: 'General' });
    const [editingId, setEditingId] = useState<number | null>(null);

    const subjects = useLiveQuery(() =>
        user?.schoolId ? eduDb.subjects.where('schoolId').equals(user.schoolId).toArray() : []
        , [user?.schoolId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.schoolId) return;

        try {
            if (editingId) {
                await eduDb.subjects.update(editingId, {
                    ...newSubject,
                    updatedAt: Date.now(),
                    syncStatus: 'pending'
                });
                setEditingId(null);
            } else {
                const supabasePayload = {
                    school_id: user.schoolId,
                    name: newSubject.name.trim(),
                    code: newSubject.code.trim() || null,
                    category: newSubject.category,
                    is_deleted: false
                };

                // Online Supabase Insert FIRST
                const { data, error } = await supabase
                    .from('subjects')
                    .insert(supabasePayload)
                    .select('id')
                    .single();

                if (error) {
                    throw new Error(`Cloud Sync Error: ${error.message}`);
                }

                // Mirror to IndexedDB cache
                await eduDb.subjects.add({
                    schoolId: user.schoolId,
                    idCloud: data.id, // Canonical Cloud Identity
                    name: newSubject.name.trim(),
                    code: newSubject.code.trim(),
                    category: newSubject.category,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    syncStatus: 'synced'
                } as Subject);
            }
            showToast(editingId ? 'Subject updated successfully!' : 'Subject added successfully!', 'success');
            setNewSubject({ name: '', code: '', category: 'General' });
            setIsAdding(false);
        } catch (error) {
            console.error('Error saving subject:', error);
            showToast('Failed to save subject. Please try again.', 'error');
        }
    };

    // Clicking the card (or the edit icon) opens the inline form pre-filled
    const handleEdit = (subject: Subject) => {
        if (!subject.id) return;
        setNewSubject({ name: subject.name, code: subject.code || '', category: subject.category || 'General' });
        setEditingId(subject.id);
        setIsAdding(true);
        // Scroll the form into view on mobile
        setTimeout(() => {
            document.getElementById('subject-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    };

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        const confirmed = await showConfirm({
            title: 'Delete Subject',
            message: 'Are you sure you want to delete this subject? This cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Keep It',
            variant: 'danger',
        });
        if (confirmed) {
            await eduDb.subjects.delete(id);
            if (editingId === id) {
                setIsAdding(false);
                setEditingId(null);
                setNewSubject({ name: '', code: '', category: 'General' });
            }
            showToast('Subject deleted', 'info');
        }
    };

    const handleCancel = () => {
        setIsAdding(false);
        setEditingId(null);
        setNewSubject({ name: '', code: '', category: 'General' });
    };

    const categoryColors: Record<string, string> = {
        General: 'bg-gray-100 text-gray-600',
        Science: 'bg-green-100 text-green-700',
        Arts: 'bg-purple-100 text-purple-700',
        Commercial: 'bg-amber-100 text-amber-700',
        Languages: 'bg-pink-100 text-pink-700',
        Primary: 'bg-blue-100 text-blue-700',
        JHS: 'bg-indigo-100 text-indigo-700',
    };

    return (
        <div className="space-y-5">
            {/* ── Header ── */}
            <div className="flex flex-wrap gap-3 justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold text-gray-800">All Subjects</h3>
                    <p className="text-gray-400 text-sm mt-0.5">Tap a subject to edit it.</p>
                </div>
                {!isAdding && (
                    <button
                        onClick={() => { setIsAdding(true); setEditingId(null); setNewSubject({ name: '', code: '', category: 'General' }); }}
                        className="px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors flex items-center gap-2 text-sm"
                    >
                        <i className="fas fa-plus"></i> Add Subject
                    </button>
                )}
            </div>

            {/* ── Inline Edit / Create Form ── */}
            {isAdding && (
                <form id="subject-form" onSubmit={handleSubmit} className="bg-gray-50 p-5 sm:p-6 rounded-2xl border-2 border-primary/20 animate-fadeIn space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center">
                            <i className={`fas ${editingId ? 'fa-pen' : 'fa-plus'} text-primary text-xs`}></i>
                        </span>
                        <h4 className="font-black text-gray-700 text-sm uppercase tracking-widest">
                            {editingId ? 'Edit Subject' : 'New Subject'}
                        </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Name *</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. Mathematics"
                                value={newSubject.name}
                                onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm font-bold text-gray-700"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Code</label>
                            <input
                                type="text"
                                placeholder="e.g. MTH101 (optional)"
                                value={newSubject.code}
                                onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm font-bold text-gray-700"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Category</label>
                            <select
                                value={newSubject.category}
                                onChange={(e) => setNewSubject({ ...newSubject, category: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm font-bold text-gray-700"
                            >
                                <option value="General">General</option>
                                <option value="Science">Science</option>
                                <option value="Arts">Arts</option>
                                <option value="Commercial">Commercial</option>
                                <option value="Languages">Languages</option>
                                <option value="Primary">Primary</option>
                                <option value="JHS">JHS</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-1">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="w-full sm:w-auto px-6 py-2.5 bg-white text-gray-600 rounded-xl font-bold hover:bg-gray-100 border border-gray-200 transition-colors text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="w-full sm:w-auto px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-blue-600 shadow-md shadow-blue-100 transition-all text-sm"
                        >
                            <i className={`fas ${editingId ? 'fa-check' : 'fa-save'} mr-2`}></i>
                            {editingId ? 'Update Subject' : 'Save Subject'}
                        </button>
                    </div>
                </form>
            )}

            {/* ── Subject Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {subjects?.map(subject => {
                    const isBeingEdited = editingId === subject.id && isAdding;
                    return (
                        <div
                            key={subject.id}
                            onClick={() => handleEdit(subject)}
                            className={`relative bg-white p-4 rounded-2xl border-2 transition-all cursor-pointer group
                                ${isBeingEdited
                                    ? 'border-primary bg-blue-50/30 shadow-lg shadow-blue-100'
                                    : 'border-gray-100 hover:border-primary/30 hover:shadow-md'
                                }`}
                        >
                            {/* Edit hint label */}
                            <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0 pr-2">
                                    <h4 className={`font-bold truncate ${isBeingEdited ? 'text-primary' : 'text-gray-800'}`}>
                                        {subject.name}
                                    </h4>
                                    <div className="flex flex-wrap gap-2 text-xs font-bold mt-1.5">
                                        {subject.code && (
                                            <span className="text-gray-400 font-mono">{subject.code}</span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-lg ${categoryColors[subject.category || 'General'] || 'bg-gray-100 text-gray-600'}`}>
                                            {subject.category || 'General'}
                                        </span>
                                    </div>
                                </div>

                                {/* Action buttons — always visible, not hidden behind hover-only */}
                                <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => handleEdit(subject)}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors
                                            ${isBeingEdited
                                                ? 'bg-primary text-white'
                                                : 'bg-blue-50 text-blue-500 hover:bg-blue-100'
                                            }`}
                                        title="Edit"
                                    >
                                        <i className={`fas ${isBeingEdited ? 'fa-pen text-xs' : 'fa-edit text-xs'}`}></i>
                                    </button>
                                    <button
                                        onClick={(e) => subject.id && handleDelete(e, subject.id)}
                                        className="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors"
                                        title="Delete"
                                    >
                                        <i className="fas fa-trash-alt text-xs"></i>
                                    </button>
                                </div>
                            </div>

                            {/* "Tap to edit" micro-hint */}
                            {isBeingEdited && (
                                <div className="mt-2 text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1">
                                    <i className="fas fa-pen-to-square"></i> Editing above
                                </div>
                            )}
                        </div>
                    );
                })}

                {subjects?.length === 0 && (
                    <div className="col-span-full py-16 text-center text-gray-400">
                        <i className="fas fa-book text-5xl mb-4 block opacity-20"></i>
                        <p className="font-medium">No subjects yet. Add your first subject!</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SubjectList;
