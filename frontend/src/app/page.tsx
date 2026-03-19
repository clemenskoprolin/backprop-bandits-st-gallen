'use client'

import { useEffect, useState, useRef } from 'react'
import { useChatStore } from '@/lib/chat-store'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { SessionSidebar } from '@/components/session-sidebar'
import { ChatContainer } from '@/components/chat-container'

export default function Home() {
  const { sessions, currentSession, dashboardWidgets, loadSessions, loadSession, createNewSession } = useChatStore()
  const [initialized, setInitialized] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const prevWidgetCount = useRef<number | null>(null)
  const currentSessionId = useRef<string | null>(null)

  useEffect(() => {
    const init = async () => {
      await loadSessions()
      setInitialized(true)
    }
    init()
  }, [loadSessions])

  // Load first session when sessions are loaded and no current session
  useEffect(() => {
    if (initialized && sessions.length > 0 && !currentSession) {
      loadSession(sessions[0].session_id)
    }
  }, [sessions, currentSession, loadSession, initialized])

  // Auto-create session if none exist after initialization
  useEffect(() => {
    if (initialized && sessions.length === 0 && !currentSession) {
      createNewSession()
    }
  }, [initialized, sessions, currentSession, createNewSession])

  // Reset widget count tracking when session changes
  useEffect(() => {
    if (currentSession?.session_id !== currentSessionId.current) {
      currentSessionId.current = currentSession?.session_id ?? null
      // Set to current widget count so we only track NEW widgets from here
      prevWidgetCount.current = dashboardWidgets.length
    }
  }, [currentSession?.session_id, dashboardWidgets.length])

  // Track widget count changes (no auto-collapse since dashboard is always visible)
  useEffect(() => {
    prevWidgetCount.current = dashboardWidgets.length
  }, [dashboardWidgets.length])

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <SessionSidebar />
      <SidebarInset className="flex h-dvh flex-col overflow-hidden">
        <ChatContainer />
      </SidebarInset>
    </SidebarProvider>
  )
}
