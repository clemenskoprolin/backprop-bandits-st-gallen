'use client'

import { useEffect } from 'react'
import {
  FlaskConicalIcon,
  TrendingUpIcon,
  BarChart3Icon,
  SearchIcon,
  ZapIcon,
} from 'lucide-react'
import { useChatStore } from '@/lib/chat-store'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

interface EmptyStateProps {
  onSuggestionClick: (prompt: string) => void
}

const suggestions = [
  {
    icon: BarChart3Icon,
    title: 'Compare Materials',
    description: 'Analyze differences between material types',
    prompt: 'Compare the tensile and yield strength across different materials in my dataset',
  },
  {
    icon: TrendingUpIcon,
    title: 'Trend Analysis',
    description: 'Find patterns in your test data',
    prompt: 'Show me the trend of tensile strength over the past 6 months',
  },
  {
    icon: SearchIcon,
    title: 'Find Outliers',
    description: 'Identify data points outside normal ranges',
    prompt: 'List all data points with tensile strength > 400 MPa',
  },
  {
    icon: ZapIcon,
    title: 'Quick Summary',
    description: 'Get an overview of your test results',
    prompt: 'Give me a summary overview of all recent material tests',
  },
]

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  const { loadTemplates } = useChatStore()

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="max-w-2xl text-center">
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

        {/* Suggestions Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {suggestions.map((suggestion, i) => (
            <Card
              key={i}
              className={cn(
                'cursor-pointer transition-all hover:bg-muted hover:border-border',
                'group'
              )}
              onClick={() => onSuggestionClick(suggestion.prompt)}
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

        {/* Hint */}
        <p className="mt-8 text-sm text-muted-foreground">
          Or use the{' '}
          <span className="font-medium text-foreground">Templates</span>{' '}
          button to explore more query patterns
        </p>
      </div>
    </div>
  )
}
