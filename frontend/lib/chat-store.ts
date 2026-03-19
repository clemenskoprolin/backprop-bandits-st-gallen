import { create } from 'zustand'
import { Session, Message, Template, DashboardWidget, WidgetSize, WIDGET_SIZE_CONFIG } from './types'
import {
  fetchSessions,
  fetchSession,
  createSession,
  deleteSession,
  renameSession,
  fetchTemplates,
  sendMessage,
} from './mock-data'

interface ChatStore {
  // State
  sessions: Session[]
  currentSession: Session | null
  messages: Message[]
  templates: Template[]
  isLoading: boolean
  isSending: boolean
  showChat: boolean
  showDashboard: boolean
  dashboardWidgets: DashboardWidget[]
  
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
  addWidget: (widget: DashboardWidget) => void
  removeWidget: (widgetId: string) => void
  updateWidgetLayouts: (layouts: { id: string; layout: DashboardWidget['layout'] }[]) => void
  reorderWidgets: (widgetIds: string[]) => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  templates: [],
  isLoading: false,
  isSending: false,
  showChat: true,
  showDashboard: true,
  dashboardWidgets: [],

  loadSessions: async () => {
    set({ isLoading: true })
    try {
      const sessions = await fetchSessions()
      set({ sessions })
    } finally {
      set({ isLoading: false })
    }
  },

  loadSession: async (id: string) => {
    set({ isLoading: true })
    try {
      const { session, messages } = await fetchSession(id)
      
      // Convert messages with visualizations to dashboard widgets
      // Determine size based on visualization type
      const getDefaultSize = (type: string): WidgetSize => {
        if (type === 'cards') return 'medium'
        if (type === 'table') return 'large'
        return 'large' // charts default to large
      }
      
      const widgets: DashboardWidget[] = messages
        .filter((m) => m.visualization && m.visualization.type !== 'none')
        .map((m, index) => {
          const size = getDefaultSize(m.visualization!.type)
          const sizeConfig = WIDGET_SIZE_CONFIG[size]
          return {
            id: `widget_${m.message_id}`,
            messageId: m.message_id,
            visualization: m.visualization!,
            size,
            layout: {
              x: (index % 2) * sizeConfig.w,
              y: Math.floor(index / 2) * sizeConfig.h,
              w: sizeConfig.w,
              h: sizeConfig.h,
            },
            queryUsed: m.query_used,
          }
        })
      
      set({ currentSession: session, messages, dashboardWidgets: widgets })
    } finally {
      set({ isLoading: false })
    }
  },

  loadTemplates: async () => {
    const templates = await fetchTemplates()
    set({ templates })
  },

  createNewSession: async () => {
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

    // Add user message
    const userMessage: Message = {
      message_id: `user_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }

    set({ messages: [...messages, userMessage], isSending: true })

    try {
      const response = await sendMessage(currentSession.session_id, content)
      
      const assistantMessage: Message = {
        message_id: response.message_id,
        role: 'assistant',
        content: response.text,
        visualization: response.visualization,
        query_used: response.query_used,
        timestamp: new Date().toISOString(),
        thinking: response.thinking,
        followups: response.followups,
      }

      // Add visualization to dashboard if present
      if (response.visualization && response.visualization.type !== 'none') {
        const existingWidgets = get().dashboardWidgets
        // Calculate next position
        let maxY = 0
        existingWidgets.forEach(w => {
          const bottomY = w.layout.y + w.layout.h
          if (bottomY > maxY) maxY = bottomY
        })
        
        // Determine size based on type
        const getDefaultSize = (type: string): WidgetSize => {
          if (type === 'cards') return 'medium'
          if (type === 'table') return 'large'
          return 'large'
        }
        
        const size = getDefaultSize(response.visualization.type)
        const sizeConfig = WIDGET_SIZE_CONFIG[size]
        
        const newWidget: DashboardWidget = {
          id: `widget_${response.message_id}`,
          messageId: response.message_id,
          visualization: response.visualization,
          size,
          layout: {
            x: 0,
            y: maxY,
            w: sizeConfig.w,
            h: sizeConfig.h,
          },
          queryUsed: response.query_used,
        }
        set((state) => ({
          dashboardWidgets: [...state.dashboardWidgets, newWidget],
        }))
      }
      
      set((state) => ({
        messages: [...state.messages, assistantMessage],
      }))
    } finally {
      set({ isSending: false })
    }
  },

  setShowChat: (show: boolean) => set({ showChat: show }),

  setShowDashboard: (show: boolean) => set({ showDashboard: show }),

  clearCurrentSession: () => set({ currentSession: null, messages: [], dashboardWidgets: [] }),

  addWidget: (widget: DashboardWidget) => 
    set((state) => ({ dashboardWidgets: [...state.dashboardWidgets, widget] })),

  removeWidget: (widgetId: string) =>
    set((state) => ({
      dashboardWidgets: state.dashboardWidgets.filter((w) => w.id !== widgetId),
    })),

  updateWidgetLayouts: (layouts: { id: string; layout: DashboardWidget['layout'] }[]) =>
    set((state) => ({
      dashboardWidgets: state.dashboardWidgets.map((w) => {
        const layoutUpdate = layouts.find((l) => l.id === w.id)
        return layoutUpdate ? { ...w, layout: layoutUpdate.layout } : w
      }),
    })),

  reorderWidgets: (widgetIds: string[]) =>
    set((state) => {
      const widgetMap = new Map(state.dashboardWidgets.map((w) => [w.id, w]))
      const reordered = widgetIds
        .map((id) => widgetMap.get(id))
        .filter((w): w is DashboardWidget => w !== undefined)
      return { dashboardWidgets: reordered }
    }),
}))
