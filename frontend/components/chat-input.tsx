'use client'

import { useState, useRef, useEffect } from 'react'
import { SendIcon, Loader2Icon, PaperclipIcon, CheckIcon, AlertCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TemplatesDialog } from './templates-dialog'
import { uploadPdf } from '@/lib/api'

interface ChatInputProps {
  onSend: (message: string) => void
  isSending: boolean
  sessionId: string | null
  placeholder?: string
}

export function ChatInput({
  onSend,
  isSending,
  sessionId,
  placeholder = 'Ask about your material testing data...',
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const sid = sessionId ?? `temp_${Date.now()}`
    setUploadState('uploading')
    try {
      await uploadPdf(file, sid)
      setUploadState('done')
      setTimeout(() => setUploadState('idle'), 2500)
    } catch {
      setUploadState('error')
      setTimeout(() => setUploadState('idle'), 3000)
    }
  }

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
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            size="icon"
            variant="ghost"
            disabled={uploadState === 'uploading'}
            onClick={() => fileInputRef.current?.click()}
            className="h-9 w-9 shrink-0 rounded-lg"
            title="Upload PDF to knowledge base"
          >
            {uploadState === 'uploading' && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {uploadState === 'done' && <CheckIcon className="h-4 w-4 text-green-500" />}
            {uploadState === 'error' && <AlertCircleIcon className="h-4 w-4 text-destructive" />}
            {uploadState === 'idle' && <PaperclipIcon className="h-4 w-4" />}
          </Button>
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
            Press Enter to send · Shift+Enter for new line · Drop PDF to ingest
          </p>
        </div>
      </div>
    </div>
  )
}
