CREATE OR REPLACE FUNCTION public.get_fee_payments_constraints()
RETURNS json
SECURITY DEFINER
AS $$
DECLARE
    res json;
BEGIN
    SELECT json_agg(t) INTO res
    FROM (
        SELECT 
            con.conname AS constraint_name,
            con.contype AS constraint_type,
            pg_get_constraintdef(con.oid) AS constraint_definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public' AND rel.relname = 'fee_payments'
    ) t;
    RETURN res;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_fee_payments_constraints() TO anon, authenticated;
