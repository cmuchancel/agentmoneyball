# Vercel and Supabase deployment

Production uses two Vercel projects and one Supabase project:

~~~text
Vercel frontend (frontend/)
  └── authenticated relay ──► Vercel API (repository root)
                                  └──► Supabase Postgres
~~~

Separating the frontend and API preserves the Next.js server boundary while allowing FastAPI to deploy from the repository root.

## 1. Prepare Supabase

Create a Supabase project and link the repository with the Supabase CLI. Apply the migration in:

~~~text
supabase/migrations/20260831000000_pitchquery_demo.sql
~~~

Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally for the seed, then run:

~~~bash
pixi run seed-demo
~~~

The seed is safe to repeat for unchanged content. Never expose the service-role key to frontend code or prefix it with NEXT_PUBLIC_.

## 2. Deploy the API project

Create a Vercel project rooted at the repository root. vercel.json routes the Python application.

Set:

| Variable | Notes |
| --- | --- |
| OPENAI_API_KEY | Production OpenAI project key. |
| OPENAI_MODEL | Optional model override. |
| SUPABASE_URL | Supabase project URL. |
| SUPABASE_SERVICE_ROLE_KEY | Server-only storage credential. |
| PITCHQUERY_API_SECRET | Strong random shared secret. |
| PITCHQUERY_DAILY_TOKEN_LIMIT | Optional application budget. |
| PITCHQUERY_TOKEN_RESERVE | Optional in-flight headroom. |
| FRONTEND_ORIGIN | Exact deployed frontend origin. |

Deploy from the API project or with the Vercel CLI:

~~~bash
vercel --prod
~~~

Confirm with the configured secret:

~~~bash
curl https://YOUR_API_DOMAIN/api/health \
  -H 'X-PitchQuery-Secret: YOUR_SHARED_SECRET'
~~~

## 3. Deploy the frontend project

Create a second Vercel project with frontend/ as its root directory.

Set:

| Variable | Notes |
| --- | --- |
| PITCHQUERY_API_URL | Deployed API origin, without a trailing route. |
| PITCHQUERY_API_SECRET | Exactly the same shared secret as the API. |
| PITCHQUERY_PASSWORD | The site password. |
| PITCHQUERY_SESSION_TOKEN | A separate long random signing value. |

Do not configure NEXT_PUBLIC_API_URL for the protected production route. The browser should call the same-origin relay.

Deploy:

~~~bash
cd frontend
vercel --prod
~~~

## 4. Smoke-test production

1. Open a private browser window and confirm the site redirects to /login.
2. Confirm a wrong password does not create a session.
3. Sign in and load the demo dataset.
4. Verify the UI reports 21 games and 3,344 pitches.
5. Run the known whiff prompt and verify 25 total whiffs: 20 changeups, 3 fastballs, 2 sliders.
6. Run an unsupported baserunner/score prompt and verify cannot_answer.
7. Confirm a direct API request without the shared secret returns 401.
8. Confirm both upload buttons remain disabled.

## Secret rotation

Rotate credentials independently:

- Rotate PITCHQUERY_PASSWORD to change visitor access.
- Rotate PITCHQUERY_SESSION_TOKEN to invalidate every existing browser session.
- Rotate PITCHQUERY_API_SECRET on both Vercel projects in the same maintenance window.
- Rotate SUPABASE_SERVICE_ROLE_KEY only on services that access Supabase server-side.

Redeploy affected projects after changing environment variables. Never record real values in issues, logs, screenshots, or documentation.

## Rollback

Vercel retains previous deployments for both projects. Roll back the API and frontend independently when possible. Database migrations should be additive; if a schema rollback is required, write an explicit corrective migration rather than editing an already-applied migration.
