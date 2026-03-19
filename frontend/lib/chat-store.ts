import { create } from 'zustand'
import { Session, Message, Template, Visualization, ChartData, TableData, CardsData, TextData, DashboardWidget, WidgetSize, WIDGET_SIZE_CONFIG } from './types'
import {
  fetchSessions,
  fetchSession,
  createSession,
  deleteSession,
  renameSession,
  saveWidgetLayouts,
  fetchTemplates,
  sendMessageStream,
  SavedWidgetLayout,
  DashboardWidgetContext,
} from './api'

interface ChatStore {
  // State
  sessions: Session[]
  currentSession: Session | null
  messages: Message[]
  templates: Template[]
  isLoading: boolean
  isSending: boolean
  isStreaming: boolean
  showChat: boolean
  showDashboard: boolean
  dashboardWidgets: DashboardWidget[]
  /** Widget to swap out once the LLM delivers a visualization to replace it. */
  pendingReplacement: { widgetId: string; x: number; y: number; w: number } | null
  /** Per-session widget cache so positions/sizes survive session switches */
  _sessionWidgetCache: Record<string, DashboardWidget[]>

  // Actions
  loadSessions: () => Promise<void>
  loadSession: (id: string) => Promise<void>
  loadTemplates: () => Promise<void>
  createNewSession: () => Promise<void>
  deleteCurrentSession: () => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  sendUserMessage: (content: string) => Promise<void>
  setShowChat: (show: boolean) => void
  setShowDashboard: (show: boolean) => void
  clearCurrentSession: () => void

  // Dashboard widget actions
  setPendingReplacement: (replacement: { widgetId: string; x: number; y: number; w: number } | null) => void
  addWidget: (widget: DashboardWidget) => void
  removeWidget: (widgetId: string) => void
  updateWidget: (widgetId: string, update: Partial<DashboardWidget>) => void
  updateWidgetLayouts: (layouts: { id: string; layout: DashboardWidget['layout'] }[]) => void
  reorderWidgets: (widgetIds: string[]) => void
  clearNewWidgetFlags: () => void
}

function buildWidgetsFromMessages(messages: Message[]): DashboardWidget[] {
  const getDefaultSize = (type: string): WidgetSize => {
    if (type === 'cards') return 'medium'
    if (type === 'table') return 'large'
    return 'large'
  }

  const widgets: DashboardWidget[] = []

  for (const m of messages) {
    // Use the visualizations array if available, fall back to single visualization
    const vizList = m.visualizations && m.visualizations.length > 0
      ? m.visualizations
      : m.visualization && m.visualization.type !== 'none'
        ? [m.visualization]
        : []

    vizList.forEach((vis, vizIndex) => {
      const index = widgets.length
      const size = getDefaultSize(vis.type)
      const sizeConfig = WIDGET_SIZE_CONFIG[size]
      const widgetId = vizIndex === 0
        ? `widget_${m.message_id}`
        : `widget_${m.message_id}_viz${vizIndex + 1}`
      widgets.push({
        id: widgetId,
        messageId: m.message_id,
        visualization: vis,
        size,
        layout: {
          x: (index % 2) * sizeConfig.w,
          y: Math.floor(index / 2) * sizeConfig.h,
          w: sizeConfig.w,
          h: sizeConfig.h,
        },
        queryUsed: m.query_used,
      })
    })
  }

  return widgets
}

/**
 * Rebuild widgets from messages but apply saved backend layouts where available.
 * Also restores manual widgets (text headlines, etc.) from saved layout data.
 */
function buildWidgetsFromMessagesWithLayouts(
  messages: Message[],
  savedLayouts: SavedWidgetLayout[],
): DashboardWidget[] {
  const widgets = buildWidgetsFromMessages(messages)
  if (savedLayouts.length === 0) return widgets

  const layoutMap = new Map(savedLayouts.map((l) => [l.id, l]))
  const existingIds = new Set(widgets.map((w) => w.id))

  // Apply saved positions to message-derived widgets
  const updated = widgets.map((w) => {
    const saved = layoutMap.get(w.id)
    if (!saved) return w
    return { ...w, layout: { x: saved.x, y: saved.y, w: saved.w, h: w.layout.h } }
  })

  // Restore manual widgets (text, etc.) that are not in messages
  for (const saved of savedLayouts) {
    if (existingIds.has(saved.id) || !saved.visualization_data) continue
    const vis = saved.visualization_data as Visualization
    updated.push({
      id: saved.id,
      messageId: saved.message_id,
      visualization: vis,
      size: 'medium',
      layout: { x: saved.x, y: saved.y, w: saved.w, h: 1 },
      isNew: false,
    })
  }

  return updated
}

/** Persist current widget layouts to the backend (fire-and-forget). */
function persistWidgetLayouts(sessionId: string, widgets: DashboardWidget[]) {
  const layouts = widgets.map((w) => ({
    id: w.id,
    messageId: w.messageId,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    // Persist full visualization for manual widgets (text headlines, etc.) so they survive reloads
    ...(w.messageId.startsWith('manual_') ? { visualizationData: w.visualization } : {}),
  }))
  saveWidgetLayouts(sessionId, layouts).catch(() => {})
}

function getWidgetTitle(widget: DashboardWidget): string {
  const { visualization } = widget
  if (visualization.type === 'chart') return (visualization.data as ChartData)?.title ?? ''
  if (visualization.type === 'table') return (visualization.data as TableData)?.title ?? ''
  if (visualization.type === 'cards') return (visualization.data as CardsData)?.title ?? ''
  if (visualization.type === 'text') return (visualization.data as TextData)?.title ?? 'Note'
  if (visualization.type === 'empty-diagram') return 'New Chart'
  return ''
}

function getWidgetChartType(widget: DashboardWidget): string {
  const { visualization } = widget
  if (visualization.type === 'chart') return (visualization.data as ChartData)?.chartType ?? 'chart'
  return visualization.type
}

function buildDashboardContext(widgets: DashboardWidget[]): DashboardWidgetContext[] {
  return widgets.map((w) => ({
    id: w.id,
    title: getWidgetTitle(w),
    chart_type: getWidgetChartType(w),
    position: { x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h },
  }))
}

function addVisualizationWidget(
  state: ChatStore,
  visualization: Visualization,
  messageId: string,
  queryUsed?: string | null,
  overridePosition?: { x: number; y: number; w: number } | null,
) {
  const getDefaultSize = (type: string): WidgetSize => {
    if (type === 'cards') return 'medium'
    if (type === 'table') return 'large'
    return 'large'
  }

  const size = getDefaultSize(visualization.type)
  const sizeConfig = WIDGET_SIZE_CONFIG[size]

  let layout: DashboardWidget['layout']
  if (overridePosition) {
    layout = { x: overridePosition.x, y: overridePosition.y, w: overridePosition.w, h: sizeConfig.h }
  } else {
    let maxY = 0
    state.dashboardWidgets.forEach((w) => {
      const bottomY = w.layout.y + w.layout.h
      if (bottomY > maxY) maxY = bottomY
    })
    layout = { x: 0, y: maxY, w: sizeConfig.w, h: sizeConfig.h }
  }

  return {
    id: `widget_${messageId}`,
    messageId,
    visualization,
    size,
    layout,
    queryUsed,
    isNew: true,
  } satisfies DashboardWidget
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  templates: [],
  isLoading: false,
  isSending: false,
  isStreaming: false,
  showChat: true,
  showDashboard: true,
  dashboardWidgets: [],
  pendingReplacement: null,
  _sessionWidgetCache: {},

  loadSessions: async () => {
    set({ isLoading: true })
    try {
      const sessions = await fetchSessions()
      set({ sessions })
    } catch (err) {
      console.error('Failed to load sessions:', err)
      set({ sessions: [] })
    } finally {
      set({ isLoading: false })
    }
  },

  loadSession: async (id: string) => {
    const { currentSession, dashboardWidgets } = get()

    if (currentSession && currentSession.session_id !== id) {
      set((state) => ({
        _sessionWidgetCache: {
          ...state._sessionWidgetCache,
          [currentSession.session_id]: state.dashboardWidgets,
        },
      }))
      persistWidgetLayouts(currentSession.session_id, dashboardWidgets)
    }

    set({ isLoading: true })
    try {
      const { session, messages, widgetLayouts } = await fetchSession(id)
      const cached = get()._sessionWidgetCache[id]
      const widgets = cached ?? buildWidgetsFromMessagesWithLayouts(messages, widgetLayouts)
      set({ currentSession: session, messages, dashboardWidgets: widgets })
    } catch (err) {
      console.error('Failed to load session:', err)
    } finally {
      set({ isLoading: false })
    }
  },

  loadTemplates: async () => {
    const templates = await fetchTemplates()
    set({ templates })
  },

  createNewSession: async () => {
    const { currentSession, dashboardWidgets } = get()

    if (currentSession) {
      set((state) => ({
        _sessionWidgetCache: {
          ...state._sessionWidgetCache,
          [currentSession.session_id]: state.dashboardWidgets,
        },
      }))
      persistWidgetLayouts(currentSession.session_id, dashboardWidgets)
    }

    set({ isLoading: true })
    try {
      const session = await createSession()
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSession: session,
        messages: [],
        dashboardWidgets: [],
      }))
    } finally {
      set({ isLoading: false })
    }
  },

  renameSession: async (id: string, title: string) => {
    await renameSession(id, title)
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.session_id === id ? { ...s, title } : s
      ),
      currentSession:
        state.currentSession?.session_id === id
          ? { ...state.currentSession, title }
          : state.currentSession,
    }))
  },

  deleteCurrentSession: async () => {
    const { currentSession, sessions } = get()
    if (!currentSession) return

    set({ isLoading: true })
    try {
      await deleteSession(currentSession.session_id)

      set((state) => {
        const cache = { ...state._sessionWidgetCache }
        delete cache[currentSession.session_id]
        return { _sessionWidgetCache: cache }
      })

      const remaining = sessions.filter((s) => s.session_id !== currentSession.session_id)
      set({
        sessions: remaining,
        currentSession: remaining[0] || null,
        messages: remaining[0] ? get().messages : [],
        dashboardWidgets: [],
      })
      if (remaining[0]) {
        await get().loadSession(remaining[0].session_id)
      }
    } finally {
      set({ isLoading: false })
    }
  },

  sendUserMessage: async (content: string) => {
    const { currentSession, messages } = get()
    if (!currentSession) return

    const userMessage: Message = {
      message_id: `user_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }

    set({ messages: [...messages, userMessage], isSending: true, isStreaming: true })

    // Accumulate streaming state
    let messageId = `msg_${Date.now()}`
    let fullText = ''
    const thinkingSteps: string[] = []
    let visualization: Visualization | null = null
    const allVisualizations: Visualization[] = []
    let queryUsed: string | null = null
    const followups: string[] = []
    let realSessionId: string | null = null
    let vizCounter = 0

    // Create the placeholder assistant message for streaming
    const placeholderId = messageId

    const updateAssistantMessage = () => {
      set((state) => {
        const existing = state.messages.find((m) => m.message_id === placeholderId)
        const msg: Message = {
          message_id: placeholderId,
          role: 'assistant',
          content: fullText,
          visualization,
          visualizations: allVisualizations.length > 0 ? [...allVisualizations] : undefined,
          query_used: queryUsed,
          timestamp: existing?.timestamp ?? new Date().toISOString(),
          thinking: thinkingSteps.length > 0 ? [...thinkingSteps] : undefined,
          followups: followups.length > 0 ? [...followups] : undefined,
        }
        if (existing) {
          return { messages: state.messages.map((m) => (m.message_id === placeholderId ? msg : m)) }
        }
        return { messages: [...state.messages, msg] }
      })
    }

    const dashboardCtx = buildDashboardContext(get().dashboardWidgets)

    try {
      await sendMessageStream(currentSession.session_id, content, {
        onSession: (data) => {
          messageId = data.message_id
          realSessionId = data.session_id

          // Swap temp session ID for real one from backend
          if (currentSession.session_id.startsWith('temp_') && realSessionId) {
            const oldId = currentSession.session_id
            set((state) => {
              const updatedSession = { ...currentSession, session_id: realSessionId! }
              return {
                currentSession: updatedSession,
                sessions: state.sessions.map((s) =>
                  s.session_id === oldId ? { ...s, session_id: realSessionId! } : s
                ),
              }
            })
          }
        },
        onThinking: (step) => {
          thinkingSteps.push(step)
          updateAssistantMessage()
        },
        onQuery: (query) => {
          queryUsed = query
        },
        onText: (chunk) => {
          fullText += chunk
          updateAssistantMessage()
        },
        onVisualization: (vis) => {
          visualization = vis
          allVisualizations.push(vis)
          updateAssistantMessage()

          // Add widget to dashboard with unique ID per visualization
          if (vis.type !== 'none') {
            vizCounter++
            const widgetMessageId = vizCounter === 1 ? placeholderId : `${placeholderId}_viz${vizCounter}`
            // On first viz, consume the pending replacement: remove the placeholder and land here
            const pending = vizCounter === 1 ? get().pendingReplacement : null
            const widget = addVisualizationWidget(get(), vis, widgetMessageId, queryUsed, pending)
            set((state) => ({
              dashboardWidgets: [
                ...state.dashboardWidgets.filter((w) => w.id !== pending?.widgetId),
                widget,
              ],
              pendingReplacement: null,
            }))
          }
        },
        onRemoveWidget: (widgetId) => {
          set((state) => ({
            dashboardWidgets: state.dashboardWidgets.filter((w) => w.id !== widgetId),
          }))
        },
        onReorderDashboard: (widgetIds) => {
          set((state) => {
            const widgetMap = new Map(state.dashboardWidgets.map((w) => [w.id, w]))
            const reordered: DashboardWidget[] = []
            for (const id of widgetIds) {
              const w = widgetMap.get(id)
              if (w) reordered.push(w)
            }
            // Append any widgets not in the list (newly added during this stream)
            for (const w of state.dashboardWidgets) {
              if (!widgetIds.includes(w.id)) reordered.push(w)
            }
            // Reflow positions
            const reflowed = reordered.map((w, i) => ({
              ...w,
              layout: {
                ...w.layout,
                x: (i % 2) * w.layout.w,
                y: Math.floor(i / 2) * w.layout.h,
              },
            }))
            return { dashboardWidgets: reflowed }
          })
        },
        onFollowups: (suggestions) => {
          followups.push(...suggestions)
          updateAssistantMessage()
        },
        onError: (error) => {
          fullText += `\n\n*Error: ${error}*`
          updateAssistantMessage()
        },
        onDone: () => {
          // Final update with all accumulated data
          updateAssistantMessage()

          // Clear new-widget highlights after 4 seconds
          setTimeout(() => get().clearNewWidgetFlags(), 4000)

          // Auto-title: use first user message as session title
          const state = get()
          if (state.currentSession && !state.currentSession.title?.trim() || state.currentSession?.title === 'New Analysis') {
            const title = content.slice(0, 60)
            set((s) => ({
              currentSession: s.currentSession ? { ...s.currentSession, title } : null,
              sessions: s.sessions.map((sess) =>
                sess.session_id === s.currentSession?.session_id ? { ...sess, title } : sess
              ),
            }))
          }
        },
      }, dashboardCtx)
    } catch (err) {
      console.error('Stream error:', err)
      fullText += '\n\n*Failed to connect to the server. Please check that the backend is running.*'
      updateAssistantMessage()
    } finally {
      set({ isSending: false, isStreaming: false })
    }
  },

  setShowChat: (show: boolean) => set({ showChat: show }),

  setShowDashboard: (show: boolean) => set({ showDashboard: show }),

  clearCurrentSession: () => set({ currentSession: null, messages: [], dashboardWidgets: [] }),

  setPendingReplacement: (replacement) => set({ pendingReplacement: replacement }),

  addWidget: (widget: DashboardWidget) =>
    set((state) => ({ dashboardWidgets: [...state.dashboardWidgets, widget] })),

  removeWidget: (widgetId: string) =>
    set((state) => ({
      dashboardWidgets: state.dashboardWidgets.filter((w) => w.id !== widgetId),
    })),

  updateWidget: (widgetId: string, update: Partial<DashboardWidget>) =>
    set((state) => ({
      dashboardWidgets: state.dashboardWidgets.map((w) =>
        w.id === widgetId ? { ...w, ...update } : w
      ),
    })),

  updateWidgetLayouts: (layouts: { id: string; layout: DashboardWidget['layout'] }[]) =>
    set((state) => {
      const updated = state.dashboardWidgets.map((w) => {
        const layoutUpdate = layouts.find((l) => l.id === w.id)
        return layoutUpdate ? { ...w, layout: layoutUpdate.layout } : w
      })
      const sid = state.currentSession?.session_id
      const newCache = sid
        ? { ...state._sessionWidgetCache, [sid]: updated }
        : state._sessionWidgetCache
      return { dashboardWidgets: updated, _sessionWidgetCache: newCache }
    }),

  reorderWidgets: (widgetIds: string[]) =>
    set((state) => {
      const widgetMap = new Map(state.dashboardWidgets.map((w) => [w.id, w]))
      const reordered = widgetIds
        .map((id) => widgetMap.get(id))
        .filter((w): w is DashboardWidget => w !== undefined)
      return { dashboardWidgets: reordered }
    }),

  clearNewWidgetFlags: () =>
    set((state) => ({
      dashboardWidgets: state.dashboardWidgets.map((w) =>
        w.isNew ? { ...w, isNew: false } : w
      ),
    })),
}))
