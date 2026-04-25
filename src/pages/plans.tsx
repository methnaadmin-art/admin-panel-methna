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
  iosProductId: string
  stripePriceId: string
  stripeProductId: string
  durationDays: string
  sortOrder: string
  isActive: boolean
  isVisible: boolean
  featureFlags: AdminPlanFeatures
  limitsJson: string
}

interface FeatureFlagOption {
  key: keyof AdminPlanFeatures
  label: string
  description?: string
}

const EMPTY_FEATURES: AdminPlanFeatures = {}
const EMPTY_LIMITS: AdminPlanLimits = {}

const FEATURE_FLAG_OPTIONS: FeatureFlagOption[] = [
  { key: 'unlimitedLikes', label: 'Unlimited Likes' },
  { key: 'unlimitedRewinds', label: 'Unlimited Rewinds' },
  { key: 'advancedFilters', label: 'Advanced Filters' },
  { key: 'seeWhoLikesYou', label: 'See Who Likes You' },
  { key: 'whoLikedMe', label: 'Who Liked Me' },
  { key: 'readReceipts', label: 'Read Receipts' },
  { key: 'typingIndicators', label: 'Typing Indicators' },
  { key: 'invisibleMode', label: 'Invisible Mode' },
  { key: 'ghostMode', label: 'Ghost Mode' },
  { key: 'passportMode', label: 'Passport Mode' },
  { key: 'boost', label: 'Boost Access' },
  { key: 'likes', label: 'Likes Access' },
  { key: 'premiumBadge', label: 'Premium Badge' },
  { key: 'hideAds', label: 'Hide Ads' },
  { key: 'rematch', label: 'Rematch' },
  { key: 'videoChat', label: 'Video Chat' },
  { key: 'superLike', label: 'Super Like' },
  { key: 'profileBoostPriority', label: 'Profile Boost Priority' },
  { key: 'priorityMatching', label: 'Priority Matching' },
  { key: 'improvedVisits', label: 'Improved Visits' },
]

const normalizeFeatureFlags = (value?: AdminPlanFeatures | null): AdminPlanFeatures => {
  const normalized: AdminPlanFeatures = {}

  for (const option of FEATURE_FLAG_OPTIONS) {
    const featureValue = value?.[option.key]
    if (typeof featureValue === 'boolean') {
      normalized[option.key] = featureValue
    }
  }

  return normalized
}

const normalizeFeatureFlagsFromPlan = (
  value?: AdminPlanFeatures | null,
  entitlements?: Record<string, any> | null,
): AdminPlanFeatures => {
  const normalized = normalizeFeatureFlags(value)

  for (const option of FEATURE_FLAG_OPTIONS) {
    if (typeof normalized[option.key] === 'boolean') {
      continue
    }

    const entitlementValue = entitlements?.[option.key]
    if (typeof entitlementValue === 'boolean') {
      normalized[option.key] = entitlementValue
    }
  }

  return normalized
}

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
      iosProductId: '',
      stripePriceId: '',
      stripeProductId: '',
      durationDays: '30',
      sortOrder: '0',
      isActive: true,
      isVisible: true,
      featureFlags: normalizeFeatureFlags(EMPTY_FEATURES),
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
    iosProductId: plan.iosProductId || plan.appleProductId || '',
    stripePriceId: plan.stripePriceId || '',
    stripeProductId: plan.stripeProductId || '',
    durationDays: String(plan.durationDays ?? 30),
    sortOrder: String(plan.sortOrder ?? 0),
    isActive: Boolean(plan.isActive ?? true),
    isVisible: Boolean(plan.isVisible ?? true),
    featureFlags: normalizeFeatureFlagsFromPlan(
      plan.featureFlags || EMPTY_FEATURES,
      plan.entitlements,
    ),
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

  const onFeatureFlagChange = (key: keyof AdminPlanFeatures, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      featureFlags: {
        ...prev.featureFlags,
        [key]: checked,
      },
    }))
  }

  const onFormChange = (
    key: Exclude<keyof PlanFormState, 'featureFlags'>,
    value: string | boolean,
  ) => {
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
      androidProductId: form.googleProductId.trim() || undefined,
      googleBasePlanId: form.googleBasePlanId.trim() || undefined,
      iosProductId: form.iosProductId.trim() || undefined,
      appleProductId: form.iosProductId.trim() || undefined,
      durationDays: Number(form.durationDays || 30),
      sortOrder: Number(form.sortOrder || 0),
      isActive: form.isActive,
      isVisible: form.isVisible,
      featureFlags: normalizeFeatureFlags(form.featureFlags),
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

    const googleProductId = payload.googleProductId?.trim() || undefined
    const googleBasePlanId = payload.googleBasePlanId?.trim() || undefined
    const iosProductId = payload.iosProductId?.trim() || undefined
    const isPaidPlan = payload.price > 0

    payload.googleProductId = googleProductId
    payload.androidProductId = googleProductId
    payload.googleBasePlanId = googleBasePlanId
    payload.iosProductId = iosProductId
    payload.appleProductId = iosProductId

    if ((googleProductId && !googleBasePlanId) || (!googleProductId && googleBasePlanId)) {
      throw new Error('Google Product ID and Google Base Plan ID must both be provided together')
    }

    if (isPaidPlan && !googleProductId) {
      throw new Error('Google Product ID is required for paid plans')
    }

    if (isPaidPlan && !googleBasePlanId) {
      throw new Error('Google Base Plan ID is required for paid plans')
    }

    if (googleProductId && googleBasePlanId) {
      const normalizedProduct = googleProductId.toLowerCase()
      const normalizedBasePlan = googleBasePlanId.toLowerCase()
      const duplicate = plans.find((plan) => {
        if (editingPlan && plan.id === editingPlan.id) {
          return false
        }

        return (
          String(plan.googleProductId || '').trim().toLowerCase() === normalizedProduct &&
          String(plan.googleBasePlanId || '').trim().toLowerCase() === normalizedBasePlan
        )
      })

      if (duplicate) {
        throw new Error(
          `Google mapping ${googleProductId} + ${googleBasePlanId} is already used by plan ${duplicate.code}`,
        )
      }
    }

    if (iosProductId) {
      const normalizedIosProduct = iosProductId.toLowerCase()
      const duplicate = plans.find((plan) => {
        if (editingPlan && plan.id === editingPlan.id) {
          return false
        }

        return String(plan.iosProductId || plan.appleProductId || '').trim().toLowerCase() === normalizedIosProduct
      })

      if (duplicate) {
        throw new Error(`Apple Product ID ${iosProductId} is already used by plan ${duplicate.code}`)
      }
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
          <p className="text-muted-foreground">Plan catalog: Google Play, App Store, and Stripe billing &amp; entitlement management.</p>
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
                    <th className="pb-3 pr-4 font-medium">Apple Product</th>
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
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{plan.googleProductId || '-'}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{plan.iosProductId || plan.appleProductId || '-'}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{plan.stripePriceId || '-'}</td>
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
                <p className="text-xs text-muted-foreground">Mobile (Android) billing via Google Play. Can be shared across plans when base plans differ.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Google Base Plan ID</label>
                <Input
                  value={form.googleBasePlanId}
                  onChange={(e) => onFormChange('googleBasePlanId', e.target.value)}
                  placeholder="monthly001"
                />
                <p className="text-xs text-muted-foreground">Required for paid plans. Unique with Google Product ID as a pair.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Apple Product ID</label>
                <Input
                  value={form.iosProductId}
                  onChange={(e) => onFormChange('iosProductId', e.target.value)}
                  placeholder="com.methnapp.app.premium_monthly"
                />
                <p className="text-xs text-muted-foreground">iOS billing via App Store Connect. Keep separate from Google Play product IDs.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Stripe Price ID</label>
                <Input
                  value={form.stripePriceId}
                  readOnly
                  placeholder="Generated automatically after save"
                />
                <p className="text-xs text-muted-foreground">Website billing via Stripe Checkout. Paid plans auto-create or refresh this value when you save.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Stripe Product ID</label>
                <Input
                  value={form.stripeProductId}
                  readOnly
                  placeholder="Generated automatically after save"
                />
                <p className="text-xs text-muted-foreground">Generated by the backend from the plan code, name, billing cycle, and price.</p>
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Feature Flags</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {FEATURE_FLAG_OPTIONS.map((option) => (
                  <div key={option.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="pr-4">
                      <p className="text-sm">{option.label}</p>
                      {option.description ? (
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      ) : null}
                    </div>
                    <Switch
                      checked={Boolean(form.featureFlags[option.key])}
                      onCheckedChange={(checked) => onFeatureFlagChange(option.key, checked)}
                    />
                  </div>
                ))}
              </div>
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
