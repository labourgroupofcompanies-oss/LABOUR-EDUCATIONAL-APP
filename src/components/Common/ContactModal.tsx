import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../db';
import { showToast } from './Toast';

interface ContactModalProps {
    onClose: () => void;
}

const ContactModal: React.FC<ContactModalProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [schoolName, setSchoolName] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Context-aware initialization
    useEffect(() => {
        if (user) {
            setFullName(user.fullName || '');
            setEmail(user.email || '');
            
            // Try to fetch school name if user has schoolId
            if (user.schoolId) {
                db.schools.where('schoolId').equals(user.schoolId).first().then(school => {
                    if (school) setSchoolName(school.schoolName || '');
                });
            }
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const cleanName = fullName.trim();
        const cleanEmail = email.trim();
        const cleanMsg = message.trim();

        if (!cleanName || !cleanEmail || !cleanMsg) {
            showToast('Please fill in all required fields.', 'warning');
            return;
        }

        setSubmitting(true);

        try {
            // Create a timeout controller to prevent infinite "loading" if network hangs
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const { error } = await supabase
                .from('customer_enquiries')
                .insert({
                    full_name: cleanName,
                    email: cleanEmail,
                    phone: phone.trim(),
                    school_name: schoolName.trim(),
                    message: cleanMsg,
                })
                .abortSignal(controller.signal);

            clearTimeout(timeoutId);

            if (error) {
                console.error('[ContactModal] Supabase error:', error);
                throw new Error(error.message || 'Server rejected the request');
            }

            setSubmitted(true);
            showToast('Enquiry sent successfully!', 'success');
            setTimeout(onClose, 3000);
        } catch (err: any) {
            console.error('Submission error:', err);
            
            let userMsg = 'Failed to send enquiry. Please try again.';
            if (err.name === 'AbortError') {
                userMsg = 'Request timed out. Please check your internet connection.';
            } else if (err.message) {
                userMsg = `Submission failed: ${err.message}`;
            }
            
            showToast(userMsg, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-6 bg-slate-900/40 backdrop-blur-sm animate-fadeIn overflow-y-auto"
            onClick={onClose}
        >
            <div 
                className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-scaleIn my-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-600 px-10 py-12 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/20 rounded-full translate-x-1/2 translate-y-1/2 blur-xl"></div>
                    
                    <button 
                        onClick={onClose}
                        className="btn-icon absolute top-6 right-6 !bg-white/10 !text-white hover:!bg-white/20"
                    >
                        <i className="fas fa-times"></i>
                    </button>

                    <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/30 shadow-xl">
                        <i className={`fas ${user ? 'fa-comment-alt' : 'fa-paper-plane'} text-2xl text-white`}></i>
                    </div>
                    
                    <h2 className="text-3xl font-black text-white tracking-tight">
                        {user ? 'Help & Support' : 'Partner with Us'}
                    </h2>
                    <p className="text-indigo-100/80 text-sm font-medium mt-2 max-w-xs mx-auto">
                        {user 
                            ? 'Send a message directly to the Labour Edu Support Team. We\'ll get back to you as soon as possible.'
                            : 'Transform your school with the most advanced offline-first management system.'
                        }
                    </p>
                </div>

                {/* Content */}
                <div className="p-10">
                    {!submitted ? (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                                    <input 
                                        type="text" 
                                        required 
                                        value={fullName}
                                        onChange={e => setFullName(e.target.value)}
                                        placeholder="John Doe"
                                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                                    <input 
                                        type="email" 
                                        required 
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="john@school.edu"
                                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                                    <input 
                                        type="tel" 
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        placeholder="+233..."
                                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">School Name</label>
                                    <input 
                                        type="text" 
                                        value={schoolName}
                                        onChange={e => setSchoolName(e.target.value)}
                                        placeholder="Labour Academy"
                                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Your Message</label>
                                <textarea 
                                    required 
                                    rows={3}
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder={user ? "Describe your question, issue, or request in detail..." : "How can we help your school grow?"}
                                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:border-indigo-500 outline-none font-medium text-slate-700 transition-all placeholder:text-slate-300 resize-none"
                                />
                            </div>

                            <button 
                                type="submit"
                                disabled={submitting}
                                className="btn-primary w-full py-5 !text-xs shadow-slate-200"
                            >
                                {submitting ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${user ? 'fa-paper-plane' : 'fa-bolt'}`}></i>}
                                {submitting ? 'Transmitting Enquiry...' : (user ? 'Submit Support Request' : 'Send Enquiry')}
                            </button>
                        </form>
                    ) : (
                        <div className="py-10 text-center space-y-6 animate-fadeIn">
                            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                                <i className="fas fa-check text-3xl"></i>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                                    {user ? 'Message Sent!' : 'Message Received!'}
                                </h3>
                                <p className="text-slate-400 font-medium mt-2">
                                    {user 
                                        ? 'Your message has been received by the Labour Edu Support Team. We will review it and respond as soon as possible.'
                                        : 'Our school onboarding team will reach out to you within 24 hours. Check your email for a response.'
                                    }
                                </p>
                            </div>
                            <button 
                                onClick={onClose}
                                className="btn-secondary px-8 py-3 !rounded-xl !text-[11px]"
                            >
                                Dismiss
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ContactModal;
