'use client'

import { useEffect, useRef } from 'react'
import {
  Loader2Icon,
  SparklesIcon,
  MessageSquareIcon,
  LayoutDashboardIcon,
  PanelLeftCloseIcon,
  PanelRightCloseIcon,
  EyeOffIcon,
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

export function ChatContainer() {
  const {
    currentSession,
    messages,
    isLoading,
    isSending,
    showChat,
    showDashboard,
    dashboardWidgets,
    sendUserMessage,
    setShowChat,
    setShowDashboard,
  } = useChatStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = (content: string) => {
    sendUserMessage(content)
  }

  const handleFollowupClick = (followup: string) => {
    sendUserMessage(followup)
  }

  const hasMessages = messages.length > 0
  const hasWidgets = dashboardWidgets.length > 0

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

  // Both panels hidden - show a centered message
  if (!showChat && !showDashboard) {
    return (
      <div className="flex h-full items-center justify-center gap-4 bg-background">
        <Button variant="outline" onClick={() => setShowChat(true)} className="gap-2">
          <MessageSquareIcon className="h-4 w-4" />
          Show Chat
        </Button>
        {hasWidgets && (
          <Button variant="outline" onClick={() => setShowDashboard(true)} className="gap-2">
            <LayoutDashboardIcon className="h-4 w-4" />
            Show Dashboard
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Chat Section */}
      {showChat && (
        <div
          className={cn(
            'flex flex-col h-full',
            showDashboard && hasWidgets ? 'w-[45%] min-w-[380px] border-r border-border' : 'flex-1'
          )}
        >
          {/* Header */}
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
              {/* Toggle dashboard button */}
              {hasWidgets && (
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
              )}
              {/* Hide chat button - only when dashboard is visible */}
              {showDashboard && hasWidgets && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowChat(false)}
                    >
                      <EyeOffIcon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Hide Chat</TooltipContent>
                </Tooltip>
              )}
            </div>
          </header>

          {/* Messages Area */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {!hasMessages ? (
              <EmptyState onSuggestionClick={handleSend} />
            ) : (
              <ScrollArea className="h-full" ref={scrollRef}>
                <div className="mx-auto max-w-3xl py-4">
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.message_id}
                      message={message}
                      onFollowupClick={handleFollowupClick}
                    />
                  ))}
                  {isSending && (
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

          {/* Input */}
          <div className="shrink-0 border-t border-border">
            <ChatInput onSend={handleSend} isSending={isSending} />
          </div>
        </div>
      )}

      {/* Dashboard Panel */}
      {showDashboard && hasWidgets && (
        <div className={cn('flex-1 min-w-0 h-full', !showChat && 'w-full')}>
          <DashboardPanel
            showChat={showChat}
            onToggleChat={() => setShowChat(!showChat)}
          />
        </div>
      )}

      {/* Mobile FAB when chat is hidden */}
      {!showChat && hasWidgets && (
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
