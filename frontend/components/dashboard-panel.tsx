'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import GridLayout, { Layout } from 'react-grid-layout'
import {
  XIcon,
  DownloadIcon,
  MaximizeIcon,
  MessageSquareIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  LayoutDashboardIcon,
  EyeOffIcon,
  GripVerticalIcon,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { useChatStore } from '@/lib/chat-store'
import { DashboardWidget, ChartData, TableData, CardsData } from '@/lib/types'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface DashboardPanelProps {
  onToggleChat: () => void
  showChat: boolean
}

function ChartVisualization({ data, fullHeight = false }: { data: ChartData; fullHeight?: boolean }) {
  const chartConfig: ChartConfig = {}
  data.series.forEach((s) => {
    chartConfig[s.key] = {
      label: s.label,
      color: s.color || 'var(--chart-1)',
    }
  })

  const xAxisKey = Object.keys(data.data[0] || {}).find(
    (k) => !data.series.some((s) => s.key === k)
  ) || 'name'

  const renderChart = () => {
    switch (data.chartType) {
      case 'line':
        return (
          <LineChart data={data.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey={xAxisKey}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={{ stroke: 'var(--border)' }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={{ stroke: 'var(--border)' }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            {data.series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color || `var(--chart-${i + 1})`}
                strokeWidth={2}
                dot={{ fill: s.color || `var(--chart-${i + 1})`, r: 3 }}
              />
            ))}
          </LineChart>
        )
      case 'area':
        return (
          <AreaChart data={data.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey={xAxisKey}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={{ stroke: 'var(--border)' }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={{ stroke: 'var(--border)' }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            {data.series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                fill={s.color || `var(--chart-${i + 1})`}
                fillOpacity={0.3}
                stroke={s.color || `var(--chart-${i + 1})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        )
      case 'bar':
      default:
        return (
          <BarChart data={data.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey={xAxisKey}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={{ stroke: 'var(--border)' }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={{ stroke: 'var(--border)' }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            {data.series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                fill={s.color || `var(--chart-${i + 1})`}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        )
    }
  }

  return (
    <div className={cn('w-full', fullHeight ? 'h-[400px]' : 'h-full min-h-[120px]')}>
      <ChartContainer config={chartConfig} className="h-full w-full">
        {renderChart()}
      </ChartContainer>
    </div>
  )
}

function TableVisualization({ data, fullHeight = false }: { data: TableData; fullHeight?: boolean }) {
  return (
    <div className={cn('rounded-lg border overflow-auto', fullHeight ? 'max-h-[400px]' : 'h-full')}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {data.columns.map((col) => (
              <TableHead key={col.key} className="font-semibold text-xs">
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row, i) => (
            <TableRow key={i}>
              {data.columns.map((col) => (
                <TableCell key={col.key} className="font-mono text-xs py-2">
                  {col.type === 'number'
                    ? Number(row[col.key]).toLocaleString()
                    : row[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CardsVisualization({ data }: { data: CardsData }) {
  return (
    <div className="grid grid-cols-2 gap-3 h-full content-start">
      {data.cards.map((card, i) => (
        <div key={i} className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{card.title}</p>
            {card.trend && (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  card.trend.direction === 'up' && 'text-green-500',
                  card.trend.direction === 'down' && 'text-red-500',
                  card.trend.direction === 'neutral' && 'text-muted-foreground'
                )}
              >
                {card.trend.direction === 'up' && <TrendingUpIcon className="h-3 w-3" />}
                {card.trend.direction === 'down' && <TrendingDownIcon className="h-3 w-3" />}
                {card.trend.direction === 'neutral' && <MinusIcon className="h-3 w-3" />}
                {card.trend.value}
              </div>
            )}
          </div>
          <p className="mt-1 text-xl font-bold text-foreground">{card.value}</p>
        </div>
      ))}
    </div>
  )
}

function DashboardWidgetCard({
  widget,
  onRemove,
  onMaximize,
  onDownload,
}: {
  widget: DashboardWidget
  onRemove: () => void
  onMaximize: () => void
  onDownload: () => void
}) {
  const renderVisualization = () => {
    const { visualization } = widget
    switch (visualization.type) {
      case 'chart':
        return <ChartVisualization data={visualization.data as ChartData} />
      case 'table':
        return <TableVisualization data={visualization.data as TableData} />
      case 'cards':
        return <CardsVisualization data={visualization.data as CardsData} />
      default:
        return null
    }
  }

  const getTitle = () => {
    const { visualization } = widget
    if (visualization.type === 'chart') {
      return (visualization.data as ChartData).title
    } else if (visualization.type === 'table') {
      return (visualization.data as TableData).title
    } else if (visualization.type === 'cards') {
      return (visualization.data as CardsData).title
    }
    return 'Visualization'
  }

  return (
    <Card className="h-full flex flex-col border-border/50 hover:border-border transition-colors overflow-hidden">
      <CardHeader className="py-1.5 px-3 shrink-0 border-b border-border/30">
        <div className="flex items-center gap-2">
          {/* Drag handle - always visible */}
          <div className="drag-handle cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted transition-colors">
            <GripVerticalIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-sm font-medium truncate flex-1">{getTitle()}</CardTitle>
          {/* Action buttons */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDownload}>
                  <DownloadIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download Data</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMaximize}>
                  <MaximizeIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fullscreen</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                  onClick={onRemove}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-2 overflow-hidden">
        {renderVisualization()}
      </CardContent>
    </Card>
  )
}

// Fullscreen modal for widget
function FullscreenWidget({
  widget,
  open,
  onClose,
  onDownload,
}: {
  widget: DashboardWidget | null
  open: boolean
  onClose: () => void
  onDownload: () => void
}) {
  if (!widget) return null

  const getTitle = () => {
    const { visualization } = widget
    if (visualization.type === 'chart') {
      return (visualization.data as ChartData).title
    } else if (visualization.type === 'table') {
      return (visualization.data as TableData).title
    } else if (visualization.type === 'cards') {
      return (visualization.data as CardsData).title
    }
    return 'Visualization'
  }

  const renderVisualization = () => {
    const { visualization } = widget
    switch (visualization.type) {
      case 'chart':
        return <ChartVisualization data={visualization.data as ChartData} fullHeight />
      case 'table':
        return <TableVisualization data={visualization.data as TableData} fullHeight />
      case 'cards':
        return <CardsVisualization data={visualization.data as CardsData} />
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{getTitle()}</DialogTitle>
            <Button variant="outline" size="sm" onClick={onDownload} className="gap-2">
              <DownloadIcon className="h-4 w-4" />
              Download JSON
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 py-4">
          {renderVisualization()}
        </div>
        {widget.queryUsed && (
          <div className="border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Query Used</p>
            <pre className="rounded-md bg-muted p-3 text-xs font-mono text-muted-foreground overflow-x-auto">
              {widget.queryUsed}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function DashboardPanel({ onToggleChat, showChat }: DashboardPanelProps) {
  const { dashboardWidgets, removeWidget, updateWidgetLayouts, setShowDashboard } = useChatStore()
  const [containerWidth, setContainerWidth] = useState(800)
  const [fullscreenWidget, setFullscreenWidget] = useState<DashboardWidget | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Convert widgets to grid layout - using 2 columns for coarser grid
  const layout: Layout[] = useMemo(() => 
    dashboardWidgets.map((w) => ({
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
      minW: 1,
      minH: 1,
      maxW: 2,
      maxH: 3,
    })),
    [dashboardWidgets]
  )

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    const updates = newLayout.map((item) => ({
      id: item.i,
      layout: {
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      },
    }))
    updateWidgetLayouts(updates)
  }, [updateWidgetLayouts])

  const handleDownload = useCallback((widget: DashboardWidget) => {
    const data = widget.visualization.data
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${widget.id}_data.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const rowHeight = 240

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          {!showChat && <SidebarTrigger />}
          <LayoutDashboardIcon className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Dashboard</h2>
          <span className="text-xs text-muted-foreground">
            {dashboardWidgets.length} widget{dashboardWidgets.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleChat}
                className="h-8 w-8"
              >
                <MessageSquareIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{showChat ? 'Hide Chat' : 'Show Chat'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDashboard(false)}
                className="h-8 w-8"
              >
                <EyeOffIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hide Dashboard</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div ref={containerRef} className="p-4 min-h-full">
          {dashboardWidgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <LayoutDashboardIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">No visualizations yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ask a question in the chat and visualizations will appear here as interactive widgets.
              </p>
            </div>
          ) : (
            <GridLayout
              className="layout"
              layout={layout}
              cols={2}
              rowHeight={rowHeight}
              width={containerWidth - 32}
              onLayoutChange={handleLayoutChange}
              draggableHandle=".drag-handle"
              compactType="horizontal"
              preventCollision={false}
              isResizable={true}
              isDraggable={true}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              useCSSTransforms={true}
            >
              {dashboardWidgets.map((widget) => (
                <div key={widget.id}>
                  <DashboardWidgetCard
                    widget={widget}
                    onRemove={() => removeWidget(widget.id)}
                    onMaximize={() => setFullscreenWidget(widget)}
                    onDownload={() => handleDownload(widget)}
                  />
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      </ScrollArea>

      {/* Fullscreen modal */}
      <FullscreenWidget
        widget={fullscreenWidget}
        open={!!fullscreenWidget}
        onClose={() => setFullscreenWidget(null)}
        onDownload={() => fullscreenWidget && handleDownload(fullscreenWidget)}
      />
    </div>
  )
}
