'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  Loader2Icon,
  SparklesIcon,
  MessageSquareIcon,
  LayoutDashboardIcon,
  PanelRightCloseIcon,
  GripVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  PaperclipIcon,
} from 'lucide-react'
import { useChatStore } from '@/lib/chat-store'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChatMessage } from './chat-message'
import { ChatInput } from './chat-input'
import { EmptyState } from './empty-state'
import { DashboardPanel } from './dashboard-panel'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { uploadPdf } from '@/lib/api'

const COLLAPSE_LEFT = 0.15
const COLLAPSE_RIGHT = 0.85
const SNAP_HALF_RANGE = 0.04

function resolveRelease(fraction: number): { action: 'collapse-chat' | 'collapse-dashboard' | 'set'; value: number } {
  if (fraction < COLLAPSE_LEFT) return { action: 'collapse-chat', value: 0.5 }
  if (fraction > COLLAPSE_RIGHT) return { action: 'collapse-dashboard', value: 0.5 }
  if (Math.abs(fraction - 0.5) < SNAP_HALF_RANGE) return { action: 'set', value: 0.5 }
  return { action: 'set', value: fraction }
}

type DragMode = 'split' | 'restore-chat' | 'restore-dashboard' | null

export function ChatContainer() {
  const {
    currentSession,
    messages,
    isLoading,
    isSending,
    isStreaming,
    showChat,
    showDashboard,
    dashboardWidgets,
    sendUserMessage,
    setShowChat,
    setShowDashboard,
  } = useChatStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [splitFraction, setSplitFraction] = useState(2 / 3)
  const [rawFraction, setRawFraction] = useState(2 / 3)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadToast, setUploadToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const hasMessages = messages.length > 0
  const hasWidgets = dashboardWidgets.length > 0
  const bothVisible = showChat && showDashboard
  const isDragging = dragMode !== null

  const dragIntent = useMemo(() => {
    if (!isDragging) return null
    return resolveRelease(rawFraction)
  }, [isDragging, rawFraction])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = (content: string) => {
    sendUserMessage(content)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (!file) return
    const sid = currentSession?.session_id ?? `temp_${Date.now()}`
    try {
      await uploadPdf(file, sid)
      setUploadToast({ message: `"${file.name}" ingested into knowledge base`, type: 'success' })
    } catch {
      setUploadToast({ message: `Failed to ingest "${file.name}"`, type: 'error' })
    }
    setTimeout(() => setUploadToast(null), 3500)
  }

  const handleFollowupClick = (followup: string) => {
    sendUserMessage(followup)
  }

  // ── Unified drag: pointermove/up on window so we never lose tracking ──

  const fractionFromEvent = useCallback((e: PointerEvent | React.PointerEvent) => {
    if (!containerRef.current) return 0.5
    const rect = containerRef.current.getBoundingClientRect()
    const f = (e.clientX - rect.left) / rect.width
    return Math.max(0.04, Math.min(0.96, f))
  }, [])

  // Global handlers attached/detached via useEffect
  const dragModeRef = useRef<DragMode>(null)
  const rawFractionRef = useRef(2 / 3)
  const dragMovedRef = useRef(false)

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragModeRef.current) return
    dragMovedRef.current = true
    const f = fractionFromEvent(e)
    rawFractionRef.current = f
    setRawFraction(f)
    setSplitFraction(f)
  }, [fractionFromEvent])

  const onPointerUp = useCallback(() => {
    const mode = dragModeRef.current
    if (!mode) return
    const moved = dragMovedRef.current
    const f = rawFractionRef.current
    const result = resolveRelease(f)

    if (mode === 'split') {
      if (result.action === 'collapse-chat') {
        setShowChat(false)
        setSplitFraction(0.5)
      } else if (result.action === 'collapse-dashboard') {
        setShowDashboard(false)
        setSplitFraction(0.5)
      } else {
        setSplitFraction(result.value)
      }
    } else if (mode === 'restore-chat') {
      if (!moved) {
        // Click without dragging — restore at 50/50
        setShowChat(true)
        setShowDashboard(true)
        setSplitFraction(0.5)
      } else if (f > COLLAPSE_LEFT) {
        setShowChat(true)
        setShowDashboard(true)
        setSplitFraction(result.action === 'set' ? result.value : 0.5)
      } else {
        // Dragged but stayed in collapse zone — reset
        setSplitFraction(0.5)
      }
    } else if (mode === 'restore-dashboard') {
      if (!moved) {
        // Click without dragging — restore at 50/50
        setShowChat(true)
        setShowDashboard(true)
        setSplitFraction(0.5)
      } else if (f < COLLAPSE_RIGHT) {
        setShowChat(true)
        setShowDashboard(true)
        setSplitFraction(result.action === 'set' ? result.value : 0.5)
      } else {
        // Dragged but stayed in collapse zone — reset
        setSplitFraction(0.5)
      }
    }

    dragModeRef.current = null
    dragMovedRef.current = false
    setDragMode(null)
  }, [setShowChat, setShowDashboard])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  const startDrag = useCallback((mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault()
    const f = fractionFromEvent(e)
    dragModeRef.current = mode
    rawFractionRef.current = f
    dragMovedRef.current = false
    setDragMode(mode)
    setRawFraction(f)
    if (mode === 'restore-chat') {
      setSplitFraction(0.04)
    } else if (mode === 'restore-dashboard') {
      setSplitFraction(0.96)
    }
  }, [fractionFromEvent])

  // Loading skeleton
  if (isLoading && !currentSession) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <SidebarTrigger />
          <Skeleton className="h-6 w-48" />
        </header>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2Icon className="h-5 w-5 animate-spin" />
            <span>Loading session...</span>
          </div>
        </div>
      </div>
    )
  }

  // Both panels hidden
  if (!showChat && !showDashboard) {
    return (
      <div className="flex h-full items-center justify-center gap-4 bg-background">
        <Button variant="outline" onClick={() => setShowChat(true)} className="gap-2">
          <MessageSquareIcon className="h-4 w-4" />
          Show Chat
        </Button>
        <Button variant="outline" onClick={() => setShowDashboard(true)} className="gap-2">
          <LayoutDashboardIcon className="h-4 w-4" />
          Show Dashboard
        </Button>
      </div>
    )
  }

  const showingEdgeDrag = dragMode === 'restore-chat' || dragMode === 'restore-dashboard'
  const chatWidthStyle = bothVisible || showingEdgeDrag
    ? { width: `${splitFraction * 100}%`, minWidth: 280 }
    : undefined

  return (
    <div
      ref={containerRef}
      className={cn('relative flex h-full overflow-hidden', isDragging && 'select-none cursor-col-resize')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── PDF drag-and-drop overlay ── */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/90 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg pointer-events-none">
          <PaperclipIcon className="h-10 w-10 text-primary" />
          <p className="text-lg font-semibold text-primary">Drop PDF to ingest</p>
          <p className="text-sm text-muted-foreground">The document will be added to the session knowledge base</p>
        </div>
      )}

      {/* ── Upload toast notification ── */}
      {uploadToast && (
        <div className={cn(
          'absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg',
          uploadToast.type === 'success' ? 'bg-green-600 text-white' : 'bg-destructive text-destructive-foreground'
        )}>
          {uploadToast.message}
        </div>
      )}
      {/* ── Collapse overlays (only when dragging the main splitter, not when restoring) ── */}
      {dragMode === 'split' && dragIntent?.action === 'collapse-chat' && (
        <div
          className="absolute inset-y-0 left-0 z-30 flex items-center justify-center bg-destructive/10 backdrop-blur-sm border-r-2 border-destructive/40"
          style={{ width: `${splitFraction * 100}%` }}
        >
          <div className="flex flex-col items-center gap-2 text-destructive/70">
            <XIcon className="h-6 w-6" />
            <span className="text-sm font-medium">Close Chat</span>
          </div>
        </div>
      )}
      {dragMode === 'split' && dragIntent?.action === 'collapse-dashboard' && (
        <div
          className="absolute inset-y-0 right-0 z-30 flex items-center justify-center bg-destructive/10 backdrop-blur-sm border-l-2 border-destructive/40"
          style={{ width: `${(1 - splitFraction) * 100}%` }}
        >
          <div className="flex flex-col items-center gap-2 text-destructive/70">
            <XIcon className="h-6 w-6" />
            <span className="text-sm font-medium">Close Dashboard</span>
          </div>
        </div>
      )}

      {/* ── Edge handle: restore chat (left side) — click or drag ── */}
      {!showChat && showDashboard && !isDragging && (
        <div
          className="w-8 shrink-0 cursor-pointer bg-muted/50 hover:bg-muted transition-colors z-20 flex flex-col items-center justify-center gap-1 border-r border-border"
          onPointerDown={(e) => startDrag('restore-chat', e)}
        >
          <ChevronRightIcon className="h-4 w-4 text-muted-foreground pointer-events-none" />
          <span className="text-[10px] text-muted-foreground [writing-mode:vertical-lr] rotate-180 pointer-events-none">Chat</span>
        </div>
      )}

      {/* ── Chat Section ── */}
      {(showChat || dragMode === 'restore-chat') && (
        <div
          className={cn('flex flex-col h-full shrink-0', !bothVisible && !showingEdgeDrag && 'flex-1')}
          style={chatWidthStyle}
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-foreground truncate">
                {currentSession?.title || 'New Analysis'}
              </h1>
              {currentSession && (
                <p className="text-xs text-muted-foreground">
                  {messages.length} message{messages.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowDashboard(!showDashboard)}
                  >
                    {showDashboard ? (
                      <PanelRightCloseIcon className="h-4 w-4" />
                    ) : (
                      <LayoutDashboardIcon className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showDashboard ? 'Hide Dashboard' : 'Show Dashboard'}</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-hidden">
            {!hasMessages ? (
              <EmptyState onSuggestionClick={handleSend} />
            ) : (
              <ScrollArea className="h-full" ref={scrollRef}>
                <div className="mx-auto max-w-3xl py-4">
                  {messages.map((message, index) => (
                    <ChatMessage
                      key={message.message_id}
                      message={message}
                      isActivelyStreaming={
                        isStreaming &&
                        message.role === 'assistant' &&
                        index === messages.length - 1
                      }
                      onFollowupClick={handleFollowupClick}
                    />
                  ))}
                  {isSending && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                    <div className="flex items-center gap-3 px-4 py-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                        <SparklesIcon className="h-4 w-4 animate-pulse text-primary" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-foreground">Analyzing your query...</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="animate-pulse">Processing</span>
                          <span className="inline-flex gap-1">
                            <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                            <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                            <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="shrink-0 border-t border-border">
            <ChatInput onSend={handleSend} isSending={isSending} sessionId={currentSession?.session_id ?? null} />
          </div>
        </div>
      )}

      {/* ── Resizable Splitter (both panels visible) ── */}
      {bothVisible && !showingEdgeDrag && (
        <div
          className={cn(
            'relative z-20 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center',
            'bg-border transition-colors',
            isDragging ? 'bg-primary/50' : 'hover:bg-primary/30'
          )}
          onPointerDown={(e) => startDrag('split', e)}
        >
          <GripVerticalIcon className="h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      )}

      {/* ── Dashboard Panel ── */}
      {(showDashboard || dragMode === 'restore-dashboard') && (
        <div className={cn('flex-1 min-w-0 h-full overflow-hidden')}>
          <DashboardPanel
            showChat={showChat}
            onToggleChat={() => setShowChat(!showChat)}
          />
        </div>
      )}

      {/* ── Edge handle: restore dashboard (right side) — click or drag ── */}
      {!showDashboard && showChat && !isDragging && (
        <div
          className="w-8 shrink-0 cursor-pointer bg-muted/50 hover:bg-muted transition-colors z-20 flex flex-col items-center justify-center gap-1 border-l border-border"
          onPointerDown={(e) => startDrag('restore-dashboard', e)}
        >
          <ChevronLeftIcon className="h-4 w-4 text-muted-foreground pointer-events-none" />
          <span className="text-[10px] text-muted-foreground [writing-mode:vertical-lr] pointer-events-none">Dashboard</span>
        </div>
      )}

      {/* Mobile FAB when chat is hidden */}
      {!showChat && (
        <Button
          variant="default"
          size="icon"
          className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg lg:hidden z-50"
          onClick={() => setShowChat(true)}
        >
          <MessageSquareIcon className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
}
