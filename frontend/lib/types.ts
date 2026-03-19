export interface Session {
  session_id: string
  title: string
  updated_at: string
  message_count: number
}

export interface Message {
  message_id: string
  role: 'user' | 'assistant'
  content: string
  visualization?: Visualization | null
  visualizations?: Visualization[]
  query_used?: string | null
  timestamp: string
  thinking?: string[]
  followups?: string[]
}

export interface Visualization {
  type: 'chart' | 'table' | 'cards' | 'none'
  data: ChartData | TableData | CardsData | null
}

export interface ChartData {
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'radar' | 'radial' | 'boxplot'
  title: string
  description?: string
  xAxisKey?: string
  xAxis?: string
  yAxis?: string
  data: Record<string, string | number>[]
  series: { key: string; label: string; color?: string }[]
  chartConfig?: Record<string, { label: string; color?: string }>
}

export interface TableData {
  title: string
  columns: { key: string; label: string; type?: 'string' | 'number' }[]
  rows: Record<string, string | number>[]
}

export interface CardsData {
  title: string
  cards: {
    title: string
    value: string | number
    description?: string
    trend?: { direction: 'up' | 'down' | 'neutral'; value: string }
  }[]
}

export interface Template {
  id: string
  name: string
  description: string
  prompt: string
  category: string
  variables?: TemplateVariable[]
}

export interface TemplateVariable {
  key: string
  label: string
  placeholder: string
  type: 'text' | 'select' | 'number'
  options?: string[]
  defaultValue?: string
}

export interface ChatResponse {
  session_id: string
  message_id: string
  text: string
  visualization: Visualization | null
  followups: string[]
  query_used: string | null
  thinking: string[]
}

export interface FeedbackPayload {
  message_id: string
  session_id: string
  rating: 'up' | 'down'
  comment?: string
}

// Widget sizes in a responsive grid (cols computed from container width)
export type WidgetSize = 'small' | 'medium' | 'large'

export const WIDGET_SIZE_CONFIG: Record<WidgetSize, { w: number; h: number }> = {
  small: { w: 1, h: 1 },
  medium: { w: 1, h: 1 },  // Single cell
  large: { w: 2, h: 1 },   // Double width, same height
}

// Dashboard widget system
export interface DashboardWidget {
  id: string
  messageId: string
  visualization: Visualization
  size: WidgetSize
  // Grid layout properties (for react-grid-layout)
  layout: {
    x: number
    y: number
    w: number
    h: number
  }
  queryUsed?: string | null
}
