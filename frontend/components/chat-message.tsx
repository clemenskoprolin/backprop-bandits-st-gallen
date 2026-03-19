'use client'

import {
  useState,
  useEffect,
  useRef,
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
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
  DatabaseIcon,
  FileTextIcon,
} from 'lucide-react'
import { Message } from '@/lib/types'
import { submitFeedback } from '@/lib/api'
import { useChatStore } from '@/lib/chat-store'
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
  isActivelyStreaming?: boolean
  onFollowupClick?: (followup: string) => void
}

// ---------------------------------------------------------------------------
// Progressive text reveal hook
// ---------------------------------------------------------------------------

function useAnimatedText(text: string, animate: boolean): string {
  const [displayed, setDisplayed] = useState(text)
  const targetRef = useRef(text)
  const lenRef = useRef(text.length)

  targetRef.current = text

  useEffect(() => {
    if (!animate) {
      lenRef.current = text.length
      setDisplayed(text)
    }
  }, [text, animate])

  useEffect(() => {
    if (!animate) return

    let active = true
    const tick = () => {
      if (!active) return
      const target = targetRef.current
      if (lenRef.current < target.length) {
        const remaining = target.length - lenRef.current
        const add = Math.max(2, Math.ceil(remaining * 0.25))
        lenRef.current = Math.min(lenRef.current + add, target.length)
        setDisplayed(target.slice(0, lenRef.current))
      }
    }
    const id = setInterval(tick, 25)

    return () => {
      active = false
      clearInterval(id)
    }
  }, [animate])

  return displayed
}

// ---------------------------------------------------------------------------
// Cursor sentinel — injected into markdown text, replaced with a styled span
// ---------------------------------------------------------------------------

const CURSOR = '▍'

function replaceCursorInChildren(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (typeof child === 'string') {
      const idx = child.indexOf(CURSOR)
      if (idx === -1) return child
      return (
        <>
          {child.slice(0, idx)}
          <span className="streaming-cursor-caret" aria-hidden />
          {child.slice(idx + 1)}
        </>
      )
    }
    if (isValidElement(child)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el = child as ReactElement<any>
      if (el.props.children != null) {
        return cloneElement(el, {}, replaceCursorInChildren(el.props.children))
      }
    }
    return child
  })
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function MarkdownContent({
  content,
  isUser,
  showCursor,
}: {
  content: string
  isUser: boolean
  showCursor?: boolean
}) {
  const wrap = showCursor
    ? (children: ReactNode) => replaceCursorInChildren(children)
    : (children: ReactNode) => children

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{wrap(children)}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em>{children}</em>,
        h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{wrap(children)}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">{wrap(children)}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{wrap(children)}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{wrap(children)}</h4>,
        ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-3 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-3 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{wrap(children)}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-3 border-primary/40 pl-3 my-3 italic text-muted-foreground">
            {wrap(children)}
          </blockquote>
        ),
        hr: () => <hr className="my-4 border-border" />,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'underline underline-offset-2 transition-colors',
              isUser ? 'text-primary-foreground/80 hover:text-primary-foreground' : 'text-primary hover:text-primary/80'
            )}
          >
            {children}
          </a>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className
          if (isInline) {
            return (
              <code
                className={cn(
                  'rounded px-1.5 py-0.5 text-[0.85em] font-mono',
                  isUser ? 'bg-primary-foreground/15' : 'bg-foreground/8'
                )}
                {...props}
              >
                {wrap(children)}
              </code>
            )
          }
          const language = className?.replace('language-', '') ?? ''
          return (
            <div className="my-3 rounded-lg overflow-hidden border border-border">
              {language && (
                <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border">
                  {language}
                </div>
              )}
              <pre className="overflow-x-auto p-3 text-sm bg-muted/30">
                <code className={cn('font-mono text-[0.85em]', className)} {...props}>
                  {wrap(children)}
                </code>
              </pre>
            </div>
          )
        },
        pre: ({ children }) => <>{children}</>,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{wrap(children)}</th>
        ),
        td: ({ children }) => <td className="px-3 py-2 font-mono text-xs">{wrap(children)}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export function ChatMessage({
  message,
  isActivelyStreaming = false,
  onFollowupClick,
}: ChatMessageProps) {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [copied, setCopied] = useState(false)
  const [showThinking, setShowThinking] = useState(false)
  const sessionId = useChatStore((s) => s.currentSession?.session_id)

  const isUser = message.role === 'user'
  const isStreaming = isActivelyStreaming && !isUser
  const animatedContent = useAnimatedText(message.content, isStreaming)
  const displayContent = isStreaming ? animatedContent + CURSOR : animatedContent

  const proseRef = useRef<HTMLDivElement>(null)
  const blockCountRef = useRef(0)

  useEffect(() => {
    if (!isStreaming || !proseRef.current) {
      blockCountRef.current = 0
      return
    }

    const container = proseRef.current
    const count = container.children.length

    for (let i = blockCountRef.current; i < count; i++) {
      ;(container.children[i] as HTMLElement).style.animation =
        'blockSlideIn 350ms ease-out both'
    }

    blockCountRef.current = count
  })

  const handleFeedback = async (rating: 'up' | 'down') => {
    if (feedback === rating) {
      setFeedback(null)
      return
    }
    setFeedback(rating)
    await submitFeedback({
      message_id: message.message_id,
      session_id: sessionId ?? '',
      rating,
    }).catch(() => {})
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
        {/* Attachments (user messages only) */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end">
            {message.attachments.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileTextIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="max-w-48 truncate font-medium">{a.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Main message bubble */}
        <div
          className={cn(
            'rounded-xl px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          )}
        >
          <div
            ref={proseRef}
            className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          >
            <MarkdownContent content={displayContent} isUser={isUser} showCursor={isStreaming} />
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

        {/* MongoDB query used */}
        {!isUser && message.query_used && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <DatabaseIcon className="h-3 w-3" />
                View MongoDB query
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-lg border border-border bg-card p-3">
                <pre className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                  {message.query_used}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Visualization indicator */}
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
