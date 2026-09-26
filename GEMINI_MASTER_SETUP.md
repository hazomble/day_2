# Gemini Master setup

The admin-only console is available after deployment at `/ai-admin`.

1. Add these Vercel server-side variables for **Production**:

   ```text
   GEMINI_API_KEY=
   KIMI_API_KEY=
   GLM_API_KEY=
   ```

2. Redeploy, sign in as `mag65@gmail.com`, and open `/ai-admin`.
3. Ask for a plan first. The console shows the Kimi and GLM reviews plus Gemini's selected platform action.
4. Click **Confirm and execute** only after reviewing the plan. Plans expire after 10 minutes and can only be executed by the same admin account.

The only executable actions are listing users/courses, publishing or unpublishing a course, and enabling or disabling a user. User creation, passwords, source-code edits, and role changes are intentionally excluded.
