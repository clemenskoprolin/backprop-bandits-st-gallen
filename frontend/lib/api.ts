import { Session, Message, Visualization, Template, ChartData } from './types'
import { mockTemplates } from './mock-data'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Visualization normalization
// ---------------------------------------------------------------------------

const SUPPORTED_CHART_TYPES = new Set(['bar', 'line', 'area', 'pie', 'radar', 'radial', 'boxplot'])
const LABEL_KEYS = new Set(['name', 'label', 'category', 'group', 'month', 'date', 'material'])

/**
 * Transform backend visualization payload into the frontend Visualization shape.
 * Backend sends: { type, data: { chart_type, title, x_label, y_label, series: <raw data array> } }
 * Frontend expects: { type, data: ChartData | TableData | CardsData }
 */
export function normalizeVisualization(raw: unknown): Visualization | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const type = obj.type as string
  if (!type || type === 'none') return null

  const data = (obj.data ?? {}) as Record<string, unknown>

  if (type === 'chart') {
    const rawChartType = (data.chart_type ?? data.chartType ?? 'bar') as string
    const chartType = SUPPORTED_CHART_TYPES.has(rawChartType) ? rawChartType : 'bar'

    // Backend puts the data array in "series"; frontend expects it in "data"
    // with "series" being metadata about which keys to plot.
    let dataPoints = (data.data ?? data.series ?? []) as Record<string, unknown>[]
    if (!Array.isArray(dataPoints)) dataPoints = []

    let seriesMeta = data.series_meta as { key: string; label: string; color?: string }[] | undefined

    // If data.data and data.series both exist and series is already metadata, use as-is
    if (Array.isArray(data.data) && Array.isArray(data.series) && data.series.length > 0) {
      const first = data.series[0] as Record<string, unknown>
      if (typeof first === 'object' && 'key' in first && 'label' in first) {
        dataPoints = data.data as Record<string, unknown>[]
        seriesMeta = data.series as { key: string; label: string; color?: string }[]
      }
    }

    // Auto-generate series metadata if not provided
    if (!seriesMeta && dataPoints.length > 0) {
      const sample = dataPoints[0]
      const numericKeys = Object.keys(sample).filter(
        (k) => !LABEL_KEYS.has(k.toLowerCase()) && typeof sample[k] === 'number'
      )
      seriesMeta = numericKeys.map((k, i) => ({
        key: k,
        label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
        color: `var(--chart-${i + 1})`,
      }))
    }

    // Pass through chartConfig from backend if available
    const chartConfig = data.chartConfig as Record<string, { label: string; color?: string }> | undefined

    return {
      type: 'chart',
      data: {
        chartType: chartType as ChartData['chartType'],
        title: (data.title ?? '') as string,
        description: (data.description ?? '') as string,
        xAxisKey: (data.xAxisKey ?? data.x_axis_key ?? '') as string,
        xAxis: (data.x_label ?? data.xAxis ?? '') as string,
        yAxis: (data.y_label ?? data.yAxis ?? '') as string,
        data: dataPoints as Record<string, string | number>[],
        series: seriesMeta ?? [],
        chartConfig,
      },
    }
  }

  if (type === 'table') {
    return { type: 'table', data: data as unknown as import('./types').TableData }
  }

  if (type === 'cards') {
    return { type: 'cards', data: data as unknown as import('./types').CardsData }
  }

  return null
}

/**
 * Ensure backend message content is always a string.
 * The backend may return Union[str, list].
 */
function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block
        if (typeof block === 'object' && block !== null) {
          return (block as Record<string, unknown>).text ?? JSON.stringify(block)
        }
        return String(block)
      })
      .join('')
  }
  return String(content ?? '')
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function fetchSessions(): Promise<Session[]> {
  const data = await apiFetch<{ sessions: Session[]; schema?: unknown }>('/api/sessions')
  return data.sessions
}

export async function fetchSession(
  id: string
): Promise<{ session: Session; messages: Message[] }> {
  const raw = await apiFetch<Record<string, unknown>>(`/api/sessions/${id}`)

  const messages = ((raw.messages ?? []) as Record<string, unknown>[]).map((m) => ({
    message_id: m.message_id as string,
    role: m.role as 'user' | 'assistant',
    content: normalizeContent(m.content),
    visualization: m.visualization ? normalizeVisualization(m.visualization) : undefined,
    query_used: (m.query_used as string | null) ?? undefined,
    timestamp: (m.timestamp as string) ?? new Date().toISOString(),
    thinking: m.thinking as string[] | undefined,
    followups: m.followups as string[] | undefined,
  }))

  const session: Session = {
    session_id: raw.session_id as string,
    title: (raw.title as string) ?? messages[0]?.content?.slice(0, 60) ?? 'Untitled',
    updated_at: (raw.updated_at as string) ?? new Date().toISOString(),
    message_count: messages.length,
  }

  return { session, messages }
}

/**
 * No backend route for explicit session creation -- sessions are created
 * implicitly on the first chat message. Return a local stub; the real
 * session_id comes back from the `session` SSE event.
 */
export async function createSession(): Promise<Session> {
  return {
    session_id: `temp_${Date.now()}`,
    title: 'New Analysis',
    updated_at: new Date().toISOString(),
    message_count: 0,
  }
}

export async function deleteSession(id: string): Promise<void> {
  if (id.startsWith('temp_')) return
  await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' })
}

export async function renameSession(id: string, title: string): Promise<void> {
  if (id.startsWith('temp_')) return
  await apiFetch(`/api/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

export async function saveWidgetLayouts(
  sessionId: string,
  layouts: { id: string; messageId: string; x: number; y: number; w: number; h: number }[]
): Promise<void> {
  if (sessionId.startsWith('temp_')) return
  await apiFetch(`/api/sessions/${sessionId}/widgets`, {
    method: 'PUT',
    body: JSON.stringify({
      layouts: layouts.map((l) => ({
        id: l.id,
        message_id: l.messageId,
        x: l.x,
        y: l.y,
        w: l.w,
      })),
    }),
  })
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export async function submitFeedback(payload: {
  message_id: string
  session_id: string
  rating: 'up' | 'down'
  comment?: string
}): Promise<void> {
  await apiFetch('/api/feedback', {
    method: 'POST',
    body: JSON.stringify({
      message_id: payload.message_id,
      session_id: payload.session_id,
      rating: payload.rating === 'up' ? 'thumbs_up' : 'thumbs_down',
      comment: payload.comment,
    }),
  })
}

// ---------------------------------------------------------------------------
// Templates (frontend-only, no backend call)
// ---------------------------------------------------------------------------

export async function fetchTemplates(): Promise<Template[]> {
  return mockTemplates
}

// ---------------------------------------------------------------------------
// SSE Streaming Chat
// ---------------------------------------------------------------------------

export interface StreamCallbacks {
  onSession?: (data: { session_id: string; message_id: string }) => void
  onThinking?: (step: string) => void
  onQuery?: (query: string) => void
  onText?: (chunk: string) => void
  onVisualization?: (visualization: Visualization) => void
  onFollowups?: (suggestions: string[]) => void
  onError?: (error: string) => void
  onDone?: () => void
}

export async function sendMessageStream(
  sessionId: string | null,
  message: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_id: sessionId?.startsWith('temp_') ? null : sessionId,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    callbacks.onError?.(`API ${res.status}: ${body}`)
    callbacks.onDone?.()
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    callbacks.onError?.('No response body')
    callbacks.onDone?.()
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let doneEmitted = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE frames: "event: <type>\ndata: <json>\n\n"
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        if (!frame.trim()) continue

        let eventType = ''
        let eventData = ''

        for (const line of frame.split('\n')) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6)
          }
        }

        if (!eventType || !eventData) continue

        try {
          const parsed = JSON.parse(eventData)

          switch (eventType) {
            case 'session':
              callbacks.onSession?.(parsed)
              break
            case 'thinking':
              callbacks.onThinking?.(parsed.step)
              break
            case 'query':
              callbacks.onQuery?.(parsed.query_used)
              break
            case 'text':
              callbacks.onText?.(parsed.chunk)
              break
            case 'visualization': {
              const vis = normalizeVisualization(parsed)
              if (vis) callbacks.onVisualization?.(vis)
              break
            }
            case 'followups':
              callbacks.onFollowups?.(parsed.suggestions ?? [])
              break
            case 'error':
              callbacks.onError?.(parsed.message ?? 'Unknown error')
              break
            case 'done':
              if (!doneEmitted) {
                doneEmitted = true
                callbacks.onDone?.()
              }
              break
          }
        } catch {
          // Skip malformed JSON frames
        }
      }
    }
  } finally {
    reader.releaseLock()
    if (!doneEmitted) {
      callbacks.onDone?.()
    }
  }
}
