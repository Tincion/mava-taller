import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://milizbjbjwxndujbwbxm.supabase.co';
// USAMOS LA PUBLIC KEY AQUÍ (sb_pub...)
const supabaseKey = 'sb_publishable_oDBO3NyVI9Zapddw0oRiKA_WQKBZaix';

export const supabase = createClient(supabaseUrl, supabaseKey);