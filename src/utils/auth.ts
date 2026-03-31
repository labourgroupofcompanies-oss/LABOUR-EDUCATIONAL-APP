/**
 * Security-hardened auth utilities for Labour App System.
 *
 * Password Hashing:
 *   Uses PBKDF2 (Web Crypto API) with a random 16-byte salt and 100,000 iterations.
 *   Stored format:  <salt_hex>:<hash_hex>
 *
 *   Previous versions stored plain SHA-256 hashes (no salt). On next login, the
 *   password is automatically re-hashed with PBKDF2 and the stored value is updated.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PBKDF2 Hashing
// ─────────────────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = 'SHA-256';
const SALT_BYTES = 16;

function hexEncode(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Hashes a password with PBKDF2 + a fresh random salt.
 * Returns a string in the format "saltHex:hashHex".
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: PBKDF2_HASH, salt, iterations: PBKDF2_ITERATIONS },
        keyMaterial,
        256
    );
    return `${hexEncode(salt.buffer)}:${hexEncode(derived)}`;
}

/**
 * Verifies a plaintext password against a stored hash string.
 * Supports both new PBKDF2 format ("saltHex:hashHex") and
 * legacy plain SHA-256 format (for migration on first login).
 *
 * Returns { match: boolean, needsMigration: boolean }
 * If needsMigration is true, re-hash with hashPassword() and update stored value.
 */
export async function verifyPassword(
    password: string,
    stored: string
): Promise<{ match: boolean; needsMigration: boolean }> {
    // Detect format: PBKDF2 hashes are "saltHex:hashHex" (two colon-separated parts)
    if (stored.includes(':')) {
        // New PBKDF2 format
        const [saltHex, hashHex] = stored.split(':');
        const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        const derived = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', hash: PBKDF2_HASH, salt, iterations: PBKDF2_ITERATIONS },
            keyMaterial,
            256
        );
        const match = hexEncode(derived) === hashHex;
        return { match, needsMigration: false };
    } else {
        // Legacy SHA-256 format — compare, then signal caller to migrate
        const encoded = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
        const hashHex = hexEncode(hashBuffer);
        const match = hashHex === stored;
        return { match, needsMigration: match }; // only migrate if password is correct
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session (sessionStorage — clears on tab close, not readable by other tabs)
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'labour_app_session';

/**
 * Gets the current session from sessionStorage.
 */
export function getSession(): any | null {
    const session = sessionStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
}

/**
 * Saves a session to sessionStorage.
 * Sensitive fields (password) are explicitly excluded.
 */
export function setSession(user: any): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...sessionUser } = user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
}

/**
 * Clears the session from sessionStorage.
 */
export function clearSession(): void {
    sessionStorage.removeItem(SESSION_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getSupabaseEmail(username: string, schoolId: string): string {
    // If username is already an email (contains @), return as-is (Developer Login)
    if (username.includes('@')) return username.toLowerCase();

    // Remove spaces and special chars from username/schoolId
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanSchoolId = schoolId.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${cleanUsername}.${cleanSchoolId}@labourapp.com`;
}

/**
 * Extracts the original username part from a Supabase email.
 * e.g., "ama.myschool@labourapp.com" -> "ama"
 */
export function getUsernameFromEmail(email: string): string {
    if (!email.includes('@labourapp.com')) return email.split('@')[0];
    const localPart = email.split('@')[0];
    return localPart.split('.')[0];
}
