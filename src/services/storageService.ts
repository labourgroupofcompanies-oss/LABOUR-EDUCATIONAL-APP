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
    ): Promise<{ path: string } | null> {
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

        return { path };
    },

    /**
     * Downloads an asset from Supabase Storage and returns it as a Blob.
     * Note: This works on private buckets if the user is authenticated and RLS permits.
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
     * Creates a temporary signed URL for a private asset.
     * @param path The storage path
     * @param expiresIn Seconds until expiration (default 1 hour)
     */
    async getSignedUrl(path: string, expiresIn: number = 3600): Promise<string | null> {
        if (!path) return null;

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(path, expiresIn);

        if (error) {
            console.error('[storageService] Failed to create signed URL:', error.message);
            return null;
        }

        return data.signedUrl;
    },

    /**
     * @deprecated getPublicUrl will not work for private buckets. Use getSignedUrl or downloadAsset instead.
     */
    getPublicUrl(path: string): string {
        console.warn('[storageService] getPublicUrl called on a private bucket. This URL will likely return a 403.');
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