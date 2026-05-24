const SUPABASE_URL = 'https://blumqkxwasdbyozdvrsp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kvVacObZ3ERPqc9MjOIoWw_aRZeYeIn';

// A palavra 'export' avisa o navegador que a constante 'db' pode ser acessada por outros arquivos
export const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
