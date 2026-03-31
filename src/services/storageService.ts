import { supabase } from '../supabaseClient';

const BUCKET_NAME = 'school-assets';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const storageService = {
    /**
     * Uploads a Blob/File to Supabase Storage in a school-specific folder.
     * Path format: {schoolId}/{type}/{filename}
     */
    async uploadAsset(
        schoolId: string,
        type: 'logos' | 'students',
        filename: string,
        blob: Blob
    ): Promise<{ path: string; publicUrl: string } | null> {
        if (!schoolId) {
            console.error('[storageService] Missing schoolId');
            return null;
        }

        if (!filename) {
            console.error('[storageService] Missing filename');
            return null;
        }

        if (blob.size > MAX_FILE_SIZE) {
            console.error('[storageService] File too large');
            return null;
        }

        if (blob.type && !ALLOWED_TYPES.includes(blob.type)) {
            console.error('[storageService] Unsupported file type:', blob.type);
            return null;
        }

        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFilename =
            type === 'students' ? `${Date.now()}_${safeFilename}` : safeFilename;

        const path = `${schoolId}/${type}/${uniqueFilename}`;

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(path, blob, {
                upsert: type === 'logos',
                contentType: blob.type || 'application/octet-stream',
            });

        if (error) {
            console.error('[storageService] Upload failed:', error.message);
            return null;
        }

        const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

        return {
            path,
            publicUrl: data.publicUrl,
        };
    },

    /**
     * Downloads an asset from Supabase Storage and returns it as a Blob.
     */
    async downloadAsset(path: string): Promise<Blob | null> {
        if (!path) return null;

        console.log(`[storageService] Downloading asset from bucket '${BUCKET_NAME}', path: '${path}'`);

        try {
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .download(path);

            if (error) {
                console.warn(`[storageService] Download failed for path '${path}':`, error.message);
                return null;
            }

            return data;
        } catch (err: any) {
            console.error(`[storageService] Exception downloading asset '${path}':`, err);
            return null;
        }
    },

    /**
     * Returns a public URL for the given asset path.
     */
    getPublicUrl(path: string): string {
        if (!path) return '';

        const { data } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(path);

        return data.publicUrl;
    },

    /**
     * Deletes an asset from Supabase Storage.
     */
    async deleteAsset(path: string): Promise<boolean> {
        if (!path) return false;

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([path]);

        if (error) {
            console.error('[storageService] Delete failed:', error.message);
            return false;
        }

        return true;
    },
};