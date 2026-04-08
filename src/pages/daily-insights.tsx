import { useEffect, useState } from 'react'
import { adminApi } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Sprout,
} from 'lucide-react'

interface Insight {
  id: string
  content: string
  author: string | null
  category: string
  scheduledDate: string | null
  isActive: boolean
  displayCount: number
  createdAt: string
}

type InsightRecord = Record<string, any>

const categoryColors: Record<string, string> = {
  marriage: 'bg-pink-100 text-pink-700',
  patience: 'bg-blue-100 text-blue-700',
  love: 'bg-red-100 text-red-700',
  faith: 'bg-emerald-100 text-emerald-700',
  general: 'bg-gray-100 text-gray-700',
}

const isRecord = (value: unknown): value is InsightRecord =>
  typeof value === 'object' && value !== null

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return undefined
}

const parseBoolean = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value
    }

    if (typeof value === 'number') {
      return value > 0
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', '1', 'active', 'enabled', 'published'].includes(normalized)) {
        return true
      }
      if (['false', '0', 'inactive', 'disabled', 'draft'].includes(normalized)) {
        return false
      }
    }
  }

  return undefined
}

const extractInsightItems = (payload: unknown): InsightRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of ['items', 'results', 'insights', 'rows', 'data']) {
    const candidate = payload[key]
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
    if (isRecord(candidate)) {
      const nestedItems = extractInsightItems(candidate)
      if (nestedItems.length > 0) {
        return nestedItems
      }
    }
  }

  return []
}

const extractInsightTotal = (payload: unknown, fallback: number) => {
  if (!isRecord(payload)) {
    return fallback
  }

  return firstNumber(
    payload.total,
    payload.count,
    isRecord(payload.meta) ? payload.meta.total : undefined,
    isRecord(payload.pagination) ? payload.pagination.total : undefined,
  ) ?? fallback
}

const normalizeInsight = (item: InsightRecord, index: number): Insight | null => {
  const content = firstString(item.content, item.text, item.message, item.insight, item.quote, item.body)
  if (!content) {
    return null
  }

  return {
    id: firstString(item.id, item._id) || `insight-${index}`,
    content,
    author: firstString(item.author, item.source, item.authorName) || null,
    category: firstString(item.category, item.type, item.tag) || 'general',
    scheduledDate: firstString(item.scheduledDate, item.scheduledAt, item.publishAt, item.date) || null,
    isActive: parseBoolean(item.isActive, item.active, item.enabled, item.status) ?? true,
    displayCount: firstNumber(item.displayCount, item.display_count, item.views, item.impressions, item.showCount) ?? 0,
    createdAt: firstString(item.createdAt, item.updatedAt) || new Date().toISOString(),
  }
}

const formatDateInput = (value: string | null) => {
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().slice(0, 10)
}

export default function DailyInsightsPage() {
  const { toast } = useToast()
  const [insights, setInsights] = useState<Insight[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingInsight, setEditingInsight] = useState<Insight | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formContent, setFormContent] = useState('')
  const [formAuthor, setFormAuthor] = useState('')
  const [formCategory, setFormCategory] = useState('general')
  const [formScheduledDate, setFormScheduledDate] = useState('')

  const fetchInsights = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getDailyInsights(page, limit)
      const normalizedInsights = extractInsightItems(res.data)
        .map(normalizeInsight)
        .filter((item): item is Insight => item !== null)

      setInsights(normalizedInsights)
      setTotal(extractInsightTotal(res.data, normalizedInsights.length))
    } catch (err) {
      console.error('Failed to fetch insights', err)
      setInsights([])
      setTotal(0)
      toast({ title: 'Error', description: 'Failed to load daily insights', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInsights()
  }, [page])

  const resetForm = () => {
    setEditingInsight(null)
    setFormContent('')
    setFormAuthor('')
    setFormCategory('general')
    setFormScheduledDate('')
  }

  const openCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = (insight: Insight) => {
    setEditingInsight(insight)
    setFormContent(insight.content)
    setFormAuthor(insight.author || '')
    setFormCategory(insight.category || 'general')
    setFormScheduledDate(formatDateInput(insight.scheduledDate))
    setDialogOpen(true)
  }

  const buildPayload = () => {
    const content = formContent.trim()
    const author = formAuthor.trim()
    const scheduledAt = formScheduledDate
      ? new Date(`${formScheduledDate}T00:00:00.000Z`).toISOString()
      : undefined

    return {
      content,
      text: content,
      author: author || undefined,
      source: author || undefined,
      category: formCategory,
      type: formCategory,
      scheduledDate: scheduledAt,
      scheduledAt,
    }
  }

  const handleSave = async () => {
    if (!formContent.trim()) return

    setSaving(true)
    try {
      const payload = buildPayload()

      if (editingInsight) {
        await adminApi.updateDailyInsight(editingInsight.id, payload)
        toast({ title: 'Insight Updated', variant: 'success' })
      } else {
        await adminApi.createDailyInsight(payload)
        toast({ title: 'Insight Created', variant: 'success' })
      }

      setDialogOpen(false)
      resetForm()
      await fetchInsights()
    } catch (err) {
      console.error('Failed to save insight', err)
      toast({ title: 'Error', description: 'Failed to save insight', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this insight?')) return

    try {
      await adminApi.deleteDailyInsight(id)
      toast({ title: 'Insight Deleted', variant: 'warning' })
      await fetchInsights()
    } catch (err) {
      console.error('Failed to delete insight', err)
      toast({ title: 'Error', description: 'Failed to delete insight', variant: 'error' })
    }
  }

  const handleToggleActive = async (insight: Insight) => {
    const nextState = !insight.isActive

    try {
      await adminApi.updateDailyInsight(insight.id, {
        isActive: nextState,
        active: nextState,
        enabled: nextState,
        status: nextState ? 'active' : 'inactive',
      })
      toast({
        title: nextState ? 'Insight Activated' : 'Insight Disabled',
        variant: nextState ? 'success' : 'warning',
      })
      await fetchInsights()
    } catch (err) {
      console.error('Failed to toggle insight', err)
      toast({ title: 'Error', description: 'Failed to update insight status', variant: 'error' })
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      await adminApi.seedDailyInsights()
      toast({ title: 'Insights Seeded', description: 'Default daily insights were added.', variant: 'success' })
      await fetchInsights()
    } catch (err) {
      console.error('Failed to seed insights', err)
      toast({ title: 'Error', description: 'Failed to seed daily insights', variant: 'error' })
    } finally {
      setSeeding(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const activeCount = insights.filter((insight) => insight.isActive).length
  const scheduledCount = insights.filter((insight) => insight.scheduledDate).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Halal Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the quotes, reminders, and daily guidance shown inside the app.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSeed} disabled={seeding}>
            {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sprout className="mr-2 h-4 w-4" />}
            Seed Defaults
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Insight
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{scheduledCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : insights.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Sparkles className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>No insights yet. Click "Seed Defaults" to add initial content.</p>
            </div>
          ) : (
            <div className="divide-y">
              {insights.map((insight) => (
                <div key={insight.id} className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/30 md:flex-row md:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed">{insight.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {insight.author && (
                        <span className="text-xs italic text-muted-foreground">- {insight.author}</span>
                      )}

                      <Badge variant="secondary" className={`text-xs ${categoryColors[insight.category] || categoryColors.general}`}>
                        {insight.category}
                      </Badge>

                      {insight.scheduledDate && (
                        <Badge variant="outline" className="text-xs">
                          Scheduled: {new Date(insight.scheduledDate).toLocaleDateString()}
                        </Badge>
                      )}

                      <span className="text-xs text-muted-foreground">Shown {insight.displayCount}x</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 self-end md:self-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(insight)}
                      className={insight.isActive ? 'text-emerald-600' : 'text-muted-foreground'}
                    >
                      {insight.isActive ? 'Active' : 'Inactive'}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(insight)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(insight.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingInsight ? 'Edit Insight' : 'New Insight'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Content *</label>
              <Textarea
                value={formContent}
                onChange={(event) => setFormContent(event.target.value)}
                placeholder="Enter wisdom content..."
                rows={3}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Author / Source</label>
              <Input
                value={formAuthor}
                onChange={(event) => setFormAuthor(event.target.value)}
                placeholder="e.g. Quran 30:21"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Category</label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="marriage">Marriage</SelectItem>
                    <SelectItem value="faith">Faith</SelectItem>
                    <SelectItem value="patience">Patience</SelectItem>
                    <SelectItem value="love">Love</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Scheduled Date</label>
                <Input
                  type="date"
                  value={formScheduledDate}
                  onChange={(event) => setFormScheduledDate(event.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formContent.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingInsight ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
