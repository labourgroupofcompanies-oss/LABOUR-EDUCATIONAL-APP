import React from 'react';
import { normalizeArray } from '../../../utils/dataSafety';

export interface ReportConfig {
    themeColor: string;
    showFees: boolean;
    showAttendance: boolean;
    showGradingKey: boolean;
    templateVariant: 'modern' | 'classic';
}

export interface ReportSubjectRow {
    subjectName: string;
    caTotal: number;
    examScore: number;
    totalScore: number;
    grade: string;
    remarks: string;
}

export interface ReportCardData {
    // School
    schoolName: string;
    schoolLogo?: string; // data URL
    motto?: string | null;
    district: string;
    region: string;
    schoolType: string;

    // Term / Year
    term: string;
    year: number;

    // Student
    studentName: string;
    studentId: string;
    className: string;
    studentPhoto?: string; // data URL

    // Academic
    subjects: ReportSubjectRow[];
    totalScoreSum: number;
    position?: number;
    totalStudents?: number;
    overallGrade?: string;
    overallRemarks?: string;

    // Staff
    headteacherName: string;
    classTeacherName: string;
    nextTermStarts?: string;
    vacationDate?: string;

    // Attendance
    attendance?: {
        present: number;
        late: number;
        absent: number;
        total: number;
        percentage: number;
    };

    // Financial
    feeInfo?: {
        feeDue: number;
        feePaid: number;
        feeBalance: number; // negative = overpaid/credit
        status: 'Paid' | 'Partial' | 'Unpaid' | 'Overpaid';
        lastPaymentMethod?: string;
    };

    // Promotion
    promotionStatus?: string;

    // Customization
    config?: ReportConfig;
}

interface Props {
    data: ReportCardData;
    isLastCard?: boolean;
}

const gradeColor = (grade: string) => {
    const g = grade?.toUpperCase();
    if (g === 'A' || g === 'A+') return '#15803d'; // Deep emerald
    if (g === 'A-') return '#166534';
    if (g === 'B' || g === 'B+') return '#1d4ed8'; // Deep blue
    if (g === 'B-') return '#1e40af';
    if (g === 'C' || g === 'C+') return '#b45309'; // Formal amber
    if (g === 'C-') return '#92400e';
    if (g === 'D') return '#c2410c';
    return '#be123c'; // Deep crimson
};

const ReportCardTemplate: React.FC<Props> = ({ data, isLastCard: _isLastCard }) => {
    const subjects = normalizeArray<ReportSubjectRow>(data.subjects);
    const maxTotal = subjects.length * 100;
    const percentage = maxTotal > 0 ? Math.round((data.totalScoreSum / maxTotal) * 100).toString() : '0';
    const MIN_SUBJECT_ROWS = 12; // Ensure table always has at least this many rows for stability

    // Default configuration
    const config = data.config || {
        themeColor: '#2563eb', // Default blue
        showFees: true,
        showAttendance: true,
        showGradingKey: true,
        templateVariant: 'modern',
    };

    const isClassic = config.templateVariant === 'classic';

    const PAPER_BG = '#fdfbf7'; // Parchment/Ivory
    const PRIMARY_TEXT = '#1e293b'; // Deep Slate
    const ACCENT_COLOR = config.themeColor;
    const BORDER_COLOR = isClassic ? PRIMARY_TEXT : '#475569'; // Classic uses dark, rigid outlines


    return (
        <div
            style={{
                width: '210mm',
                minHeight: '297mm',
                margin: '0 auto',
                padding: '8mm 12mm',
                fontFamily: "'Inter', 'Segoe UI', sans-serif",
                fontSize: '10pt',
                color: PRIMARY_TEXT,
                backgroundColor: '#fff', // Pure white outer
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'visible',
                position: 'relative',
            }}
            className="report-card-page"
        >
            {/* ── Outer Decorative Border ── */}
            <div style={{
                border: `1px solid ${BORDER_COLOR}`,
                padding: '1.5mm',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                background: PAPER_BG,
                boxShadow: '0 0 0 0.5mm #fdfbf7 inset, 0 0 0 0.7mm #94a3b8 inset',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* ── Background Watermark ── */}
                {!isClassic && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-30deg)',
                        opacity: 0.035,
                        fontSize: '120pt',
                        fontWeight: 900,
                        color: PRIMARY_TEXT,
                        pointerEvents: 'none',
                        textAlign: 'center',
                        width: '100%',
                        zIndex: 0,
                        userSelect: 'none',
                    }}>
                        {data.schoolName.split(' ')[0]}
                    </div>
                )}

                {/* ── HEADER ── */}
                <div style={{
                    padding: isClassic ? '20px' : '12px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                    borderBottom: isClassic ? `3px solid ${PRIMARY_TEXT}` : `2.5px double ${ACCENT_COLOR}`,
                    position: 'relative',
                    zIndex: 1,
                }}>
                    {/* Logo */}
                    <div style={{
                        width: '72px', height: '72px', flexShrink: 0,
                        borderRadius: '4px', overflow: 'hidden',
                        background: '#fff',
                        border: `1.5px solid ${BORDER_COLOR}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    }}>
                        {data.schoolLogo
                            ? <img src={data.schoolLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '2px' }} />
                            : <span style={{ fontSize: '32px' }}>🏛️</span>
                        }
                    </div>

                    {/* School Info */}
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ 
                            fontFamily: "'Georgia', serif",
                            color: isClassic ? PRIMARY_TEXT : ACCENT_COLOR, 
                            fontSize: '9pt', 
                            fontWeight: 700, 
                            letterSpacing: '0.2em', 
                            textTransform: 'uppercase',
                            marginBottom: '2px'
                        }}>
                            {data.schoolType || 'Academic Institution'}
                        </div>
                        <div style={{ 
                            fontFamily: "'Georgia', serif",
                            color: PRIMARY_TEXT, 
                            fontSize: '18pt', 
                            fontWeight: 900, 
                            lineHeight: 1.1,
                            letterSpacing: '-0.01em'
                        }}>
                            {data.schoolName}
                        </div>
                        {data.motto && (
                            <div style={{ 
                                color: '#64748b', 
                                fontSize: '10pt', 
                                fontStyle: 'italic',
                                fontWeight: 600,
                                margin: '2px 0'
                            }}>
                                "{data.motto}"
                            </div>
                        )}
                        <div style={{ 
                            color: '#64748b', 
                            fontSize: '9pt', 
                            marginTop: '4px',
                            fontStyle: 'italic',
                            fontWeight: 500
                        }}>
                            📍 {data.district}, {data.region}
                        </div>
                    </div>

                    {/* Term Badge */}
                    <div style={{
                        border: isClassic ? `2px solid ${PRIMARY_TEXT}` : `1px solid ${ACCENT_COLOR}`,
                        borderRadius: isClassic ? '0' : '4px', padding: '6px 12px',
                        textAlign: 'center', flexShrink: 0,
                        background: '#fff',
                        minWidth: '100px',
                    }}>
                        <div style={{ color: isClassic ? PRIMARY_TEXT : '#94a3b8', fontSize: '7pt', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Session</div>
                        <div style={{ color: PRIMARY_TEXT, fontSize: '10pt', fontWeight: 900 }}>{data.term}</div>
                        <div style={{ color: ACCENT_COLOR, fontSize: '9pt', fontWeight: 800 }}>{data.year}</div>
                    </div>
                </div>

                {/* ── MOTTO STRIP (Hidden if custom motto is shown above or use as complementary) ── */}
                {!data.motto && (
                    <div style={{
                        padding: '6px 20px',
                        textAlign: 'center',
                        fontSize: '8pt',
                        fontWeight: 600,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.25em',
                        borderBottom: `1px solid ${BORDER_COLOR}`,
                        background: 'rgba(0,0,0,0.02)',
                        zIndex: 1,
                    }}>
                        Knowledge • Discipline • Excellence
                    </div>
                )}

                {/* ── STUDENT PROFILE SECTION ── */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '15px 24px',
                    gap: '24px',
                    zIndex: 1,
                    background: isClassic ? 'transparent' : 'white',
                    margin: '10px 15px',
                    borderRadius: isClassic ? '0' : '8px',
                    border: isClassic ? `1px solid ${PRIMARY_TEXT}` : '1px solid #e2e8f0',
                    borderTop: isClassic ? `3px solid ${PRIMARY_TEXT}` : '1px solid #e2e8f0',
                    boxShadow: isClassic ? 'none' : '0 1px 3px rgba(0,0,0,0.02)',
                }}>
                    {/* Photo with frame */}
                    <div style={{
                        width: '85px', height: '105px', flexShrink: 0,
                        border: isClassic ? `2px solid ${PRIMARY_TEXT}` : `2px solid ${ACCENT_COLOR}`,
                        padding: '3px',
                        background: '#fff',
                        position: 'relative',
                    }}>
                        <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#f8fafc' }}>
                            {data.studentPhoto
                                ? <img src={data.studentPhoto} alt="Student" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', color: '#cbd5e1' }}>👤</div>
                            }
                        </div>
                    </div>

                    {/* Profile Details */}
                    <div style={{ flex: 1 }}>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '7.5pt', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Official Name of Learner</div>
                            <div style={{ fontFamily: "'Georgia', serif", fontSize: '14pt', fontWeight: 900, color: PRIMARY_TEXT }}>{data.studentName}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: config.showAttendance ? '1.2fr 1fr 1.3fr' : '1.2fr 1fr', gap: '15px' }}>
                            <InfoRow label="Student ID" value={data.studentId} />
                            <InfoRow label="Class" value={data.className} />
                            {config.showAttendance && (
                                <InfoRow 
                                    label="Attendance" 
                                    value={data.attendance?.total ? `P: ${data.attendance.present} | L: ${data.attendance.late} | A: ${data.attendance.absent} — ${data.attendance.percentage}%` : '—'} 
                                />
                            )}
                        </div>
                    </div>

                    {/* Merit Badge */}
                    <div style={{
                        width: '110px', flexShrink: 0,
                        borderLeft: '1px solid #e2e8f0',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        paddingLeft: '20px', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '7pt', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Terminal Avg</div>
                        <div style={{ fontSize: '22pt', fontWeight: 900, color: PRIMARY_TEXT, lineHeight: 1 }}>{percentage}%</div>
                        {data.overallGrade && (
                            <div style={{
                                marginTop: '4px', padding: '2px 14px',
                                background: isClassic ? PRIMARY_TEXT : ACCENT_COLOR,
                                color: '#fff', borderRadius: isClassic ? '0' : '3px',
                                fontSize: '9pt', fontWeight: 900,
                                letterSpacing: '0.05em'
                            }}>
                                GRADE {data.overallGrade}
                            </div>
                        )}
                        {data.position && (
                             <div style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 700, marginTop: '5px' }}>
                                Rank: <span style={{ color: ACCENT_COLOR }}>{data.position}</span> of {data.totalStudents}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── ACADEMIC TRANSCRIPT ── */}
                <div style={{ padding: '0 15px 10px', flex: 1, zIndex: 1 }}>
                    <div style={{
                        fontFamily: "'Georgia', serif",
                        fontSize: '10pt', fontWeight: 900, color: isClassic ? PRIMARY_TEXT : ACCENT_COLOR,
                        textTransform: 'uppercase', letterSpacing: '0.15em',
                        padding: '10px 0 6px',
                        textAlign: 'center',
                        borderBottom: isClassic ? `2px solid ${PRIMARY_TEXT}` : `1px solid ${ACCENT_COLOR}`,
                    }}>
                        Academic Transcript
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px', fontSize: '8.5pt' }}>
                        <thead>
                            <tr style={{ borderBottom: `2px solid ${PRIMARY_TEXT}` }}>
                                {['No.', 'Subject Description', 'CA (30)', 'Exams (70)', 'Total', 'Grade', 'Remarks'].map((h, i) => (
                                    <th key={i} style={{
                                        padding: '6px 8px',
                                        color: PRIMARY_TEXT, fontWeight: 800,
                                        textAlign: i === 1 ? 'left' : 'center',
                                        letterSpacing: '0.03em', fontSize: '7pt',
                                        textTransform: 'uppercase',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {subjects.map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={tdStyle('center')}>{idx + 1}</td>
                                    <td style={{ ...tdStyle('left', true), color: PRIMARY_TEXT }}>{row.subjectName}</td>
                                    <td style={tdStyle('center')}>{row.caTotal.toFixed(1)}</td>
                                    <td style={tdStyle('center')}>{row.examScore.toFixed(1)}</td>
                                    <td style={{ ...tdStyle('center'), fontWeight: 900, color: PRIMARY_TEXT }}>{Math.round(row.totalScore)}</td>
                                    <td style={{ ...tdStyle('center'), fontWeight: 900, color: gradeColor(row.grade) }}>{row.grade}</td>
                                    <td style={{ ...tdStyle('center'), fontStyle: 'italic', fontSize: '7.5pt' }}>{row.remarks}</td>
                                </tr>
                            ))}
                            {Array.from({ length: Math.max(0, MIN_SUBJECT_ROWS - subjects.length) }).map((_, i) => {
                                const idx = subjects.length + i;
                                return (
                                    <tr key={`blank-${i}`} style={{ borderBottom: '1px solid #f8fafc', opacity: 0.5 }}>
                                        <td style={tdStyle('center')}>{idx + 1}</td>
                                        <td style={tdStyle('left')}>&nbsp;</td>
                                        <td style={tdStyle('center')}>—</td>
                                        <td style={tdStyle('center')}>—</td>
                                        <td style={tdStyle('center')}>—</td>
                                        <td style={tdStyle('center')}>—</td>
                                        <td style={tdStyle('center')}>—</td>
                                    </tr>
                                );
                            })}
                            {/* Totals row */}
                            <tr style={{ background: isClassic ? 'transparent' : 'rgba(241, 245, 249, 0.5)', borderTop: isClassic ? `2px solid ${PRIMARY_TEXT}` : `1.5px solid ${ACCENT_COLOR}` }}>
                                <td colSpan={2} style={{ ...tdStyle('right', false, true), paddingRight: '15px', fontFamily: "'Georgia', serif" }}>Terminal Aggregate</td>
                                <td style={tdStyle('center', false, true)} />
                                <td style={tdStyle('center', false, true)} />
                                <td style={{ ...tdStyle('center', false, true), color: PRIMARY_TEXT, fontSize: '10pt', fontWeight: 900 }}>{Math.round(data.totalScoreSum)}</td>
                                <td style={tdStyle('center', false, true)} />
                                <td style={tdStyle('center', false, true)} />
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ── LOWER CONTENT AREA ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '15px', margin: '0 15px 15px', zIndex: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* Grading Interpretation */}
                        {config.showGradingKey && (
                            <div style={{
                                padding: '8px 12px',
                                background: isClassic ? 'transparent' : '#fff',
                                border: isClassic ? `1px solid ${PRIMARY_TEXT}` : '1px solid #e2e8f0',
                                borderRadius: isClassic ? '0' : '4px',
                            }}>
                                <div style={{ fontSize: '7pt', fontWeight: 800, color: isClassic ? PRIMARY_TEXT : ACCENT_COLOR, textTransform: 'uppercase', marginBottom: '5px', borderBottom: isClassic ? `1px solid ${PRIMARY_TEXT}` : `1px solid ${ACCENT_COLOR}` }}>Grading Interpretation</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '7pt' }}>
                                    {[
                                        { g: 'A', r: '80–100', l: 'Excellent' },
                                        { g: 'B', r: '70–79', l: 'Very Good' },
                                        { g: 'C', r: '60–69', l: 'Credit' },
                                        { g: 'D', r: '50–59', l: 'Pass' },
                                        { g: 'F', r: '< 50', l: 'Fail' },
                                    ].map(item => (
                                        <div key={item.g} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ fontWeight: 900, color: PRIMARY_TEXT }}>{item.g}</span>
                                            <span style={{ color: '#94a3b8' }}>[{item.r}]</span>
                                            <span style={{ color: '#64748b' }}>{item.l}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Remarks */}
                        {data.overallRemarks && (
                            <div style={{
                                padding: '10px 12px',
                                background: '#fff',
                                border: `1px solid ${BORDER_COLOR}`,
                                borderRadius: '4px',
                                flex: 1,
                            }}>
                                <div style={{ fontSize: '7.5pt', fontWeight: 800, color: PRIMARY_TEXT, textTransform: 'uppercase', marginBottom: '4px' }}>Counselor / Class Teacher's Appraisal</div>
                                <div style={{ fontSize: '8.5pt', color: PRIMARY_TEXT, fontStyle: 'italic', lineHeight: 1.4 }}>
                                    "{data.overallRemarks}"
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                         {/* Dates */}
                         <div style={{
                            padding: '8px 12px',
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            fontSize: '8pt',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ color: isClassic ? PRIMARY_TEXT : '#94a3b8', fontWeight: 700 }}>Vacation:</span>
                                <span style={{ fontWeight: 800 }}>{data.vacationDate ? new Date(data.vacationDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: isClassic ? PRIMARY_TEXT : '#94a3b8', fontWeight: 700 }}>Resumption:</span>
                                <span style={{ fontWeight: 800, color: isClassic ? PRIMARY_TEXT : ACCENT_COLOR }}>{data.nextTermStarts ? new Date(data.nextTermStarts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                            </div>
                        </div>

                        {/* Financial Status Strip */}
                        {config.showFees && data.feeInfo && (
                            <div style={{
                                padding: '8px 12px',
                                background: data.feeInfo.status === 'Paid' ? '#f0fdf4' : data.feeInfo.status === 'Partial' ? '#fffbeb' : '#fef2f2',
                                border: `1px solid ${data.feeInfo.status === 'Paid' ? '#bcf0da' : data.feeInfo.status === 'Partial' ? '#fde68a' : '#fecaca'}`,
                                borderRadius: '4px',
                            }}>
                                <div style={{ fontSize: '7pt', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Financial Status</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                    <span style={{ fontSize: '9pt', fontWeight: 900, color: PRIMARY_TEXT }}>
                                        {data.feeInfo.status === 'Paid' ? 'Account Cleared' : `GHS ${data.feeInfo.feeBalance.toFixed(2)} Arrears`}
                                    </span>
                                    <span style={{ fontSize: '7pt', fontWeight: 800, color: data.feeInfo.status === 'Paid' ? '#166534' : '#991b1b' }}>
                                        {data.feeInfo.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Promotion */}
                        {data.promotionStatus && (
                            <div style={{
                                padding: '8px 12px',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '4px',
                                textAlign: 'center',
                                fontSize: '8pt',
                                fontWeight: 900,
                                color: '#1e40af',
                                textTransform: 'uppercase'
                            }}>
                                {data.promotionStatus}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── AUTHORIZATION SECTION ── */}
                <div style={{
                    margin: '0 15px 15px',
                    padding: '15px 15px 10px',
                    border: isClassic ? `1px solid ${PRIMARY_TEXT}` : `1px solid ${ACCENT_COLOR}`,
                    background: isClassic ? 'transparent' : '#fff',
                    borderRadius: isClassic ? '0' : '4px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 100px',
                    gap: '20px',
                    zIndex: 1,
                }}>
                    {/* Class Teacher */}
                    <div style={sigBoxStyle}>
                        <div style={sigLabelStyle}>Class Teacher / Counselor</div>
                        <div style={sigNameStyle}>{data.classTeacherName}</div>
                        <div style={sigLineStyle} />
                        <div style={sigSubLabelStyle}>Signature and Date</div>
                    </div>

                    {/* Headteacher */}
                    <div style={sigBoxStyle}>
                        <div style={sigLabelStyle}>Head of Institution</div>
                        <div style={sigNameStyle}>{data.headteacherName}</div>
                        <div style={sigLineStyle} />
                        <div style={sigSubLabelStyle}>Signature and Date</div>
                    </div>

                    {/* Stamp */}
                    <div style={{
                        border: `1.5px dashed ${BORDER_COLOR}`,
                        borderRadius: '4px',
                        width: '80px', height: '80px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#cbd5e1', fontSize: '6pt', fontWeight: 700,
                        textAlign: 'center', textTransform: 'uppercase',
                        margin: '0 auto',
                        background: 'rgba(0,0,0,0.01)',
                    }}>
                        Place Official<br />Seal Here
                    </div>
                </div>

                {/* ── FOOTER ── */}
                <div style={{
                    background: isClassic ? PRIMARY_TEXT : ACCENT_COLOR,
                    padding: '8px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '7pt',
                    color: 'rgba(255,255,255,0.9)',
                    zIndex: 1,
                }}>
                    <span style={{ fontWeight: 600 }}>Official Academic Record — Not Valid Without Seal</span>
                    <span style={{ letterSpacing: '0.05em' }}>Generated: {new Date().toLocaleDateString('en-GB')}</span>
                </div>
            </div>
        </div>
    );
};

/* ── Refined Helpers ── */
const InfoRow: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value }) => (
    <div>
        <div style={{ fontSize: '7pt', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: '9pt', fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '1px' }}>{value || '—'}</div>
    </div>
);

const tdStyle = (align: 'left' | 'center' | 'right', bold = false, isTotals = false): React.CSSProperties => ({
    padding: '6px 8px',
    textAlign: align,
    borderBottom: '1px solid #f1f5f9',
    fontWeight: bold || isTotals ? 800 : 500,
    fontSize: isTotals ? '9pt' : '8.5pt',
    color: '#334155',
});

const sigBoxStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column',
};
const sigLabelStyle: React.CSSProperties = {
    fontSize: '6.5pt', fontWeight: 800, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.08em',
};
const sigNameStyle: React.CSSProperties = {
    fontSize: '9pt', fontWeight: 800, color: '#1e293b',
    marginTop: '2px',
    fontFamily: "'Georgia', serif",
};
const sigLineStyle: React.CSSProperties = {
    borderBottom: '1px solid #cbd5e1', marginTop: '20px',
};
const sigSubLabelStyle: React.CSSProperties = {
    fontSize: '6pt', color: '#94a3b8', marginTop: '4px',
    textTransform: 'uppercase',
    fontWeight: 600,
};

export default ReportCardTemplate;
