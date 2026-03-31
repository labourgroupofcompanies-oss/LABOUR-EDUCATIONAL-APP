import { useState, useEffect } from 'react';

/**
 * A custom hook to manage the lifecycle of a Blob URL.
 * Automatically revokes the object URL when the component unmounts
 * or when the file changes.
 */
export const useAssetPreview = (file: Blob | null | undefined) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }

        const url = URL.createObjectURL(file);
        setPreviewUrl(url);

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [file]);

    return previewUrl;
};
