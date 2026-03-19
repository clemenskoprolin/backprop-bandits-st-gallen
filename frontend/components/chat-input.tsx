'use client'

import { useState, useRef, useEffect } from 'react'
import { SendIcon, Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TemplatesDialog } from './templates-dialog'

interface ChatInputProps {
  onSend: (message: string) => void
  isSending: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  isSending,
  placeholder = 'Ask about your material testing data...',
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSubmit = () => {
    if (!input.trim() || isSending) return
    onSend(input.trim())
    setInput('')
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleTemplateSelect = (prompt: string) => {
    onSend(prompt)
  }

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="relative flex items-end gap-2 rounded-xl border border-input bg-card p-2 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isSending}
            className={cn(
              'min-h-[44px] max-h-[200px] flex-1 resize-none border-0 bg-transparent p-2',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'placeholder:text-muted-foreground'
            )}
            rows={1}
          />
          <div className="flex items-center gap-2 pb-1">
            <Button
              size="icon"
              disabled={!input.trim() || isSending}
              onClick={handleSubmit}
              className="h-9 w-9 rounded-lg"
            >
              {isSending ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SendIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Template button and helper text */}
        <div className="flex items-center justify-between">
          <TemplatesDialog onSelectTemplate={handleTemplateSelect} />
          <p className="text-xs text-muted-foreground">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}
