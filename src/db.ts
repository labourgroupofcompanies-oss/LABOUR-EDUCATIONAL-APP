import Dexie, { type EntityTable } from 'dexie';

export interface LabourItem {
  id?: number;
  title: string;
  description: string;
  category: string;
  syncStatus: 'pending' | 'synced';
  createdAt: number;
}

export interface School {
  id?: number;
  idCloud?: string;     // Supabase UUID (id)
  schoolId?: string;    // Alias for idCloud used by legacy queries
  schoolCode: string;   // Human-readable ID (SCH-...)
  schoolName: string;
  schoolType: string;
  logo?: Blob;
  region: string;
  district: string;
  headteacherName: string;
  username: string;
  password?: string;
  email?: string;
  address?: string;
  motto?: string | null;
  onboardingTerm?: string;
  onboardingAcademicYear?: string;
  syncStatus: 'pending' | 'synced';
  createdAt: number;
  updatedAt: number;
  created_at?: string; // Supabase metadata
  updated_at?: string; // Supabase metadata
}

export interface User {
  id?: number;
  idCloud?: string;     // Supabase UUID (id)
  schoolId: string;     // School UUID (idCloud)
  schoolCode?: string;   // Human-readable ID (Optional)
  username: string;
  password?: string;
  fullName: string;
  role: 'HEADTEACHER' | 'TEACHER' | 'ACCOUNTANT' | 'DEVELOPER';
  phoneNumber?: string;
  email?: string;
  qualification?: string;
  specialization?: string;
  gender?: 'male' | 'female';
  address?: string;
  isDeleted?: boolean;
  deletedAt?: number;
  syncStatus: 'pending' | 'synced';
  createdAt: number;
  updatedAt: number;
}

const db = new Dexie('LabourAppDB') as Dexie & {
  items: EntityTable<LabourItem, 'id'>;
  schools: EntityTable<School, 'id'>;
  users: EntityTable<User, 'id'>;
};

// Schema declaration:
db.version(11).stores({
  items: '++id, title, category, syncStatus, createdAt',
  schools: '++id, idCloud, schoolId, schoolCode, schoolName, region, district, username, syncStatus',
  users: '++id, idCloud, schoolId, username, role, [schoolId+role], syncStatus'
});

db.version(12).stores({
  items: '++id, title, category, syncStatus, createdAt',
  schools: '++id, idCloud, schoolId, schoolCode, schoolName, region, district, username, syncStatus',
  users: '++id, idCloud, schoolId, username, role, [schoolId+role], syncStatus'
}).upgrade(async tx => {
  // Deduplicate users with same idCloud (staff are repeated due to sync issues)
  const users = await tx.table('users').toArray();
  const seenIds = new Set<string>();
  const toDelete: number[] = [];

  for (const user of users) {
    if (user.idCloud) {
      if (seenIds.has(user.idCloud)) {
        toDelete.push(user.id!);
      } else {
        seenIds.add(user.idCloud);
      }
    }
  }

  if (toDelete.length > 0) {
    console.log(`[db] Schema v12: Deduplicating ${toDelete.length} users.`);
    await tx.table('users').bulkDelete(toDelete);
  }
});

db.version(13).stores({
  items: '++id, title, category, syncStatus, createdAt',
  schools: '++id, idCloud, schoolId, schoolCode, schoolName, region, district, username, syncStatus',
  users: '++id, idCloud, schoolId, username, role, isDeleted, [schoolId+role], syncStatus'
});

export { db };
