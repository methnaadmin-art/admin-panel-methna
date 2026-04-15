import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminApi,
  type AdminPlan,
  type AdminPlanFeatures,
  type AdminPlanLimits,
  type AdminPlanPayload,
} from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'

interface PlanFormState {
  code: string
  name: string
  description: string
  price: string
  currency: string
  billingCycle: 'monthly' | 'yearly' | 'weekly' | 'one_time'
  googleProductId: string
  googleBasePlanId: string
  stripePriceId: string
  stripeProductId: string
  durationDays: string
  sortOrder: string
  isActive: boolean
  isVisible: boolean
  featureFlagsJson: string
  limitsJson: string
}

const EMPTY_FEATURES: AdminPlanFeatures = {}
const EMPTY_LIMITS: AdminPlanLimits = {}

const createInitialFormState = (plan?: AdminPlan): PlanFormState => {
  if (!plan) {
    return {
      code: '',
      name: '',
      description: '',
      price: '0',
      currency: 'usd',
      billingCycle: 'monthly',
      googleProductId: '',
      googleBasePlanId: '',
      stripePriceId: '',
      stripeProductId: '',
      durationDays: '30',
      sortOrder: '0',
      isActive: true,
      isVisible: true,
      featureFlagsJson: JSON.stringify(EMPTY_FEATURES, null, 2),
      limitsJson: JSON.stringify(EMPTY_LIMITS, null, 2),
    }
  }

  return {
    code: plan.code || '',
    name: plan.name || '',
    description: plan.description || '',
    price: String(Number(plan.price ?? 0)),
    currency: plan.currency || 'usd',
    billingCycle: (plan.billingCycle || 'monthly') as PlanFormState['billingCycle'],
    googleProductId: plan.googleProductId || '',
    googleBasePlanId: plan.googleBasePlanId || '',
    stripePriceId: plan.stripePriceId || '',
    stripeProductId: plan.stripeProductId || '',
    durationDays: String(plan.durationDays ?? 30),
    sortOrder: String(plan.sortOrder ?? 0),
    isActive: Boolean(plan.isActive ?? true),
    isVisible: Boolean(plan.isVisible ?? true),
    featureFlagsJson: JSON.stringify(plan.featureFlags || EMPTY_FEATURES, null, 2),
    limitsJson: JSON.stringify(plan.limits || EMPTY_LIMITS, null, 2),
  }
}

const parseJsonObject = <T extends object>(value: string, fieldLabel: string): T => {
  const trimmed = value.trim()
  if (!trimmed) {
    return {} as T
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${fieldLabel} must be a JSON object`)
    }
    return parsed as T
  } catch (error) {
    throw new Error(`${fieldLabel} must be valid JSON object format`)
  }
}

const normalizePlans = (payload: any): AdminPlan[] => {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  if (payload && Array.isArray(payload.plans)) return payload.plans
  return []
}

export default function PlansPage() {
  const { toast } = useToast()

  const [plans, setPlans] = useState<AdminPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null)
  const [form, setForm] = useState<PlanFormState>(createInitialFormState())

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.getPlans()
      setPlans(normalizePlans(res.data))
    } catch (error: any) {
      toast({
        title: 'Failed to load plans',
        description: error?.response?.data?.message || error?.message || 'Unknown error',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  const stats = useMemo(() => {
    const total = plans.length
    const active = plans.filter((plan) => plan.isActive).length
    const visible = plans.filter((plan) => plan.isVisible).length
    const paid = plans.filter((plan) => Number(plan.price || 0) > 0).length
    return { total, active, visible, paid }
  }, [plans])

  const openCreateDialog = () => {
    setEditingPlan(null)
    setForm(createInitialFormState())
    setDialogOpen(true)
  }

  const openEditDialog = (plan: AdminPlan) => {
    setEditingPlan(plan)
    setForm(createInitialFormState(plan))
    setDialogOpen(true)
  }

  const onFormChange = (key: keyof PlanFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const buildPayload = (): AdminPlanPayload => {
    const payload: AdminPlanPayload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: Number(form.price),
      currency: form.currency.trim().toLowerCase() || 'usd',
      billingCycle: form.billingCycle,
      googleProductId: form.googleProductId.trim() || undefined,
      googleBasePlanId: form.googleBasePlanId.trim() || undefined,
      stripePriceId: form.stripePriceId.trim() || undefined,
      stripeProductId: form.stripeProductId.trim() || undefined,
      durationDays: Number(form.durationDays || 30),
      sortOrder: Number(form.sortOrder || 0),
      isActive: form.isActive,
      isVisible: form.isVisible,
      featureFlags: parseJsonObject<AdminPlanFeatures>(form.featureFlagsJson, 'Feature flags'),
      limits: parseJsonObject<AdminPlanLimits>(form.limitsJson, 'Limits'),
    }

    if (!payload.code) {
      throw new Error('Code is required')
    }
    if (!payload.name) {
      throw new Error('Name is required')
    }
    if (!Number.isFinite(payload.price) || payload.price < 0) {
      throw new Error('Price must be a valid number greater than or equal to 0')
    }
    if (!Number.isFinite(payload.durationDays || 0) || (payload.durationDays || 0) <= 0) {
      throw new Error('Duration must be a positive number of days')
    }

    return payload
  }

  const submitPlan = async () => {
    setSaving(true)
    try {
      const payload = buildPayload()
      if (editingPlan) {
        await adminApi.updatePlan(editingPlan.id, payload)
        toast({ title: 'Plan updated', variant: 'success' })
      } else {
        await adminApi.createPlan(payload)
        toast({ title: 'Plan created', variant: 'success' })
      }
      setDialogOpen(false)
      await fetchPlans()
    } catch (error: any) {
      toast({
        title: editingPlan ? 'Failed to update plan' : 'Failed to create plan',
        description: error?.response?.data?.message || error?.message || 'Unknown error',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const deletePlan = async (plan: AdminPlan) => {
    const confirmed = window.confirm(`Delete plan "${plan.name}" (${plan.code})?`)
    if (!confirmed) return

    try {
      await adminApi.deletePlan(plan.id)
      toast({ title: 'Plan removed', variant: 'success' })
      await fetchPlans()
    } catch (error: any) {
      toast({
        title: 'Failed to remove plan',
        description: error?.response?.data?.message || error?.message || 'Unknown error',
        variant: 'error',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Plans</h1>
          <p className="text-muted-foreground">Plan catalog: Google Play (mobile) + Stripe (website) billing &amp; entitlement management.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchPlans} disabled={loading} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" /> New Plan
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total Plans</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-bold">{stats.active}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Visible</p><p className="text-2xl font-bold">{stats.visible}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Paid</p><p className="text-2xl font-bold">{stats.paid}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan Definitions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : plans.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No plans configured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Code</th>
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Price</th>
                    <th className="pb-3 pr-4 font-medium">Google Product</th>
                    <th className="pb-3 pr-4 font-medium">Stripe Price</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {plans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-muted/40">
                      <td className="py-3 pr-4 font-medium">{plan.code}</td>
                      <td className="py-3 pr-4">{plan.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {Number(plan.price || 0).toFixed(2)} {(plan.currency || 'usd').toUpperCase()} / {plan.billingCycle || 'monthly'}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{plan.googleProductId || '—'}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{plan.stripePriceId || '—'}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={plan.isActive ? 'success' : 'secondary'}>{plan.isActive ? 'Active' : 'Inactive'}</Badge>
                          <Badge variant={plan.isVisible ? 'outline' : 'secondary'}>{plan.isVisible ? 'Visible' : 'Hidden'}</Badge>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEditDialog(plan)}>
                          <Pencil className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deletePlan(plan)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Plan' : 'Create Plan'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Code</label>
                <Input value={form.code} onChange={(e) => onFormChange('code', e.target.value)} placeholder="premium_monthly" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name</label>
                <Input value={form.name} onChange={(e) => onFormChange('name', e.target.value)} placeholder="Premium Monthly" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={form.description} onChange={(e) => onFormChange('description', e.target.value)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Price</label>
                <Input value={form.price} onChange={(e) => onFormChange('price', e.target.value)} type="number" step="0.01" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Currency</label>
                <Input value={form.currency} onChange={(e) => onFormChange('currency', e.target.value)} placeholder="usd" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Billing Cycle</label>
                <Select value={form.billingCycle} onValueChange={(value) => onFormChange('billingCycle', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">monthly</SelectItem>
                    <SelectItem value="yearly">yearly</SelectItem>
                    <SelectItem value="weekly">weekly</SelectItem>
                    <SelectItem value="one_time">one_time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Duration Days</label>
                <Input value={form.durationDays} onChange={(e) => onFormChange('durationDays', e.target.value)} type="number" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Google Product ID</label>
                <Input
                  value={form.googleProductId}
                  onChange={(e) => onFormChange('googleProductId', e.target.value)}
                  placeholder="com.methna.app.premium_monthly"
                />
                <p className="text-xs text-muted-foreground">Mobile (Android) billing via Google Play</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Google Base Plan ID</label>
                <Input
                  value={form.googleBasePlanId}
                  onChange={(e) => onFormChange('googleBasePlanId', e.target.value)}
                  placeholder="monthly001"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Stripe Price ID</label>
                <Input
                  value={form.stripePriceId}
                  onChange={(e) => onFormChange('stripePriceId', e.target.value)}
                  placeholder="price_xxx"
                />
                <p className="text-xs text-muted-foreground">Website billing via Stripe Checkout</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Stripe Product ID</label>
                <Input
                  value={form.stripeProductId}
                  onChange={(e) => onFormChange('stripeProductId', e.target.value)}
                  placeholder="prod_xxx"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Sort Order</label>
                <Input value={form.sortOrder} onChange={(e) => onFormChange('sortOrder', e.target.value)} type="number" />
              </div>
              <div className="flex items-end justify-between rounded-md border px-3 py-2">
                <span className="text-sm">Active</span>
                <Switch checked={form.isActive} onCheckedChange={(checked) => onFormChange('isActive', checked)} />
              </div>
              <div className="flex items-end justify-between rounded-md border px-3 py-2">
                <span className="text-sm">Visible</span>
                <Switch checked={form.isVisible} onCheckedChange={(checked) => onFormChange('isVisible', checked)} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Feature Flags (JSON)</label>
                <Textarea
                  className="min-h-[180px] font-mono text-xs"
                  value={form.featureFlagsJson}
                  onChange={(e) => onFormChange('featureFlagsJson', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Limits (JSON)</label>
                <Textarea
                  className="min-h-[180px] font-mono text-xs"
                  value={form.limitsJson}
                  onChange={(e) => onFormChange('limitsJson', e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submitPlan} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingPlan ? 'Save Changes' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
