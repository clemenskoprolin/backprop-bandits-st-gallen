'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  PlusIcon,
  MessageSquareIcon,
  Trash2Icon,
  FlaskConicalIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
} from 'lucide-react'
import { useChatStore } from '@/lib/chat-store'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarFooter,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function SessionSidebar() {
  const {
    sessions,
    currentSession,
    loadSessions,
    loadSession,
    createNewSession,
    deleteCurrentSession,
    renameSession,
  } = useChatStore()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const startRename = useCallback((sessionId: string, currentTitle: string) => {
    setEditingId(sessionId)
    setEditTitle(currentTitle)
  }, [])

  const confirmRename = useCallback(async () => {
    if (editingId && editTitle.trim()) {
      await renameSession(editingId, editTitle.trim())
    }
    setEditingId(null)
    setEditTitle('')
  }, [editingId, editTitle, renameSession])

  const cancelRename = useCallback(() => {
    setEditingId(null)
    setEditTitle('')
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        confirmRename()
      } else if (e.key === 'Escape') {
        cancelRename()
      }
    },
    [confirmRename, cancelRename]
  )

  return (
    <Sidebar className="border-r border-border">
      <SidebarHeader className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <FlaskConicalIcon className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">MatTest AI</span>
            <span className="text-xs text-muted-foreground">Material Analysis</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="px-2 overflow-y-auto">
        <SidebarGroup>
          <div className="flex items-center justify-between px-3 py-1">
            <SidebarGroupLabel>Sessions</SidebarGroupLabel>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => createNewSession()}
                >
                  <PlusIcon className="h-4 w-4" />
                  <span className="sr-only">New Session</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New Session</TooltipContent>
            </Tooltip>
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {sessions.map((session) => {
                const isActive = currentSession?.session_id === session.session_id
                const isEditing = editingId === session.session_id

                return (
                  <SidebarMenuItem key={session.session_id}>
                    {isEditing ? (
                      <div className="flex items-center gap-1 px-2 py-1.5 w-full">
                        <input
                          ref={inputRef}
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={confirmRename}
                          className="flex-1 min-w-0 rounded-md border border-primary bg-background px-2 py-1.5 text-sm outline-none ring-1 ring-primary/30"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-primary hover:text-primary"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            confirmRename()
                          }}
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            cancelRename()
                          }}
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => loadSession(session.session_id)}
                          className="py-6 pr-2"
                        >
                          <MessageSquareIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                            <span className="truncate text-sm">{session.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })}
                            </span>
                          </div>
                        </SidebarMenuButton>

                        {/* Gradient fade + action buttons – revealed on hover */}
                        <div className="absolute right-0 top-0 bottom-0 flex items-center opacity-0 group-hover/menu-item:opacity-100 transition-opacity pointer-events-none">
                          {/* Gradient fade from transparent to sidebar bg */}
                          <div
                            className="w-12 h-full"
                            style={{
                              background: isActive
                                ? 'linear-gradient(to right, transparent, var(--sidebar-accent))'
                                : 'linear-gradient(to right, transparent, var(--sidebar-background, hsl(var(--sidebar-background))))',
                            }}
                          />
                          {/* Solid background behind buttons */}
                          <div
                            className="flex items-center gap-0.5 pr-1.5 h-full pointer-events-auto"
                            style={{
                              backgroundColor: isActive
                                ? 'var(--sidebar-accent)'
                                : 'var(--sidebar-background, hsl(var(--sidebar-background)))',
                            }}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startRename(session.session_id, session.title)
                                  }}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                >
                                  <PencilIcon className="h-3.5 w-3.5" />
                                  <span className="sr-only">Rename session</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right">Rename</TooltipContent>
                            </Tooltip>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                >
                                  <Trash2Icon className="h-3.5 w-3.5" />
                                  <span className="sr-only">Delete session</span>
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Session</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete &quot;{session.title}&quot;? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => {
                                      loadSession(session.session_id)
                                      deleteCurrentSession()
                                    }}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-4">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => createNewSession()}
        >
          <PlusIcon className="h-4 w-4" />
          New Analysis
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
