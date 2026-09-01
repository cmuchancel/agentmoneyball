# AI assistance disclosure

Agent Moneyball uses generative AI in two distinct ways: as part of the product at runtime and as an assistance tool during development. This document separates those roles so the project's AI use is transparent.

## Runtime intelligence

The application sends a user's natural-language scouting question and the prepared TrackMan dataset to an OpenAI-powered LangGraph workflow. The analyst interprets the request, selects relevant fields and filters, generates an analysis plan, and executes Pandas code or the deterministic location-chart tool. Schema checks, arithmetic checks, and a separate semantic evidence gate review the result before it reaches the interface. The runtime architecture is described in [ARCHITECTURE.md](ARCHITECTURE.md).

## Development assistance

OpenAI Codex was used as an AI-assisted software-development partner. It helped with:

- exploring product and interface ideas;
- drafting and revising Python, TypeScript, React, CSS, tests, and documentation;
- diagnosing layout, prompt-routing, deployment, and PDF-export problems;
- suggesting modular boundaries and evidence checks;
- running the test/build workflow and supporting Vercel and Supabase deployment.

The author directed the product goals, chose the baseball use case and demo scope, selected and refined the interface, evaluated generated outputs, tested the walkthrough prompts, reviewed changes, and made the final decisions about what to keep. AI suggestions were treated as implementation proposals rather than evidence that the software worked.

## Verification and accountability

AI-assisted changes were checked with the repository's automated backend tests, TypeScript compiler, production frontend build, targeted browser walkthroughs, and direct review of generated tables, charts, and PDF pages. The normal automated test suite uses injected analyst and gate functions, so it does not spend API tokens or depend on a live model.

The author remains responsible for the submitted code, documentation, deployment, and claims. Runtime numerical answers are still subject to the limitations of the provided dataset and should be checked against source video and staff context before real baseball decisions.
