'use client'

import { useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  PlusIcon,
  MessageSquareIcon,
  Trash2Icon,
  FlaskConicalIcon,
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
  SidebarMenuAction,
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
  } = useChatStore()

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

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

      <SidebarContent className="px-2">
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
                return (
                  <SidebarMenuItem key={session.session_id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => loadSession(session.session_id)}
                      className="py-3.5"
                    >
                      <MessageSquareIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-sm">{session.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })}
                        </span>
                      </div>
                    </SidebarMenuButton>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <Trash2Icon className="h-4 w-4" />
                          <span className="sr-only">Delete session</span>
                        </SidebarMenuAction>
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
