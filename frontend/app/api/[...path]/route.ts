const ALLOWED_ENDPOINTS = new Set(["chat", "datasets", "health"]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: Context) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return Response.json({ detail: "Not found." }, { status: 404 });
  }

  const apiUrl = process.env.PITCHQUERY_API_URL;
  const apiSecret = process.env.PITCHQUERY_API_SECRET;
  if (!apiUrl || !apiSecret) {
    return Response.json({ detail: "The protected API relay is not configured." }, { status: 503 });
  }

  const payload = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.arrayBuffer();
  const headers = new Headers({ "X-PitchQuery-Secret": apiSecret });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  const upstream = await fetch(new URL(`/api/${endpoint}`, apiUrl), {
    method: request.method,
    headers,
    body: payload?.byteLength ? payload : undefined,
    cache: "no-store",
  });
  const responseHeaders = new Headers({ "Cache-Control": "no-store" });
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("Content-Type", upstreamType);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: Context) {
  return forward(request, context);
}

export async function POST(request: Request, context: Context) {
  return forward(request, context);
}
