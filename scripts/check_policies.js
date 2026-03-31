import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTable() {
    console.log("Checking assessment_configs...");
    
    // 1. Fetch 1 row
    const { data: cols, error: err1 } = await supabase.from('assessment_configs').select('*').limit(1);
    
    if (err1) {
        console.error("Error fetching table:", err1);
    } else {
        console.log("Table exists! Columns returned:", cols && cols.length > 0 ? Object.keys(cols[0]) : "Table is empty.");
        console.log("Sample data:", cols);
    }

    // 2. Fetch all rows
    const { data: all, error: err2 } = await supabase.from('assessment_configs').select('id, school_id, year, term');
    console.log("Existing rows in DB:", all);
}

inspectTable();
