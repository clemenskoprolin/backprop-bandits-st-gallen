'use client'

import { useEffect, useState } from 'react'
import {
  FlaskConicalIcon,
  TrendingUpIcon,
  BarChart3Icon,
  SearchIcon,
  ZapIcon,
  LayoutTemplateIcon,
  ArrowRightIcon,
} from 'lucide-react'
import { useChatStore } from '@/lib/chat-store'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TemplatesDialog } from './templates-dialog'

interface EmptyStateProps {
  onSuggestionClick: (prompt: string) => void
}

const suggestions = [
  {
    icon: SearchIcon,
    title: 'Query Tests',
    description: 'Look up tests by customer, tester, or specimen type',
    category: 'Query',
  },
  {
    icon: BarChart3Icon,
    title: 'Compare Materials',
    description: 'Statistically compare two specimen types or testers',
    category: 'Analysis',
  },
  {
    icon: TrendingUpIcon,
    title: 'Trend & Degradation',
    description: 'Detect trends and check for boundary violations over time',
    category: 'Analysis',
  },
  {
    icon: ZapIcon,
    title: 'Visualize Distribution',
    description: 'Chart property distributions and recent test overviews',
    category: 'Visualization',
  },
]

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  const { templates, loadTemplates } = useChatStore()
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateCategory, setTemplateCategory] = useState<string | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const categories = Array.from(new Set(templates.map((t) => t.category)))

  const handleOpenTemplates = (category?: string) => {
    setTemplateCategory(category ?? null)
    setTemplatesOpen(true)
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col items-center px-4 py-12">
        <div className="max-w-2xl w-full text-center">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <FlaskConicalIcon className="h-8 w-8 text-primary" />
          </div>

          {/* Title */}
          <h1 className="mb-3 text-3xl font-bold text-foreground text-balance">
            Material Testing AI Assistant
          </h1>
          <p className="mb-8 text-muted-foreground text-balance">
            Ask questions about your test data in natural language. I can help you analyze trends,
            compare materials, and find insights in your testing results.
          </p>

          {/* Quick-start Suggestions */}
          <div className="grid gap-4 sm:grid-cols-2">
            {suggestions.map((suggestion, i) => (
              <Card
                key={i}
                className={cn(
                  'cursor-pointer transition-all hover:bg-muted hover:border-border',
                  'group'
                )}
                onClick={() => handleOpenTemplates(suggestion.category)}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted group-hover:bg-card">
                    <suggestion.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-medium text-foreground">{suggestion.title}</h3>
                    <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Templates section */}
          {templates.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center justify-center gap-2 mb-4">
                <LayoutTemplateIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Templates
                </h2>
              </div>

              {/* Category chips */}
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-muted transition-colors gap-1"
                  onClick={() => handleOpenTemplates()}
                >
                  All templates
                  <ArrowRightIcon className="h-3 w-3" />
                </Badge>
                {categories.map((category) => (
                  <Badge
                    key={category}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => handleOpenTemplates(category)}
                  >
                    {category}
                  </Badge>
                ))}
              </div>

              {/* Preview a few templates as clickable rows */}
              <div className="grid gap-2 text-left max-w-lg mx-auto">
                {templates.slice(0, 4).map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleOpenTemplates(template.category)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all',
                      'hover:bg-muted hover:border-border group'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{template.name}</span>
                      <p className="text-xs text-muted-foreground truncate">{template.description}</p>
                    </div>
                    <ArrowRightIcon className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Templates dialog (controlled by state) */}
      <TemplatesDialog
        onSelectTemplate={onSuggestionClick}
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        initialCategory={templateCategory}
      />
    </ScrollArea>
  )
}
