'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  LayoutTemplateIcon,
  SearchIcon,
  SparklesIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  PencilIcon,
} from 'lucide-react'
import { useChatStore } from '@/lib/chat-store'
import { Template, TemplateVariable } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface TemplatesDialogProps {
  onSelectTemplate: (prompt: string) => void
}

function TemplateCard({
  template,
  onSubmit,
}: {
  template: Template
  onSubmit: (prompt: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [variables, setVariables] = useState<Record<string, string>>({})
  // Track which select variables should use free text input
  const [freeTextMode, setFreeTextMode] = useState<Record<string, boolean>>({})

  // Initialize variables with defaults
  useEffect(() => {
    if (template.variables) {
      const defaults: Record<string, string> = {}
      template.variables.forEach((v) => {
        if (v.defaultValue) {
          defaults[v.key] = v.defaultValue
        }
      })
      setVariables(defaults)
      setFreeTextMode({})
    }
  }, [template.variables])

  const filledPrompt = useMemo(() => {
    let prompt = template.prompt
    if (template.variables) {
      template.variables.forEach((v) => {
        const value = variables[v.key] || `[${v.label}]`
        prompt = prompt.replace(`{${v.key}}`, value)
      })
    }
    return prompt
  }, [template.prompt, template.variables, variables])

  const isComplete = useMemo(() => {
    if (!template.variables || template.variables.length === 0) return true
    return template.variables.every((v) => variables[v.key]?.trim())
  }, [template.variables, variables])

  const handleSubmit = () => {
    if (isComplete) {
      onSubmit(filledPrompt)
    }
  }

  const toggleFreeTextMode = (key: string) => {
    setFreeTextMode((prev) => ({ ...prev, [key]: !prev[key] }))
    // Clear value when switching modes
    setVariables((prev) => ({ ...prev, [key]: '' }))
  }

  const renderVariable = (variable: TemplateVariable) => {
    const useFreeText = freeTextMode[variable.key]

    switch (variable.type) {
      case 'select':
        return (
          <div className="flex gap-2">
            {useFreeText ? (
              <Input
                placeholder={`Enter custom ${variable.label.toLowerCase()}...`}
                value={variables[variable.key] || ''}
                onChange={(e) =>
                  setVariables((prev) => ({ ...prev, [variable.key]: e.target.value }))
                }
                className="h-9 flex-1"
              />
            ) : (
              <Select
                value={variables[variable.key] || ''}
                onValueChange={(value) =>
                  setVariables((prev) => ({ ...prev, [variable.key]: value }))
                }
              >
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder={variable.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {variable.options?.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={useFreeText ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => toggleFreeTextMode(variable.key)}
                >
                  <PencilIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {useFreeText ? 'Use dropdown options' : 'Enter custom value'}
              </TooltipContent>
            </Tooltip>
          </div>
        )
      case 'number':
        return (
          <Input
            type="number"
            placeholder={variable.placeholder}
            value={variables[variable.key] || ''}
            onChange={(e) =>
              setVariables((prev) => ({ ...prev, [variable.key]: e.target.value }))
            }
            className="h-9"
          />
        )
      default:
        return (
          <Input
            placeholder={variable.placeholder}
            value={variables[variable.key] || ''}
            onChange={(e) =>
              setVariables((prev) => ({ ...prev, [variable.key]: e.target.value }))
            }
            className="h-9"
          />
        )
    }
  }

  const hasVariables = template.variables && template.variables.length > 0

  if (!hasVariables) {
    return (
      <button
        onClick={() => onSubmit(template.prompt)}
        className={cn(
          'flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all',
          'hover:bg-muted hover:border-border group'
        )}
      >
        <div className="flex w-full items-center justify-between">
          <span className="font-medium text-foreground group-hover:text-foreground transition-colors">
            {template.name}
          </span>
          <Badge variant="secondary" className="text-xs">
            {template.category}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{template.description}</p>
      </button>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'flex w-full flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all',
            'hover:bg-muted hover:border-border group',
            isOpen && 'border-primary/50 bg-muted'
          )}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground group-hover:text-foreground transition-colors">
                {template.name}
              </span>
              <ChevronDownIcon
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isOpen && 'rotate-180'
                )}
              />
            </div>
            <Badge variant="secondary" className="text-xs">
              {template.category}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{template.description}</p>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-1">
        <div className="mt-2 rounded-lg border border-dashed bg-muted/30 p-4 space-y-4">
          {/* Variable inputs */}
          <div className="grid gap-3 sm:grid-cols-2">
            {template.variables?.map((variable) => (
              <div key={variable.key} className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {variable.label}
                </label>
                {renderVariable(variable)}
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Preview
            </label>
            <div className="rounded-md bg-background border p-3 text-sm text-foreground">
              {filledPrompt}
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!isComplete}
            className="w-full gap-2"
          >
            <SparklesIcon className="h-4 w-4" />
            Use Template
            <ArrowRightIcon className="h-4 w-4 ml-auto" />
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function TemplatesDialog({ onSelectTemplate }: TemplatesDialogProps) {
  const { templates, loadTemplates } = useChatStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const categories = Array.from(new Set(templates.map((t) => t.category)))

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || t.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleSubmit = (prompt: string) => {
    onSelectTemplate(prompt)
    setOpen(false)
    setSearch('')
    setSelectedCategory(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <LayoutTemplateIcon className="h-4 w-4" />
          <span>Use a template</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-primary" />
            Query Templates
          </DialogTitle>
          <DialogDescription>
            Choose a template and fill in the parameters to create your query
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Search */}
          <div className="relative shrink-0">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <Badge
              variant={selectedCategory === null ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer transition-colors',
                selectedCategory === null ? 'hover:bg-primary/90' : 'hover:bg-muted'
              )}
              onClick={() => setSelectedCategory(null)}
            >
              All
            </Badge>
            {categories.map((category) => (
              <Badge
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer transition-colors',
                  selectedCategory === category ? 'hover:bg-primary/90' : 'hover:bg-muted'
                )}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Badge>
            ))}
          </div>

          {/* Templates List */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="grid gap-3 pr-4 pb-4">
                {filteredTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSubmit={handleSubmit}
                  />
                ))}
                {filteredTemplates.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No templates found matching your search
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
