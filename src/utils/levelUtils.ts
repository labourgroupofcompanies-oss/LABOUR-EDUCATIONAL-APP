/**
 * Academic Level Hierarchy & Progression Logic
 */

export const ACADEMIC_LEVELS = [
    'Crèche',
    'Nursery 1',
    'Nursery 2',
    'KG 1',
    'KG 2',
    'Basic 1',
    'Basic 2',
    'Basic 3',
    'Basic 4',
    'Basic 5',
    'Basic 6',
    'JHS 1',
    'JHS 2',
    'JHS 3',
    'SHS 1',
    'SHS 2',
    'SHS 3',
    'Graduated'
];

// Fallback for custom level naming (Basic 7-9 maps to JHS 1-3)
const LEVEL_MAPPING: Record<string, string> = {
    'Basic 7': 'JHS 1',
    'Basic 8': 'JHS 2',
    'Basic 9': 'JHS 3',
};

/**
 * Normalizes level strings to ensure consistent matching
 */
export function normalizeLevel(level: string): string {
    if (!level) return '';
    const trimmed = level.trim();
    return LEVEL_MAPPING[trimmed] || trimmed;
}

/**
 * Returns the index of a level in the hierarchy
 */
export function getLevelIndex(level: string): number {
    const norm = normalizeLevel(level);
    return ACADEMIC_LEVELS.indexOf(norm);
}

/**
 * Determines the logical next level
 */
export function getNextLevel(currentLevel: string): string | null {
    const index = getLevelIndex(currentLevel);
    if (index === -1 || index >= ACADEMIC_LEVELS.length - 1) return null;
    return ACADEMIC_LEVELS[index + 1];
}

/**
 * Checks if two levels are the same (lateral move/transfer)
 */
export function isSameLevel(levelA: string, levelB: string): boolean {
    return normalizeLevel(levelA) === normalizeLevel(levelB);
}

/**
 * Checks if a move is a valid promotion (strictly level + 1)
 */
export function isNextLevel(fromLevel: string, toLevel: string): boolean {
    const fromIndex = getLevelIndex(fromLevel);
    const toIndex = getLevelIndex(toLevel);
    return fromIndex !== -1 && toIndex === fromIndex + 1;
}

/**
 * Determines the movement type based on from and to levels
 */
export type StudentMovementType = 'promotion' | 'transfer' | 'repeat' | 'graduation' | 'invalid';

export function getMovementType(fromLevel: string, toLevel: string): StudentMovementType {
    const from = normalizeLevel(fromLevel);
    const to = normalizeLevel(toLevel);

    if (to === 'Graduated') return 'graduation';
    if (from === to) return 'transfer'; // Lateral move between sections

    const fromIdx = getLevelIndex(from);
    const toIdx = getLevelIndex(to);

    if (fromIdx === -1 || toIdx === -1) return 'invalid';
    if (toIdx === fromIdx + 1) return 'promotion';
    if (toIdx === fromIdx) return 'transfer';
    if (toIdx < fromIdx) return 'repeat'; // Or demotion/rollback
    
    return 'promotion'; // Any jump forward is considered a promotion for now
}
