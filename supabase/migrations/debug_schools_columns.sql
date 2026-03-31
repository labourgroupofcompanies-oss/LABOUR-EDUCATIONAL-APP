-- Diagnostic query to see columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'schools';
