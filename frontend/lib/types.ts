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
  attachments?: { name: string }[]
}

export interface Visualization {
  type: 'chart' | 'table' | 'cards' | 'text' | 'paragraphs' | 'empty-diagram' | 'none'
  data: ChartData | TableData | CardsData | TextData | ParagraphsData | EmptyDiagramData | null
  /** LLM-requested size in HxW format: "1x1", "1x2", "2x1", "2x2" */
  widgetSize?: string
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

export interface TextData {
  title: string
  content?: string
}

export interface ParagraphsData {
  title: string
  content: string
}

export interface EmptyDiagramData {
  promptHint?: string
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
// Format is HxW: h = row-span, w = column-span
export type WidgetSize = 'small' | 'medium' | 'large' | 'tall' | 'xlarge'

export const WIDGET_SIZE_CONFIG: Record<WidgetSize, { w: number; h: number }> = {
  small:  { w: 1, h: 1 },  // 1×1
  medium: { w: 1, h: 1 },  // 1×1
  large:  { w: 2, h: 1 },  // 1×2 — wide chart (default)
  tall:   { w: 1, h: 2 },  // 2×1 — tall narrow chart
  xlarge: { w: 2, h: 2 },  // 2×2 — large square chart
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
  /** Set to true when the widget is newly created or updated by the LLM */
  isNew?: boolean
}
