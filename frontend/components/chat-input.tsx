'use client'

import { useState, useRef, useEffect } from 'react'
import { SendIcon, SquareIcon, PaperclipIcon, FileTextIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TemplatesDialog } from './templates-dialog'

export interface UploadedFile {
  name: string
  state: 'uploading' | 'done' | 'error'
}

interface ChatInputProps {
  onSend: (message: string) => void
  isSending: boolean
  onAbort?: () => void
  uploadedFiles: UploadedFile[]
  onPickFile: (file: File) => void
  onRemoveFile: (name: string) => void
  placeholder?: string
}

export function ChatInput({
  onSend,
  isSending,
  onAbort,
  uploadedFiles,
  onPickFile,
  onRemoveFile,
  placeholder = 'Ask about your material testing data...',
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    onPickFile(file)
  }

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
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="bg-background p-4">
      <div className="mx-auto max-w-3xl space-y-2">

        {/* Unified input box */}
        <div className="rounded-2xl border border-input bg-card shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* PDF attachment cards */}
          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {uploadedFiles.map((f) => (
                <div
                  key={f.name}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm',
                    f.state === 'error'
                      ? 'border-destructive/30 bg-destructive/10 text-destructive'
                      : 'border-border bg-background text-foreground'
                  )}
                >
                  <div className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    f.state === 'error' ? 'bg-destructive/15' : 'bg-muted'
                  )}>
                    {f.state === 'uploading'
                      ? <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                      : <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="max-w-48 truncate font-medium">{f.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {f.state === 'uploading' ? 'Ingesting…' : f.state === 'error' ? 'Failed' : 'Ingested'}
                    </span>
                  </div>
                  {f.state !== 'uploading' && (
                    <button
                      onClick={() => onRemoveFile(f.name)}
                      className="ml-1 rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isSending}
            className={cn(
              'min-h-13 max-h-50 w-full resize-none border-0 bg-transparent px-4 pt-2.5 pb-1 shadow-none',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'placeholder:text-muted-foreground'
            )}
            rows={1}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
            <Button
              size="icon"
              variant="ghost"
              disabled={uploadedFiles.some((f) => f.state === 'uploading')}
              onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
              title="Upload PDF to knowledge base"
            >
              <PaperclipIcon className="h-4 w-4" />
            </Button>
            {isSending && onAbort ? (
              <Button
                size="icon"
                onClick={onAbort}
                className="h-8 w-8 rounded-xl relative"
                title="Stop generating"
              >
                <span className="absolute inset-0 rounded-xl border-2 border-transparent border-t-current animate-spin" />
                <SquareIcon className="h-3 w-3 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                disabled={!input.trim() || isSending}
                onClick={handleSubmit}
                className="h-8 w-8 rounded-xl"
              >
                <SendIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between px-1">
          <TemplatesDialog onSelectTemplate={(p) => onSend(p)} />
          <p className="text-xs text-muted-foreground">
            Enter to send · Shift+Enter for new line
          </p>
        </div>

      </div>
    </div>
  )
}
