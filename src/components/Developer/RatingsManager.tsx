import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { showToast } from '../Common/Toast';
import { showConfirm } from '../Common/ConfirmDialog';
import DeveloperModal from './DeveloperModal';

interface UserStory {
    id: string;
    full_name: string;
    position: string;
    school_name: string;
    quote: string;
    star_rating: number;
    avatar_initials: string;
    created_at: string;
}

const RatingsManager: React.FC = () => {
    const [stories, setStories] = useState<UserStory[]>([]);
    const [fetching, setFetching] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingStory, setEditingStory] = useState<UserStory | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        fetchStories();
    }, []);

    const fetchStories = async () => {
        setFetching(true);
        try {
            const { data, error } = await supabase
                .from('user_stories')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setStories(data || []);
        } catch (err) {
            console.error('Failed to fetch user stories:', err);
            showToast('Failed to load user ratings', 'error');
        } finally {
            setFetching(false);
        }
    };

    const handleDelete = async (roleId: string) => {
        const confirmed = await showConfirm({
            title: 'Delete Narrative',
            message: 'Are you sure you want to permanently delete this user story? It will be removed from all marketing materials and the global showcase.',
            confirmText: 'Delete Permanently',
            variant: 'danger'
        });
        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('user_stories')
                .delete()
                .eq('id', roleId);

            if (error) throw error;
            showToast('Rating deleted successfully', 'success');
            setStories(prev => prev.filter(s => s.id !== roleId));
        } catch (err) {
            console.error('Failed to delete story:', err);
            showToast('Delete failed', 'error');
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingStory) return;

        setIsUpdating(true);
        try {
            const { error } = await supabase
                .from('user_stories')
                .update({
                    full_name: editingStory.full_name,
                    position: editingStory.position,
                    school_name: editingStory.school_name,
                    quote: editingStory.quote,
                    star_rating: editingStory.star_rating
                })
                .eq('id', editingStory.id);

            if (error) throw error;

            showToast('Rating updated successfully', 'success');
            setStories(prev => prev.map(s => s.id === editingStory.id ? editingStory : s));
            setEditingStory(null);
        } catch (err) {
            console.error('Failed to update story:', err);
            showToast('Update failed', 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    const filteredStories = stories.filter(s => 
        s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.school_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.quote.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const averageRating = stories.length > 0 
        ? (stories.reduce((acc, s) => acc + s.star_rating, 0) / stories.length).toFixed(1)
        : '0.0';

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Stats & Search Header */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex flex-col justify-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Global Sentiment</p>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-black text-slate-800">{averageRating}</span>
                        <div className="flex mb-1.5 text-yellow-400 text-sm">
                            <i className="fas fa-star"></i>
                            <i className="fas fa-star"></i>
                            <i className="fas fa-star"></i>
                            <i className="fas fa-star"></i>
                            <i className="fas fa-star-half-alt"></i>
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tight">Based on {stories.length} stories</p>
                </div>

                <div className="lg:col-span-3 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-slate-200">
                        <i className="fas fa-search"></i>
                    </div>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search by name, school, or content..."
                        className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700 placeholder:text-slate-300 text-lg"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="text-slate-300 hover:text-slate-500 transition-all font-bold uppercase text-[10px] tracking-widest">Clear</button>
                    )}
                </div>
            </div>

            {/* List View */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {fetching ? (
                    [1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-64 bg-white rounded-[2.5rem] animate-pulse"></div>
                    ))
                ) : filteredStories.length === 0 ? (
                    <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100">
                        <i className="fas fa-star-half-alt text-4xl text-slate-100 mb-4"></i>
                        <p className="text-slate-300 font-black uppercase tracking-widest text-sm">No matching user stories found</p>
                    </div>
                ) : (
                    filteredStories.map(story => (
                        <div key={story.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-8 flex flex-col relative group overflow-hidden transition-all hover:border-blue-200">
                            {/* Star badge */}
                            <div className="absolute top-8 right-8 flex items-center gap-1.5 px-3 py-1 bg-indigo-50 rounded-full text-indigo-600">
                                <span className="text-xs font-black">{story.star_rating}</span>
                                <i className="fas fa-star text-[10px]"></i>
                            </div>

                            {/* Header */}
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-black shadow-xl shrink-0">
                                    {story.avatar_initials}
                                </div>
                                <div className="min-w-0">
                                    <h5 className="text-lg font-black text-slate-800 truncate">{story.full_name}</h5>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{story.position}</p>
                                </div>
                            </div>

                            {/* School Info */}
                            <div className="mb-4 flex items-center gap-2 text-indigo-500">
                                <i className="fas fa-university text-xs"></i>
                                <span className="text-[11px] font-black uppercase tracking-tighter">{story.school_name}</span>
                            </div>

                            {/* Quote */}
                            <div className="flex-1 relative">
                                <i className="fas fa-quote-left absolute -top-2 -left-2 text-slate-100 text-3xl z-0"></i>
                                <p className="text-slate-600 font-medium text-sm leading-relaxed relative z-10 line-clamp-4 italic">
                                    "{story.quote}"
                                </p>
                            </div>

                            {/* Actions Overlay */}
                            <div className="mt-8 flex gap-3">
                                <button 
                                    onClick={() => setEditingStory(story)}
                                    className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold text-xs hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-edit"></i> Edit
                                </button>
                                <button 
                                    onClick={() => handleDelete(story.id)}
                                    className="flex-1 py-3 bg-red-50 text-red-400 rounded-xl font-bold text-xs hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-trash-alt"></i> Delete
                                </button>
                            </div>

                            {/* Date Badge */}
                            <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center text-[9px] text-slate-300 font-bold uppercase tracking-widest">
                                <span>Ref: {story.id.split('-')[0]}</span>
                                <span>{new Date(story.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Edit Modal */}
            <DeveloperModal
                isOpen={!!editingStory}
                onClose={() => setEditingStory(null)}
                title="Curation Forge"
                subtitle="Refining User Experience Story"
                icon="fa-star"
                iconBg="bg-indigo-600"
                width="max-w-xl"
            >
                {editingStory && (
                    <form onSubmit={handleUpdate} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                                <input 
                                    type="text"
                                    required
                                    value={editingStory.full_name}
                                    onChange={e => setEditingStory({...editingStory, full_name: e.target.value})}
                                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Position</label>
                                <input 
                                    type="text"
                                    required
                                    value={editingStory.position}
                                    onChange={e => setEditingStory({...editingStory, position: e.target.value})}
                                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">School Name</label>
                                <input 
                                    type="text"
                                    required
                                    value={editingStory.school_name}
                                    onChange={e => setEditingStory({...editingStory, school_name: e.target.value})}
                                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Star Rating (1-5)</label>
                                <input 
                                    type="number"
                                    required
                                    min="1"
                                    max="5"
                                    value={editingStory.star_rating}
                                    onChange={e => setEditingStory({...editingStory, star_rating: parseInt(e.target.value)})}
                                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">The Story (Quote)</label>
                            <textarea 
                                required
                                rows={4}
                                value={editingStory.quote}
                                onChange={e => setEditingStory({...editingStory, quote: e.target.value})}
                                className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 font-medium text-slate-700 outline-none focus:border-indigo-500 transition-all resize-none shadow-inner"
                            />
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button 
                                type="button" 
                                onClick={() => setEditingStory(null)}
                                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                disabled={isUpdating}
                                className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3"
                            >
                                {isUpdating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-double"></i>}
                                {isUpdating ? 'Sealing Changes...' : 'Save Refined Story'}
                            </button>
                        </div>
                    </form>
                )}
            </DeveloperModal>
        </div>
    );
};

export default RatingsManager;
