// src/components/Headteacher/StaffRegistrationForm.tsx
//
// A clean, self-contained staff registration form.
// Calls the `create-staff-user` Supabase Edge Function directly.
// No local DB writes — Supabase is the single source of truth.

import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { staffService, type StaffFormData } from '../../services/staffService';

// ── Types ─────────────────────────────────────────────────────────────────────
type Status =
    | { type: 'idle' }
    | { type: 'loading' }
    | { type: 'success'; name: string; username: string }
    | { type: 'error'; message: string };

const EMPTY_FORM: StaffFormData = {
    school_id: '',
    full_name: '',
    gender: 'Male',
    phone: '',
    email: '',
    qualification: '',
    specialization: '',
    role: 'staff',
    username: '',
    password: '',
    address: '',
};

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
    /** The school_id of the headteacher's school — pre-filled & locked */
    schoolId: string;
    /** Optional callback fired after a successful registration */
    onSuccess?: (staffName: string) => void;
}

const StaffRegistrationForm: React.FC<Props> = ({ schoolId, onSuccess }) => {
    const [form, setForm] = useState<StaffFormData>({ ...EMPTY_FORM, school_id: schoolId });
    const [status, setStatus] = useState<Status>({ type: 'idle' });
    const [showPw, setShowPw] = useState(false);

    const set = (field: keyof StaffFormData) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setForm(prev => ({ ...prev, [field]: e.target.value }));

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('[StaffRegistrationForm] Starting handleSubmit...');
        setStatus({ type: 'loading' });
        
        const safetyTimeout = setTimeout(() => {
            setStatus({ type: 'idle' });
            console.warn('[StaffRegistrationForm] Submit timed out (90s fallback).');
        }, 90000);

        try {
            // Get the caller's JWT
            console.log('[StaffRegistrationForm] Fetching session...');
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
                setStatus({ type: 'error', message: 'Session expired. Please log out and back in.' });
                return;
            }

            // Call the Edge Function via the service
            // NOTE: staffService.createStaff only takes the form data as its internal implementation 
            // already retrieves the session. Passing extras is unnecessary but we ensure the form is correct.
            console.log('[StaffRegistrationForm] Calling staffService.createStaff...');
            const result = await staffService.createStaff(form);
            console.log('[StaffRegistrationForm] createStaff result received:', result);

            setStatus({
                type: 'success',
                name: result.staff.full_name,
                username: result.staff.username,
            });

            // Reset form (keep school_id locked in)
            setForm({ ...EMPTY_FORM, school_id: schoolId });
            onSuccess?.(result.staff.full_name);

        } catch (err: any) {
            console.error('[StaffRegistrationForm] Error caught in handleSubmit:', err);
            const message = err?.message || 'An unexpected error occurred.';
            setStatus({ type: 'error', message });
        } finally {
            clearTimeout(safetyTimeout);
            // We only clear loading if we're not in the success state or error state?
            // Actually, success/error state replaces loading anyway by setting status.
        }
    };

    const handleDismiss = () => setStatus({ type: 'idle' });

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="staff-reg-wrapper">

            {/* ── Status Banner ─────────────────────────────────────────────── */}
            {status.type === 'success' && (
                <div className="banner banner--success" role="alert">
                    <div className="banner__icon">✅</div>
                    <div className="banner__body">
                        <strong>{status.name}</strong> has been registered successfully.
                        <br />
                        <span className="banner__sub">Username: <code>{status.username}</code></span>
                    </div>
                    <button className="banner__close" onClick={handleDismiss} aria-label="Dismiss">✕</button>
                </div>
            )}

            {status.type === 'error' && (
                <div className="banner banner--error" role="alert">
                    <div className="banner__icon">⚠️</div>
                    <div className="banner__body">{status.message}</div>
                    <button className="banner__close" onClick={handleDismiss} aria-label="Dismiss">✕</button>
                </div>
            )}

            {/* ── Form ──────────────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="reg-form" noValidate>
                <div className="reg-form__header">
                    <h2 className="reg-form__title">Register New Staff</h2>
                    <p className="reg-form__subtitle">All fields marked <span className="required-star">*</span> are required</p>
                </div>

                <div className="reg-form__grid">

                    {/* School ID — read-only, locked to headteacher's school */}
                    <div className="field field--full">
                        <label className="field__label">School ID <span className="required-star">*</span></label>
                        <input
                            className="field__input field__input--locked"
                            type="text"
                            value={form.school_id}
                            readOnly
                            title="Automatically set to your school"
                        />
                        <span className="field__hint">Locked to your school</span>
                    </div>

                    {/* Full Name */}
                    <div className="field field--half">
                        <label className="field__label" htmlFor="full_name">Full Name <span className="required-star">*</span></label>
                        <input
                            id="full_name"
                            className="field__input"
                            type="text"
                            value={form.full_name}
                            onChange={set('full_name')}
                            placeholder="e.g. Ama Serwaa Owusu"
                            required
                            autoComplete="name"
                        />
                    </div>

                    {/* Gender */}
                    <div className="field field--half">
                        <label className="field__label" htmlFor="gender">Gender <span className="required-star">*</span></label>
                        <select id="gender" className="field__input" value={form.gender} onChange={set('gender')} required>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {/* Phone */}
                    <div className="field field--half">
                        <label className="field__label" htmlFor="phone">Phone Number</label>
                        <input
                            id="phone"
                            className="field__input"
                            type="tel"
                            value={form.phone}
                            onChange={set('phone')}
                            placeholder="+233 24 000 0000"
                            autoComplete="tel"
                        />
                    </div>

                    {/* Email */}
                    <div className="field field--half">
                        <label className="field__label" htmlFor="email">Email Address</label>
                        <input
                            id="email"
                            className="field__input"
                            type="email"
                            value={form.email}
                            onChange={set('email')}
                            placeholder="ama@example.com"
                            autoComplete="email"
                        />
                        <span className="field__hint">Used for contact only — not for login</span>
                    </div>

                    {/* Qualification */}
                    <div className="field field--half">
                        <label className="field__label" htmlFor="qualification">Qualification</label>
                        <input
                            id="qualification"
                            className="field__input"
                            type="text"
                            value={form.qualification}
                            onChange={set('qualification')}
                            placeholder="e.g. B.Ed Education"
                        />
                    </div>

                    {/* Specialization */}
                    <div className="field field--half">
                        <label className="field__label" htmlFor="specialization">Specialization</label>
                        <input
                            id="specialization"
                            className="field__input"
                            type="text"
                            value={form.specialization}
                            onChange={set('specialization')}
                            placeholder="e.g. Mathematics"
                        />
                    </div>

                    {/* System Role */}
                    <div className="field field--half">
                        <label className="field__label" htmlFor="role">System Role <span className="required-star">*</span></label>
                        <select id="role" className="field__input" value={form.role} onChange={set('role')} required>
                            <option value="staff">Staff (Teacher / General)</option>
                            <option value="headteacher">Headteacher</option>
                        </select>
                    </div>

                    {/* Username */}
                    <div className="field field--half">
                        <label className="field__label" htmlFor="username">Username <span className="required-star">*</span></label>
                        <input
                            id="username"
                            className="field__input field__input--mono"
                            type="text"
                            value={form.username}
                            onChange={set('username')}
                            placeholder="aserwaa"
                            required
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <span className="field__hint">Used at login — unique within this school</span>
                    </div>

                    {/* Password */}
                    <div className="field field--half">
                        <label className="field__label" htmlFor="password">Password <span className="required-star">*</span></label>
                        <div className="field__pw-wrap">
                            <input
                                id="password"
                                className="field__input field__input--mono"
                                type={showPw ? 'text' : 'password'}
                                value={form.password}
                                onChange={set('password')}
                                placeholder="Min. 8 characters"
                                required
                                minLength={8}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="field__pw-toggle"
                                onClick={() => setShowPw(v => !v)}
                                aria-label={showPw ? 'Hide password' : 'Show password'}
                            >
                                {showPw ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>

                    {/* Residential Address */}
                    <div className="field field--full">
                        <label className="field__label" htmlFor="address">Residential Address</label>
                        <textarea
                            id="address"
                            className="field__input field__input--textarea"
                            value={form.address}
                            onChange={set('address')}
                            placeholder="House number, Street, City..."
                            rows={3}
                        />
                    </div>

                </div>{/* end grid */}

                {/* ── Submit Button ─────────────────────────────────────────────── */}
                <div className="reg-form__footer">
                    <button
                        type="submit"
                        className="reg-form__submit"
                        disabled={status.type === 'loading'}
                    >
                        {status.type === 'loading' ? (
                            <><span className="spinner" aria-hidden="true" /> Registering…</>
                        ) : (
                            <>➕ Register Staff Member</>
                        )}
                    </button>
                </div>
            </form>

            {/* ── Scoped Styles ─────────────────────────────────────────────── */}
            <style>{`
        /* Wrapper */
        .staff-reg-wrapper {
          width: 100%;
          max-width: 720px;
          margin: 0 auto;
          font-family: 'Inter', system-ui, sans-serif;
        }

        /* Banners */
        .banner {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          margin-bottom: 20px;
          font-size: 14px;
          line-height: 1.5;
        }
        .banner--success { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; }
        .banner--error   { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
        .banner__icon    { font-size: 18px; flex-shrink: 0; }
        .banner__body    { flex: 1; }
        .banner__sub     { font-size: 12px; opacity: .8; }
        .banner__close   { background: none; border: none; cursor: pointer; font-size: 16px; opacity: .6; padding: 0 4px; flex-shrink: 0; }
        .banner__close:hover { opacity: 1; }

        /* Form card */
        .reg-form {
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 4px 24px rgba(0,0,0,.07);
          overflow: hidden;
        }
        .reg-form__header {
          background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);
          padding: 24px 24px 20px;
        }
        .reg-form__title {
          font-size: 20px;
          font-weight: 800;
          color: #fff;
          margin: 0 0 4px;
        }
        .reg-form__subtitle {
          font-size: 13px;
          color: rgba(255,255,255,.75);
          margin: 0;
        }
        .required-star { color: #fbbf24; }

        /* Grid */
        .reg-form__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          padding: 24px;
        }
        @media (max-width: 560px) {
          .reg-form__grid { grid-template-columns: 1fr; }
          .field--half, .field--full { grid-column: 1 / -1; }
        }

        /* Fields */
        .field { display: flex; flex-direction: column; gap: 5px; }
        .field--half { grid-column: span 1; }
        .field--full { grid-column: 1 / -1; }
        .field__label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: #6b7280;
        }
        .field__input {
          padding: 11px 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          color: #1f2937;
          background: #f9fafb;
          transition: border-color .15s, box-shadow .15s, background .15s;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          appearance: auto;
        }
        .field__input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59,130,246,.15);
          background: #fff;
        }
        .field__input--locked {
          background: #f3f4f6;
          color: #9ca3af;
          cursor: not-allowed;
          font-family: monospace;
          font-size: 12px;
        }
        .field__input--mono { font-family: 'Courier New', monospace; letter-spacing: .02em; }
        .field__input--textarea { resize: vertical; min-height: 80px; }
        .field__hint {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 2px;
        }

        /* Password toggle */
        .field__pw-wrap { position: relative; }
        .field__pw-wrap .field__input { padding-right: 44px; }
        .field__pw-toggle {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          padding: 4px;
        }

        /* Footer / Submit */
        .reg-form__footer {
          padding: 0 24px 24px;
        }
        .reg-form__submit {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          letter-spacing: .03em;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: opacity .2s, transform .1s;
          box-shadow: 0 4px 14px rgba(59,130,246,.4);
        }
        .reg-form__submit:hover:not(:disabled) { opacity: .92; transform: translateY(-1px); }
        .reg-form__submit:active:not(:disabled) { transform: translateY(0); }
        .reg-form__submit:disabled { opacity: .65; cursor: not-allowed; }

        /* Spinner */
        .spinner {
          display: inline-block;
          width: 16px; height: 16px;
          border: 2.5px solid rgba(255,255,255,.4);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin .7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
};

export default StaffRegistrationForm;
