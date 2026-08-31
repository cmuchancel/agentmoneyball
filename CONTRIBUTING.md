# Contributing

## Development workflow

1. Create a focused branch.
2. Install the reproducible environment with pixi install.
3. Install frontend dependencies with pixi run frontend-install.
4. Make the smallest coherent change.
5. Add or update regression tests for behavior changes.
6. Run pixi run check.
7. Review the diff for secrets, generated files, and unrelated changes.

## Code organization

- Keep HTTP and authentication behavior in the API or route layer.
- Keep deterministic baseball calculations independent of model prompting.
- Put shared serialized contracts in Pydantic or TypeScript domain types.
- Keep React page modules focused on orchestration; move reusable rendering and feature logic into frontend/features/.
- Put deployment-specific storage behind the existing Supabase storage boundary.
- Do not add private-upload behavior to the public demo without an explicit product and security review.

## Analysis changes

Every new analysis capability should include:

- a precise input/filter contract;
- deterministic execution where practical;
- normalized handling of known source variants;
- explicit numerators and denominators for rates;
- evidence output that supports every numerical claim;
- a clear cannot_answer path for absent fields;
- regression fixtures for edge cases.

Never fix a missing field by asking the model to infer an unsupported value.

## Frontend changes

- Preserve keyboard access and visible focus states.
- Test narrow and wide layouts.
- Format long numeric values before rendering metrics.
- Treat missing plot coordinates as unavailable data, not zero.
- Keep secrets in server-only modules and environment variables without NEXT_PUBLIC_.
- Ensure loading, empty, cannot_answer, and error states remain usable.

## Tests and checks

Canonical full check:

~~~bash
pixi run check
~~~

Focused backend tests:

~~~bash
pixi run pytest backend/tests/test_chart_tool.py -q
pixi run pytest backend/tests/test_checks.py -q
~~~

Frontend-only checks:

~~~bash
cd frontend
npm run typecheck
npm run build
~~~

The normal test suite must not make billable OpenAI calls. Use injected analyst and gate functions in tests.

## Review checklist

- [ ] Behavior is documented where a user or operator will look for it.
- [ ] New numerical claims are backed by executed evidence.
- [ ] Tests cover the success and failure path.
- [ ] No real secret, .env, generated environment, or build output is committed.
- [ ] Production authentication remains fail-closed.
- [ ] Browser code cannot read backend or Supabase secrets.
- [ ] Demo dataset counts and attribution remain correct.
- [ ] pixi run check passes.

## Commit messages

Use a short imperative summary, optionally followed by context:

~~~text
Normalize whiff outcome aliases

Cover swinging-strike variants in deterministic chart filters and add
regression fixtures for the bundled TrackMan schema.
~~~
