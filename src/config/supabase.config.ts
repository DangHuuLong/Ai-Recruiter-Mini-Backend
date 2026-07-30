// Reads Supabase URL, service role key, and bucket names into the supabase config namespace.
// Registered in ConfigModule.forRoot({ load: [...] }) in app.module.ts; consumed by SupabaseStorageService to init the storage client.
export const supabaseConfig = () => ({
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_BUCKET ?? 'cv-files',
    publicTempBucket: process.env.SUPABASE_PUBLIC_TEMP_BUCKET ?? 'file-public',
  },
});
