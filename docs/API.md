# API contract

The FastAPI service exposes three application routes. Local interactive OpenAPI documentation is available at /docs.

## Authentication

When PITCHQUERY_API_SECRET is set, every /api/* route requires:

~~~http
X-PitchQuery-Secret: <shared-server-secret>
~~~

In production, the Next.js relay adds this header server-side. Browser code must not receive or store the secret.

## Health

### GET /api/health

Response:

~~~json
{
  "status": "ok"
}
~~~

Use this for deployment smoke tests and uptime checks.

## Load the demo dataset

### POST /api/datasets

Loads the bundled dataset locally, or the prepared Supabase payload when production storage is configured.

Example:

~~~bash
curl -X POST http://localhost:8000/api/datasets
~~~

Abbreviated response:

~~~json
{
  "dataset_id": "content-derived-id",
  "profile": {
    "rows": 3344,
    "games": 21,
    "pitchers": 32,
    "batters": 50
  }
}
~~~

The dataset ID is derived from content. Loading unchanged demo data again returns the stable dataset rather than creating a new logical dataset.

## Stream a chat analysis

### POST /api/chat

Request:

~~~json
{
  "thread_id": "browser-thread-id",
  "dataset_id": "content-derived-id",
  "message": "For pitcher Caleb Archer, plot every swing-and-miss pitch location. Color each point by pitch type and report total whiffs by pitch type.",
  "messages": []
}
~~~

Example:

~~~bash
curl -N http://localhost:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"thread_id":"demo","dataset_id":"YOUR_DATASET_ID","message":"Summarize Caleb Archer’s arsenal.","messages":[]}'
~~~

The response is newline-delimited JSON (application/x-ndjson). Clients must process one JSON object per line rather than waiting for one JSON document.

Progress event:

~~~json
{
  "type": "progress",
  "stage": "Running the analyst",
  "status": "active",
  "detail": "Executing the requested analysis"
}
~~~

Final event, abbreviated:

~~~json
{
  "type": "result",
  "data": {
    "status": "success",
    "answer": "...",
    "metrics": [],
    "result_table": []
  }
}
~~~

data.status may be:

- success: evidence-supported result.
- cannot_answer: required fields or adequate evidence are unavailable.
- error: analysis could not complete.

An analysis-level cannot_answer is a valid streamed response, not an HTTP transport failure.

## Error responses

| Status | Meaning |
| --- | --- |
| 401 | Missing or invalid X-PitchQuery-Secret. |
| 404 | Requested dataset is unknown. |
| 422 | Request body fails schema validation. |
| 503 | Required production storage or service configuration is unavailable. |

Do not retry 401 or 422 without correcting the request. A transient 503 may be retried after verifying configuration and service status.
