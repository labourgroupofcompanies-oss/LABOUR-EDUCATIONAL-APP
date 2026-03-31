import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface PrintPortalProps {
    children: React.ReactNode;
    id?: string;
    className?: string;
    onPrint?: () => void;
}

/**
 * Standardized Print Portal Component
 * 
 * Bypasses dashboard layout constraints by rendering directly to document.body
 * and hiding the #root element during print.
 */
const PrintPortal: React.FC<PrintPortalProps> = ({ children, id = "system-print-area", className = "", onPrint }) => {

    useEffect(() => {
        if (onPrint) {
            onPrint();
        }
    }, [onPrint]);

    return createPortal(
        <div id={id} className={`print-portal-container ${className}`}>
            <style>{`
                @media print {
                    /* Nuclear Reset: Hide the app root */
                    #root {
                        display: none !important;
                    }

                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        height: auto !important;
                        background: white !important;
                        overflow: visible !important;
                    }

                    #${id} {
                        display: block !important;
                        visibility: visible !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        z-index: 999999 !important;
                        background: white !important;
                        opacity: 1 !important;
                        transform: none !important;
                    }

                    #${id} * {
                        visibility: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    /* Utility for A4 Portrait */
                    .print-a4-portrait {
                        width: 210mm !important;
                        min-height: 297mm !important;
                        page-break-after: always !important;
                        page-break-inside: avoid !important;
                        box-sizing: border-box !important;
                        background: white !important;
                    }

                    /* Utility for A4 Landscape */
                    .print-a4-landscape {
                        width: 297mm !important;
                        min-height: 210mm !important;
                        page-break-after: always !important;
                        page-break-inside: avoid !important;
                        box-sizing: border-box !important;
                        background: white !important;
                    }

                    @page {
                        margin: 0;
                    }
                }

                /* Screen visibility: Off-screen */
                #${id} {
                    position: absolute;
                    top: 0;
                    left: -9999px;
                    pointer-events: none;
                    opacity: 0;
                    visibility: hidden;
                }
            `}</style>
            {children}
        </div>,
        document.body
    );
};

export default PrintPortal;
