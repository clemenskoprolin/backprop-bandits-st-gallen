'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  XIcon,
  DownloadIcon,
  MaximizeIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  LayoutDashboardIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
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
  onDragHandleDown,
}: {
  widget: DashboardWidget
  onRemove: () => void
  onMaximize: () => void
  onDownload: () => void
  onDragHandleDown?: (e: React.PointerEvent) => void
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
    <Card className="h-full flex flex-col border-border/50 hover:border-border transition-colors overflow-hidden select-none">
      <CardHeader className="py-1.5 px-3 shrink-0 border-b border-border/30">
        <div className="flex items-center gap-2 overflow-hidden">
          {/* Drag handle - always visible */}
          <div className="drag-handle cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted transition-colors" onPointerDown={onDragHandleDown}>
            <GripVerticalIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-sm font-medium truncate flex-1 min-w-0">{getTitle()}</CardTitle>
          {/* Action buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
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

// Fixed pixel width per grid column
const COLUMN_WIDTH = 340
const GRID_GAP = 16
const ROW_HEIGHT = 240

const toPixelX = (gx: number) => gx * (COLUMN_WIDTH + GRID_GAP)
const toPixelY = (gy: number) => gy * (ROW_HEIGHT + GRID_GAP)
const itemWidth = (w: number) => w * COLUMN_WIDTH + (w - 1) * GRID_GAP

/**
 * Compute responsive layout: clamp widget widths to available cols,
 * then reflow positions so nothing overflows.
 */
function reflowLayout(widgets: DashboardWidget[], cols: number) {
  const occupied = new Set<string>()
  const cellKey = (x: number, y: number) => `${x},${y}`

  const placements: { id: string; x: number; y: number; w: number }[] = []

  for (const widget of widgets) {
    const w = Math.min(widget.layout.w, cols)
    let placed = false

    // Try the widget's stored position first
    const sx = Math.min(widget.layout.x, cols - w)
    const sy = widget.layout.y
    let fits = true
    for (let dx = 0; dx < w; dx++) {
      if (occupied.has(cellKey(sx + dx, sy))) { fits = false; break }
    }
    if (fits) {
      for (let dx = 0; dx < w; dx++) occupied.add(cellKey(sx + dx, sy))
      placements.push({ id: widget.id, x: sx, y: sy, w })
      placed = true
    }

    if (!placed) {
      for (let y = 0; ; y++) {
        for (let x = 0; x <= cols - w; x++) {
          let ok = true
          for (let dx = 0; dx < w; dx++) {
            if (occupied.has(cellKey(x + dx, y))) { ok = false; break }
          }
          if (ok) {
            for (let dx = 0; dx < w; dx++) occupied.add(cellKey(x + dx, y))
            placements.push({ id: widget.id, x, y, w })
            placed = true
            break
          }
        }
        if (placed) break
      }
    }
  }

  return placements
}

export function DashboardPanel({ onToggleChat, showChat }: DashboardPanelProps) {
  const { dashboardWidgets, removeWidget, updateWidgetLayouts } = useChatStore()
  const [containerWidth, setContainerWidth] = useState(800)
  const [fullscreenWidget, setFullscreenWidget] = useState<DashboardWidget | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep refs to latest values so pointer handlers always read fresh data
  const widgetsRef = useRef(dashboardWidgets)
  widgetsRef.current = dashboardWidgets
  const colsRef = useRef(1)

  // ── Drag state ──
  const dragRef = useRef<{
    widgetId: string
    startPointerX: number
    startPointerY: number
    startPx: number
    startPy: number
  } | null>(null)
  const [dragVisual, setDragVisual] = useState<{ widgetId: string; px: number; py: number } | null>(null)

  // ── Resize state (width only) ──
  const resizeRef = useRef<{
    widgetId: string
    startPointerX: number
    startW: number
  } | null>(null)
  const [resizeVisual, setResizeVisual] = useState<{ widgetId: string; width: number } | null>(null)

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

  const cols = useMemo(() => Math.max(1, Math.floor((containerWidth + GRID_GAP) / (COLUMN_WIDTH + GRID_GAP))), [containerWidth])
  const gridWidth = cols * COLUMN_WIDTH + (cols - 1) * GRID_GAP

  colsRef.current = cols

  // Compute responsive positions: clamp widths + reflow
  const layoutMap = useMemo(() => {
    const placements = reflowLayout(dashboardWidgets, cols)
    return new Map(placements.map((p) => [p.id, p]))
  }, [dashboardWidgets, cols])

  // ── Drag handle ──
  const handleDragHandleDown = useCallback((widgetId: string, e: React.PointerEvent) => {
    e.preventDefault()
    const widget = widgetsRef.current.find((w) => w.id === widgetId)
    if (!widget) return
    const placement = layoutMap.get(widgetId)
    const px = toPixelX(placement?.x ?? widget.layout.x)
    const py = toPixelY(placement?.y ?? widget.layout.y)
    dragRef.current = {
      widgetId,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startPx: px,
      startPy: py,
    }
    setDragVisual({ widgetId, px, py })
  }, [layoutMap])

  // ── Resize handle (width only — right edge or bottom-right corner) ──
  const handleResizeHandleDown = useCallback((widgetId: string, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const widget = widgetsRef.current.find((w) => w.id === widgetId)
    if (!widget) return
    const w = Math.min(widget.layout.w, colsRef.current)
    resizeRef.current = {
      widgetId,
      startPointerX: e.clientX,
      startW: itemWidth(w),
    }
    setResizeVisual({ widgetId, width: itemWidth(w) })
  }, [])

  // ── Global pointer move / up ──
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // ── Drag ──
      if (dragRef.current) {
        const drag = dragRef.current
        const newPx = drag.startPx + (e.clientX - drag.startPointerX)
        const newPy = Math.max(0, drag.startPy + (e.clientY - drag.startPointerY))
        setDragVisual({ widgetId: drag.widgetId, px: newPx, py: newPy })

        const widgets = widgetsRef.current
        const dragged = widgets.find((w) => w.id === drag.widgetId)
        if (!dragged) return

        const c = colsRef.current
        const dw = itemWidth(Math.min(dragged.layout.w, c))
        const centerX = newPx + dw / 2
        const centerY = newPy + ROW_HEIGHT / 2

        for (const other of widgets) {
          if (other.id === drag.widgetId) continue
          const ow = Math.min(other.layout.w, c)
          const ox = toPixelX(Math.min(other.layout.x, c - ow))
          const oy = toPixelY(other.layout.y)
          const owPx = itemWidth(ow)
          if (centerX >= ox && centerX < ox + owPx && centerY >= oy && centerY < oy + ROW_HEIGHT) {
            updateWidgetLayouts([
              { id: drag.widgetId, layout: { ...dragged.layout, x: other.layout.x, y: other.layout.y } },
              { id: other.id, layout: { ...other.layout, x: dragged.layout.x, y: dragged.layout.y } },
            ])
            drag.startPx = toPixelX(other.layout.x)
            drag.startPy = toPixelY(other.layout.y)
            drag.startPointerX = e.clientX
            drag.startPointerY = e.clientY
            break
          }
        }
      }

      // ── Resize (width only) ──
      if (resizeRef.current) {
        const resize = resizeRef.current
        const newWidth = Math.max(COLUMN_WIDTH / 2, resize.startW + (e.clientX - resize.startPointerX))
        setResizeVisual({ widgetId: resize.widgetId, width: newWidth })
      }
    }

    const onUp = (e: PointerEvent) => {
      // ── Finish drag — snap to nearest empty cell or stay ──
      if (dragRef.current) {
        const drag = dragRef.current
        const widgets = widgetsRef.current
        const dragged = widgets.find((w) => w.id === drag.widgetId)
        if (dragged) {
          const c = colsRef.current
          const finalPx = drag.startPx + (e.clientX - drag.startPointerX)
          const finalPy = Math.max(0, drag.startPy + (e.clientY - drag.startPointerY))
          const w = Math.min(dragged.layout.w, c)
          const targetX = Math.max(0, Math.min(c - w, Math.round(finalPx / (COLUMN_WIDTH + GRID_GAP))))
          const targetY = Math.max(0, Math.round(finalPy / (ROW_HEIGHT + GRID_GAP)))
          const occupied = widgets.some((o) => o.id !== drag.widgetId && o.layout.x === targetX && o.layout.y === targetY)
          if (!occupied) {
            updateWidgetLayouts([{ id: drag.widgetId, layout: { ...dragged.layout, x: targetX, y: targetY } }])
          }
        }
        dragRef.current = null
        setDragVisual(null)
      }

      // ── Finish resize — snap to 1 or 2 columns ──
      if (resizeRef.current) {
        const resize = resizeRef.current
        const c = colsRef.current
        const finalWidth = resize.startW + (e.clientX - resize.startPointerX)
        const snappedW = finalWidth > COLUMN_WIDTH * 1.5 ? Math.min(2, c) : 1
        const widget = widgetsRef.current.find((w) => w.id === resize.widgetId)
        if (widget) {
          updateWidgetLayouts([{ id: resize.widgetId, layout: { ...widget.layout, w: snappedW } }])
        }
        resizeRef.current = null
        setResizeVisual(null)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
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

  // Grid container height based on reflowed positions
  const gridHeight = useMemo(() => {
    if (layoutMap.size === 0) return 0
    let maxBottom = 0
    layoutMap.forEach((p) => {
      const bottom = (p.y + 1) * (ROW_HEIGHT + GRID_GAP)
      if (bottom > maxBottom) maxBottom = bottom
    })
    return maxBottom - GRID_GAP
  }, [layoutMap])

  const isDragging = dragVisual !== null

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0">
        {!showChat && <SidebarTrigger />}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleChat}
              className="h-8 w-8"
            >
              {showChat ? <PanelLeftCloseIcon className="h-4 w-4" /> : <PanelLeftOpenIcon className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{showChat ? 'Hide Chat' : 'Show Chat'}</TooltipContent>
        </Tooltip>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground truncate">Dashboard</h2>
          <p className="text-xs text-muted-foreground">
            {dashboardWidgets.length} widget{dashboardWidgets.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className={cn('p-4', isDragging && 'cursor-grabbing')}>
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
            <div style={{ position: 'relative', width: gridWidth, height: gridHeight }}>
              {dashboardWidgets.map((widget) => {
                const isBeingDragged = dragVisual?.widgetId === widget.id
                const isBeingResized = resizeVisual?.widgetId === widget.id
                const placement = layoutMap.get(widget.id)

                const px = isBeingDragged ? dragVisual.px : toPixelX(placement?.x ?? widget.layout.x)
                const py = isBeingDragged ? dragVisual.py : toPixelY(placement?.y ?? widget.layout.y)
                const displayW = placement?.w ?? Math.min(widget.layout.w, cols)
                const w = isBeingResized ? resizeVisual.width : itemWidth(displayW)

                return (
                  <div
                    key={widget.id}
                    style={{
                      position: 'absolute',
                      transform: `translate(${px}px, ${py}px)`,
                      width: w,
                      height: ROW_HEIGHT,
                      transition: isBeingDragged || isBeingResized ? 'none' : 'transform 200ms ease, width 200ms ease',
                      zIndex: isBeingDragged ? 10 : 1,
                    }}
                  >
                    <DashboardWidgetCard
                      widget={widget}
                      onRemove={() => removeWidget(widget.id)}
                      onMaximize={() => setFullscreenWidget(widget)}
                      onDownload={() => handleDownload(widget)}
                      onDragHandleDown={(e) => handleDragHandleDown(widget.id, e)}
                    />
                    {/* Resize handle — right edge */}
                    {cols >= 2 && (
                      <div
                        className="absolute right-0 top-0 w-3 h-full cursor-ew-resize flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                        onPointerDown={(e) => handleResizeHandleDown(widget.id, e)}
                      >
                        <div className="w-1 h-6 rounded border-r-2 border-border" />
                      </div>
                    )}
                    {/* Resize handle — bottom-right corner */}
                    {cols >= 2 && (
                      <div
                        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize opacity-0 hover:opacity-100 transition-opacity z-10"
                        onPointerDown={(e) => handleResizeHandleDown(widget.id, e)}
                      >
                        <svg width="20" height="20" viewBox="0 0 20 20" className="text-muted-foreground/60">
                          <path d="M17 5 L5 17" stroke="currentColor" strokeWidth="1.5" fill="none" />
                          <path d="M17 10 L10 17" stroke="currentColor" strokeWidth="1.5" fill="none" />
                          <path d="M17 15 L15 17" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        </svg>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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
