const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.json()

  const backendRes = await fetch(`${BACKEND_URL}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!backendRes.ok) {
    return new Response(await backendRes.text(), { status: backendRes.status })
  }

  if (!backendRes.body) {
    return new Response('No response body from backend', { status: 502 })
  }

  return new Response(backendRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
