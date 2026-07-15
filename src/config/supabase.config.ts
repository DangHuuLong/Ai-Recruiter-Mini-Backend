export const supabaseConfig = () => ({
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_BUCKET ?? 'cv-files',
    publicTempBucket: process.env.SUPABASE_PUBLIC_TEMP_BUCKET ?? 'file-public',
  },
});
