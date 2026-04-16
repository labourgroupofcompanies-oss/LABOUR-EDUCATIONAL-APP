import React, { useState } from 'react';
import ContactModal from './Common/ContactModal';

interface LandingPageProps {
    onStart: () => void;
    onLogin: () => void;
}

const portals = [
    {
        role: 'Headteacher',
        icon: 'fa-user-tie',
        gradient: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
        glow: 'rgba(59,130,246,0.25)',
        accent: '#3b82f6',
        lightBg: '#eff6ff',
        lightBorder: '#bfdbfe',
        features: [
            { icon: 'fa-school', label: 'School Setup & Onboarding' },
            { icon: 'fa-id-badge', label: 'Staff Registration & Management' },
            { icon: 'fa-chalkboard', label: 'Class Creation & Teacher Assignment' },
            { icon: 'fa-book-open', label: 'Subject Setup & Allocation' },
            { icon: 'fa-user-graduate', label: 'Student Enrolment & Profiles' },
            { icon: 'fa-clipboard-check', label: 'Attendance Reports' },
            { icon: 'fa-star-half-alt', label: 'Results Approval' },
            { icon: 'fa-file-alt', label: 'Report Card Generation' },
            { icon: 'fa-cog', label: 'Academic Term & Year Settings' },
        ],
    },
    {
        role: 'Teacher',
        icon: 'fa-chalkboard-teacher',
        gradient: 'linear-gradient(135deg, #5b21b6 0%, #8b5cf6 100%)',
        glow: 'rgba(139,92,246,0.25)',
        accent: '#8b5cf6',
        lightBg: '#f5f3ff',
        lightBorder: '#ddd6fe',
        features: [
            { icon: 'fa-list-ul', label: 'View Assigned Classes & Subjects' },
            { icon: 'fa-user-check', label: 'Mark Daily Attendance' },
            { icon: 'fa-pencil-alt', label: 'Enter Student Scores' },
            { icon: 'fa-users', label: 'View Class Student List' },
            { icon: 'fa-key', label: 'Secure Password Management' },
        ],
    },
    {
        role: 'Accountant',
        icon: 'fa-calculator',
        gradient: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
        glow: 'rgba(16,185,129,0.25)',
        accent: '#10b981',
        lightBg: '#ecfdf5',
        lightBorder: '#a7f3d0',
        features: [
            { icon: 'fa-hand-holding-usd', label: 'Record School Fee Payments' },
            { icon: 'fa-search-dollar', label: 'Track Outstanding Balances' },
            { icon: 'fa-money-check-alt', label: 'Process Staff Payroll' },
            { icon: 'fa-receipt', label: 'Log & Manage Expenses' },
            { icon: 'fa-chart-line', label: 'Financial Reports & Summaries' },
        ],
    },
];

const LandingPage: React.FC<LandingPageProps> = ({ onStart, onLogin }) => {
    const [active, setActive] = useState(0);
    const [showContact, setShowContact] = useState(false);
    const p = portals[active];

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>

            {/* ── HERO ─────────────────────────────────────────────── */}
            <div style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)', padding: '56px 24px 64px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>

                {/* bg blobs */}
                <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '300px', height: '300px', borderRadius: '50%', background: 'rgba(99,102,241,0.15)', filter: 'blur(60px)' }} />
                <div style={{ position: 'absolute', bottom: '-40px', left: '-40px', width: '280px', height: '280px', borderRadius: '50%', background: 'rgba(59,130,246,0.12)', filter: 'blur(60px)' }} />

                {/* logo */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px', position: 'relative' }}>
                    <div style={{ width: '88px', height: '88px', borderRadius: '24px', background: '#fff', boxShadow: '0 16px 48px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
                        <img src="/images/labour_logo.png" alt="Labour Edu App" style={{ width: '70px', height: '70px', objectFit: 'contain' }} />
                    </div>
                </div>

                <h1 style={{ color: '#fff', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
                    Labour Edu <span style={{ color: '#93c5fd' }}>App</span>
                </h1>
                <p style={{ color: '#94a3b8', fontSize: '1rem', maxWidth: '480px', margin: '0 auto 32px', lineHeight: 1.7, fontWeight: 500 }}>
                    A complete school management system for headteachers, teachers, and accountants —
                    <span style={{ color: '#bfdbfe' }}> works even without internet.</span>
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                    <button
                        onClick={onStart}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '16px 38px', background: '#fff', color: '#1e40af', border: 'none', borderRadius: '16px', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 32px rgba(0,0,0,0.25)', transition: 'transform 0.15s, box-shadow 0.15s', position: 'relative' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 14px 40px rgba(0,0,0,0.3)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.25)'; }}
                    >
                        <i className="fas fa-rocket"></i>
                        Get Started
                        <i className="fas fa-chevron-right" style={{ fontSize: '0.75rem' }}></i>
                    </button>

                    <button
                        onClick={onLogin}
                        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
                    >
                        Login to Existing School
                    </button>

                    <button
                        onClick={() => setShowContact(true)}
                        style={{ marginTop: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 24px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.2)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
                    >
                        <i className="fas fa-headset mr-2"></i>
                        Contact Sales
                    </button>
                </div>
            </div>

            {/* ── PORTAL SECTION ───────────────────────────────────── */}
            <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 20px 64px' }}>

                <p style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '20px' }}>
                    Three Portals. One System.
                </p>

                {/* Tab switcher */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '32px', flexWrap: 'wrap' }}>
                    {portals.map((portal, i) => (
                        <button
                            key={i}
                            onClick={() => setActive(i)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                padding: '10px 22px',
                                borderRadius: '100px',
                                border: active === i ? 'none' : '2px solid #e2e8f0',
                                background: active === i ? portal.gradient : '#fff',
                                color: active === i ? '#fff' : '#64748b',
                                fontWeight: 700, fontSize: '0.88rem',
                                cursor: 'pointer',
                                boxShadow: active === i ? `0 6px 24px ${portal.glow}` : 'none',
                                transition: 'all 0.2s',
                            }}
                        >
                            <i className={`fas ${portal.icon}`}></i>
                            {portal.role}
                        </button>
                    ))}
                </div>

                {/* Active portal card */}
                <div style={{ background: '#fff', borderRadius: '28px', overflow: 'hidden', boxShadow: `0 8px 48px ${p.glow}, 0 2px 16px rgba(0,0,0,0.05)`, border: `1px solid ${p.lightBorder}`, transition: 'box-shadow 0.3s' }}>

                    {/* Card header */}
                    <div style={{ background: p.gradient, padding: '32px 36px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.25)' }}>
                            <i className={`fas ${p.icon}`} style={{ fontSize: '24px', color: '#fff' }}></i>
                        </div>
                        <div>
                            <h2 style={{ margin: 0, color: '#fff', fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.01em' }}>{p.role} Portal</h2>
                            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', fontWeight: 500 }}>
                                {p.features.length} features available
                            </p>
                        </div>
                    </div>

                    {/* Features list */}
                    <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                        {p.features.map((feat, j) => (
                            <div
                                key={j}
                                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '14px', background: p.lightBg, border: `1px solid ${p.lightBorder}` }}
                            >
                                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#fff', border: `1px solid ${p.lightBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 2px 8px ${p.glow}` }}>
                                    <i className={`fas ${feat.icon}`} style={{ fontSize: '14px', color: p.accent }}></i>
                                </div>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1e293b' }}>{feat.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── FOOTER ───────────────────────────────────────────── */}
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '20px 24px', textAlign: 'center', background: '#fff' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}>
                    <i className="fas fa-shield-alt" style={{ marginRight: '6px', color: '#6366f1' }}></i>
                    Data stored securely on your device &nbsp;·&nbsp; Labour Edu App © {new Date().getFullYear()}
                </p>
            </div>

            {showContact && <ContactModal onClose={() => setShowContact(false)} />}
        </div>
    );
};

export default LandingPage;
