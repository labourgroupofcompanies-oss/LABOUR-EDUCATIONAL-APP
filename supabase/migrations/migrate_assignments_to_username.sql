-- Migrate Teacher IDs in classes and subject assignments from local IDs to usernames
-- This ensures that assignments persist across different browser profiles/devices.

-- 1. Update the main class teacher assignments
UPDATE classes c
SET teacher_id = u.username
FROM users u
WHERE c.teacher_id = u.id_local::text
  AND c.school_id = u.school_id
  AND c.teacher_id ~ '^[0-9]+$'; -- Only update if it's a numeric ID

-- 2. Update the subject teacher assignments (jsonb array)
-- This is more complex because it's a list of objects like {"subjectId": 1, "teacherId": "123"}
WITH subject_teacher_mapping AS (
    SELECT 
        c.id as class_id,
        jsonb_agg(
            jsonb_set(
                st,
                '{teacherId}',
                to_jsonb(u.username)
            )
        ) as updated_assignments
    FROM classes c
    CROSS JOIN LATERAL jsonb_array_elements(c.subject_teachers) st
    JOIN users u ON st->>'teacherId' = u.id_local::text AND c.school_id = u.school_id
    WHERE c.subject_teachers IS NOT NULL 
      AND st->>'teacherId' ~ '^[0-9]+$'
    GROUP BY c.id
)
UPDATE classes c
SET subject_teachers = m.updated_assignments
FROM subject_teacher_mapping m
WHERE c.id = m.class_id;

-- NOTE: After running this, the Headteacher should also perform a "Pull" or "Sync" 
-- on their main device to ensure the local Dexie DB is updated with the new username-based IDs.
