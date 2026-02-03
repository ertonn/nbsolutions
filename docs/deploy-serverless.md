Actionable steps to enable server-side content persistence (Vercel)

1) Add environment variables in Vercel (Project Settings → Environment Variables):
   - NEXT_PUBLIC_SUPABASE_URL = https://<your-project>.supabase.co
   - SUPABASE_SERVICE_ROLE_KEY = <your-service-role-key>  (keep this secret)

2) Create the `site_content` table in Supabase (run in SQL editor):

```sql
CREATE TABLE IF NOT EXISTS public.site_content (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);
```

3) (Optional) RLS: service role bypasses RLS, but if you plan to use client-side supabase for content, add read policy:

```sql
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_read ON public.site_content;
CREATE POLICY public_read ON public.site_content FOR SELECT USING (true);
```

4) Deploy to Vercel (push to repo). Vercel will install dependencies from `package.json`.

5) Test from the Admin UI:
   - Login to `admin.html` → Settings → click **Test Server Save**. You should see **Server: OK** and an alert confirming success.
   - Then try **Save Content** — it should persist to the `site_content` table.

6) Troubleshooting:
   - If you get an error, check Vercel function logs (Vercel Dashboard → Functions → Logs) and confirm the environment variables are set and correct.
   - If `SUPABASE_SERVICE_ROLE_KEY` is missing, the function returns 500 with a clear message.
