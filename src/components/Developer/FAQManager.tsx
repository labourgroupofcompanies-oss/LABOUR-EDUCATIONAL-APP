import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { showToast } from '../Common/Toast';
import { showConfirm } from '../Common/ConfirmDialog';

interface FAQ {
    id: string;
    question: string;
    answer: string;
    display_order: number;
    created_at: string;
}

const FAQManager: React.FC = () => {
    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [displayOrder, setDisplayOrder] = useState<number>(0);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        fetchFAQs();
    }, []);

    const fetchFAQs = async () => {
        setFetching(true);
        try {
            const { data, error } = await supabase
                .from('faqs')
                .select('*')
                .order('display_order', { ascending: true })
                .order('created_at', { ascending: false });

            if (error) throw error;
            setFaqs(data || []);
        } catch (err) {
            console.error('Failed to fetch FAQs:', err);
            showToast('Failed to fetch FAQs', 'error');
        } finally {
            setFetching(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim() || !answer.trim()) {
            showToast('Question and Answer are required', 'error');
            return;
        }

        setLoading(true);
        try {
            if (editingId) {
                const { error } = await supabase
                    .from('faqs')
                    .update({ question, answer, display_order: displayOrder })
                    .eq('id', editingId);
                if (error) throw error;
                showToast('FAQ updated successfully', 'success');
            } else {
                const { error } = await supabase
                    .from('faqs')
                    .insert([{ question, answer, display_order: displayOrder }]);
                if (error) throw error;
                showToast('FAQ added successfully', 'success');
            }

            setQuestion('');
            setAnswer('');
            setDisplayOrder(0);
            setEditingId(null);
            fetchFAQs();
        } catch (err) {
            console.error('Failed to save FAQ:', err);
            showToast('Failed to save FAQ', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (faq: FAQ) => {
        setQuestion(faq.question);
        setAnswer(faq.answer);
        setDisplayOrder(faq.display_order);
        setEditingId(faq.id);
        // Scroll to form on mobile
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        const confirmed = await showConfirm({
            title: 'Delete FAQ',
            message: 'Are you sure you want to permanently delete this FAQ? This action cannot be undone.',
            confirmText: 'Delete FAQ',
            variant: 'danger'
        });
        if (!confirmed) return;
        
        try {
            const { error } = await supabase
                .from('faqs')
                .delete()
                .eq('id', id);

            if (error) throw error;
            showToast('FAQ deleted', 'success');
            fetchFAQs();
        } catch (err) {
            console.error('Failed to delete FAQ:', err);
            showToast('Failed to delete FAQ', 'error');
        }
    };

    const cancelEdit = () => {
        setQuestion('');
        setAnswer('');
        setDisplayOrder(0);
        setEditingId(null);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10 animate-fadeIn">
            {/* Form Section */}
            <div className="bg-white rounded-[2rem] lg:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-10 h-fit space-y-6 lg:space-y-8 lg:sticky lg:top-24">
                <div>
                    <h4 className="text-lg lg:text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <i className={`fas ${editingId ? 'fa-edit' : 'fa-plus-circle'} text-blue-500`}></i>
                        {editingId ? 'Edit FAQ' : 'Create FAQ'}
                    </h4>
                    <p className="text-slate-400 font-medium text-[10px] lg:text-xs mt-1 uppercase tracking-widest">
                        {editingId ? 'Update existing question' : 'Add a new question to the system'}
                    </p>
                </div>

                <form onSubmit={handleSave} className="space-y-5 lg:space-y-6">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Question</label>
                        <input
                            required
                            type="text"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="e.g. How do I reset my password?"
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 text-sm"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Answer</label>
                        <textarea
                            required
                            rows={6}
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder="Type the answer here..."
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 resize-none text-sm"
                        ></textarea>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-center">Display Order</label>
                        <input
                            type="number"
                            value={displayOrder}
                            onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 text-sm"
                        />
                        <p className="text-[9px] text-slate-400 font-medium ml-1">Lower numbers appear first.</p>
                    </div>

                    <div className="flex gap-3">
                        {editingId && (
                            <button
                                type="button"
                                onClick={cancelEdit}
                                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all active:scale-95 text-sm"
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className={`py-4 lg:py-5 bg-slate-900 text-white rounded-2xl font-black hover:bg-black transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-slate-900/10 text-sm ${editingId ? 'flex-[2]' : 'w-full'}`}
                        >
                            {loading ? (editingId ? 'Updating...' : 'Adding...') : (editingId ? 'Update FAQ' : 'Add FAQ')}
                        </button>
                    </div>
                </form>
            </div>

            {/* List Section */}
            <div className="lg:col-span-2 space-y-4 lg:space-y-6">
                <div className="flex justify-between items-center mb-2 lg:mb-4 px-2 lg:px-4">
                    <h4 className="text-lg lg:text-xl font-black text-slate-800 tracking-tight">System FAQs</h4>
                    <button onClick={fetchFAQs} className="text-[10px] font-bold text-blue-500 uppercase tracking-widest hover:text-blue-600 transition-all">Refresh List</button>
                </div>

                {fetching ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-[2rem] animate-pulse"></div>)}
                    </div>
                ) : faqs.length === 0 ? (
                    <div className="p-16 lg:p-20 text-center bg-white rounded-[2rem] lg:rounded-[2.5rem] border-2 border-dashed border-slate-100">
                        <i className="fas fa-question-circle text-3xl lg:text-4xl text-slate-100 mb-4"></i>
                        <p className="text-slate-300 font-bold uppercase tracking-widest text-[10px] lg:text-xs">No FAQs found</p>
                    </div>
                ) : (
                    faqs.map((faq) => (
                        <div key={faq.id} className="p-6 lg:p-8 rounded-[2rem] lg:rounded-[2.5rem] bg-white border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden transition-all hover:border-blue-100">
                            <div className="flex justify-between items-start gap-4 mb-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs">
                                            {faq.display_order}
                                        </span>
                                        <h5 className="text-base lg:text-lg font-black text-slate-800 leading-tight">{faq.question}</h5>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Created: {new Date(faq.created_at).toLocaleDateString()}</p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleEdit(faq)}
                                        className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-blue-50 hover:text-blue-500 transition-all"
                                        title="Edit FAQ"
                                    >
                                        <i className="fas fa-pencil-alt text-xs"></i>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(faq.id)}
                                        className="w-10 h-10 bg-red-50 text-red-400 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                        title="Delete FAQ"
                                    >
                                        <i className="fas fa-trash-alt text-xs"></i>
                                    </button>
                                </div>
                            </div>

                            <p className="text-slate-600 font-medium text-sm lg:text-base leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-slate-50 whitespace-pre-wrap">
                                {faq.answer}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default FAQManager;
