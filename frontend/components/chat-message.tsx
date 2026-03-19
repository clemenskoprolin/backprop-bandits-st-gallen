'use client'

import { useState } from 'react'
import {
  ThumbsUpIcon,
  ThumbsDownIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  UserIcon,
  BarChart3Icon,
} from 'lucide-react'
import { Message } from '@/lib/types'
import { submitFeedback } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface ChatMessageProps {
  message: Message
  onFollowupClick?: (followup: string) => void
}

export function ChatMessage({
  message,
  onFollowupClick,
}: ChatMessageProps) {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [copied, setCopied] = useState(false)
  const [showThinking, setShowThinking] = useState(false)

  const isUser = message.role === 'user'

  const handleFeedback = async (rating: 'up' | 'down') => {
    if (feedback === rating) {
      setFeedback(null)
      return
    }
    setFeedback(rating)
    await submitFeedback({ message_id: message.message_id, rating })
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-4',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          isUser ? 'bg-primary' : 'bg-muted'
        )}
      >
        {isUser ? (
          <UserIcon className="h-4 w-4 text-primary-foreground" />
        ) : (
          <SparklesIcon className="h-4 w-4 text-foreground" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex flex-col gap-2 max-w-[80%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Main message bubble */}
        <div
          className={cn(
            'rounded-xl px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          )}
        >
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {message.content.split('\n').map((line, i) => {
              // Handle bold text
              const parts = line.split(/(\*\*.*?\*\*)/g)
              return (
                <p key={i} className={cn('mb-2 last:mb-0', !line && 'h-4')}>
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j}>{part.slice(2, -2)}</strong>
                    }
                    return <span key={j}>{part}</span>
                  })}
                </p>
              )
            })}
          </div>
        </div>

        {/* Thinking steps (for assistant messages) */}
        {!isUser && message.thinking && message.thinking.length > 0 && (
          <Collapsible open={showThinking} onOpenChange={setShowThinking}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showThinking ? (
                  <ChevronUpIcon className="h-3 w-3" />
                ) : (
                  <ChevronDownIcon className="h-3 w-3" />
                )}
                {showThinking ? 'Hide' : 'Show'} reasoning steps
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-lg border border-border bg-card p-3">
                <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                  {message.thinking.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Visualization indicator - shows that a chart was added to dashboard */}
        {!isUser && message.visualization && message.visualization.type !== 'none' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <BarChart3Icon className="h-4 w-4 text-primary" />
            <span>Visualization added to dashboard</span>
          </div>
        )}

        {/* Follow-up suggestions */}
        {!isUser && message.followups && message.followups.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.followups.map((followup, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer hover:bg-muted transition-colors text-xs font-normal"
                onClick={() => onFollowupClick?.(followup)}
              >
                {followup}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions (for assistant messages) */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7',
                feedback === 'up' && 'text-green-500 bg-green-500/10'
              )}
              onClick={() => handleFeedback('up')}
            >
              <ThumbsUpIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7',
                feedback === 'down' && 'text-red-500 bg-red-500/10'
              )}
              onClick={() => handleFeedback('down')}
            >
              <ThumbsDownIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
