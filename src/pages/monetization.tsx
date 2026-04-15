import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Loader2, Crown, CreditCard, TrendingUp, Star, Zap, Gift, Plus, Edit2, Trash2, Eye, EyeOff } from 'lucide-react'
import type { DashboardStats } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Boolean feature flags for entitlements editor
const BOOLEAN_FEATURES = [
  { key: 'unlimitedLikes', label: 'Unlimited Likes' },
  { key: 'unlimitedRewinds', label: 'Unlimited Rewinds' },
  { key: 'advancedFilters', label: 'Advanced Filters' },
  { key: 'seeWhoLikesYou', label: 'See Who Likes You' },
  { key: 'readReceipts', label: 'Read Receipts' },
  { key: 'typingIndicators', label: 'Typing Indicators' },
  { key: 'invisibleMode', label: 'Invisible Mode' },
  { key: 'passportMode', label: 'Passport Mode' },
  { key: 'premiumBadge', label: 'Premium Badge' },
  { key: 'hideAds', label: 'Hide Ads' },
  { key: 'rematch', label: 'Rematch' },
  { key: 'videoChat', label: 'Video Chat' },
  { key: 'superLike', label: 'Super Like' },
  { key: 'profileBoostPriority', label: 'Profile Boost Priority' },
  { key: 'priorityMatching', label: 'Priority Matching' },
  { key: 'improvedVisits', label: 'Improved Visits' },
]

// Numeric limits for entitlements editor
const NUMERIC_LIMITS = [
  { key: 'dailyLikes', label: 'Daily Likes', defaultVal: 25 },
  { key: 'dailySuperLikes', label: 'Daily Super Likes', defaultVal: 0 },
  { key: 'dailyCompliments', label: 'Daily Compliments', defaultVal: 0 },
  { key: 'monthlyRewinds', label: 'Monthly Rewinds', defaultVal: 2 },
  { key: 'weeklyBoosts', label: 'Weekly Boosts', defaultVal: 0 },
]

const BILLING_CYCLES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'one_time', label: 'One Time' },
]

const defaultEntitlements = () => ({
  dailyLikes: 25, dailySuperLikes: 0, dailyCompliments: 0, monthlyRewinds: 2, weeklyBoosts: 0,
  unlimitedLikes: false, unlimitedRewinds: false, advancedFilters: false,
  seeWhoLikesYou: false, readReceipts: false, typingIndicators: false,
  invisibleMode: false, passportMode: false, premiumBadge: false,
  hideAds: false, rematch: false, videoChat: false, superLike: false,
  profileBoostPriority: false, priorityMatching: false, improvedVisits: false,
})

const defaultFormData = () => ({
  code: '', name: '', description: '', price: 0, currency: 'usd',
  billingCycle: 'monthly', stripePriceId: '', googleProductId: '', durationDays: 30,
  isActive: true, isVisible: true, sortOrder: 0,
  entitlements: defaultEntitlements(),
  features: [],
  dailyLikesLimit: 25, dailySuperLikesLimit: 0, dailyComplimentsLimit: 0,
  monthlyRewindsLimit: 2, weeklyBoostsLimit: 0,
})

export default function MonetizationPage() {
  const { t } = useTranslation()
  const [plans, setPlans] = useState<any[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Plan Edit State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<any>(null)
  const [formData, setFormData] = useState<any>(defaultFormData())

  const load = async () => {
    setLoading(true)
    try {
      const [plansRes, statsRes] = await Promise.allSettled([
        adminApi.getPlans(),
        adminApi.getStats(),
      ])
      if (plansRes.status === 'fulfilled') {
        setPlans(plansRes.value.data || [])
      }
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleOpenModal = (plan: any = null) => {
    if (plan) {
      setEditingPlan(plan)
      // Merge existing entitlements with defaults for any missing keys
      const ent = { ...defaultEntitlements(), ...(plan.entitlements || {}) }
      setFormData({ ...plan, entitlements: ent })
    } else {
      setEditingPlan(null)
      setFormData(defaultFormData())
    }
    setIsModalOpen(true)
  }

  const handleSavePlan = async () => {
    try {
      // Sync entitlements → legacy columns for backward compat
      const ent = formData.entitlements || {}
      const payload = {
        ...formData,
        dailyLikesLimit: ent.dailyLikes ?? formData.dailyLikesLimit,
        dailySuperLikesLimit: ent.dailySuperLikes ?? formData.dailySuperLikesLimit ?? 0,
        dailyComplimentsLimit: ent.dailyCompliments ?? formData.dailyComplimentsLimit,
        monthlyRewindsLimit: ent.monthlyRewinds ?? formData.monthlyRewindsLimit,
        weeklyBoostsLimit: ent.weeklyBoosts ?? formData.weeklyBoostsLimit,
      }

      if (editingPlan) {
        await adminApi.updatePlan(editingPlan.id, payload)
      } else {
        await adminApi.createPlan(payload)
      }
      setIsModalOpen(false)
      load()
    } catch (err) {
      console.error('Error saving plan', err)
    }
  }

  const handleDeletePlan = async (id: string) => {
    if (!window.confirm('Delete this plan? Active subscribers will cause it to be deactivated instead.')) return
    try {
      await adminApi.deletePlan(id)
      load()
    } catch (err) {
      console.error('Error deleting plan', err)
    }
  }

  const toggleEntitlement = (key: string) => {
    setFormData((prev: any) => ({
      ...prev,
      entitlements: {
        ...prev.entitlements,
        [key]: !prev.entitlements?.[key],
      },
    }))
  }

  const setEntitlementLimit = (key: string, value: number) => {
    setFormData((prev: any) => ({
      ...prev,
      entitlements: {
        ...prev.entitlements,
        [key]: value,
      },
    }))
  }

  if (loading && plans.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const planIcons: Record<string, any> = { FREE: Gift, BASIC: Gift, PREMIUM: Star, GOLD: Crown, PLATINUM: Crown }
  const planColors: Record<string, string> = {
    FREE: 'bg-slate-100 text-slate-600',
    BASIC: 'bg-slate-100 text-slate-600',
    PREMIUM: 'bg-purple-100 text-purple-600',
    GOLD: 'bg-amber-100 text-amber-600',
    PLATINUM: 'bg-gray-800 text-gray-100',
  }

  const billingLabel = (cycle: string) => {
    const found = BILLING_CYCLES.find(b => b.value === cycle)
    return found?.label || cycle
  }

  const formatLimit = (val: number | undefined) => {
    if (val === -1 || val === undefined) return '∞'
    return val
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('monetization.title')}</h1>
          <p className="text-muted-foreground">{t('monetization.subtitle')}</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="gap-2">
          <Plus className="h-4 w-4" /> Create Plan
        </Button>
      </div>

      {/* Revenue Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-amber-50 p-3">
              <Crown className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('monetization.premiumUsers')}</p>
              <p className="text-2xl font-bold">{stats?.revenue?.premiumUsers ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-emerald-50 p-3">
              <TrendingUp className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('monetization.conversionRate')}</p>
              <p className="text-2xl font-bold">{stats?.revenue?.conversionRate ?? '0%'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Plans */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{t('monetization.subscriptionPlans')}</h2>
        {plans.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t('monetization.noPlans')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan: any) => {
              const planKey = (plan.code || plan.name || '').toUpperCase()
              const Icon = planIcons[planKey] || Star
              const colorClass = planColors[planKey] || 'bg-gray-100 text-gray-600'
              const ent = plan.entitlements || {}

              return (
                <Card key={plan.id} className={`relative overflow-hidden ${!plan.isActive ? 'opacity-50 grayscale' : ''}`}>
                  {!plan.isVisible && plan.isActive && (
                    <div className="absolute top-2 right-2 text-muted-foreground"><EyeOff className="h-4 w-4" /></div>
                  )}
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2.5 ${colorClass}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{plan.name}</CardTitle>
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{plan.code}</span>
                        </div>
                        <p className="text-2xl font-bold mt-1">
                          {plan.currency?.toUpperCase() === 'USD' ? '$' : ''}{plan.price}
                          <span className="text-sm text-muted-foreground font-normal">/{billingLabel(plan.billingCycle)}</span>
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 h-64 overflow-y-auto">
                    {plan.stripePriceId && (
                      <p className="text-xs text-muted-foreground mb-1 font-mono">Stripe: {plan.stripePriceId}</p>
                    )}
                    {plan.googleProductId && (
                      <p className="text-xs text-muted-foreground mb-2 font-mono">Google Play: {plan.googleProductId}</p>
                    )}
                    <div className="text-xs text-muted-foreground mb-2 grid grid-cols-2 gap-1">
                      <p>Likes: {formatLimit(ent.dailyLikes ?? plan.dailyLikesLimit)}/d</p>
                      <p>Super Likes: {formatLimit(ent.dailySuperLikes ?? plan.dailySuperLikesLimit)}/d</p>
                      <p>Rewinds: {formatLimit(ent.monthlyRewinds ?? plan.monthlyRewindsLimit)}/mo</p>
                      <p>Compliments: {formatLimit(ent.dailyCompliments ?? plan.dailyComplimentsLimit)}/d</p>
                      <p>Boosts: {formatLimit(ent.weeklyBoosts ?? plan.weeklyBoostsLimit)}/wk</p>
                    </div>
                    {BOOLEAN_FEATURES.map(f => (
                      ent[f.key] && (
                        <div key={f.key} className="flex items-center gap-2 text-sm mt-1">
                          <span className="text-emerald-500">&#10003;</span>
                          <span>{f.label}</span>
                        </div>
                      )
                    ))}
                  </CardContent>
                  <CardFooter className="flex justify-between bg-muted/20 border-t p-3">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenModal(plan)} className="text-blue-500">
                      <Edit2 className="h-4 w-4 mr-2" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeletePlan(plan.id)} className="text-red-500">
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Plan Edit Modal */}
      {isModalOpen && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPlan ? 'Edit Plan' : 'Create New Plan'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 py-4 md:grid-cols-2">
              {/* Left: Basic Info */}
              <div className="space-y-4">
                <h3 className="font-semibold border-b pb-2">Basic Info</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Code (machine)</label>
                    <Input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toLowerCase().replace(/\s+/g, '_')})} placeholder="e.g. premium" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Display Name</label>
                    <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Premium" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Input value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Short plan description" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium">Price</label>
                    <Input type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Currency</label>
                    <Input value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})} placeholder="usd" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Billing Cycle</label>
                    <Select value={formData.billingCycle} onValueChange={v => setFormData({...formData, billingCycle: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BILLING_CYCLES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Duration (Days)</label>
                    <Input type="number" value={formData.durationDays} onChange={e => setFormData({...formData, durationDays: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Sort Order</label>
                    <Input type="number" value={formData.sortOrder} onChange={e => setFormData({...formData, sortOrder: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Stripe Price ID (optional)</label>
                    <Input value={formData.stripePriceId || ''} onChange={e => setFormData({...formData, stripePriceId: e.target.value || null})} placeholder="price_xxx" />
                    <p className="text-xs text-muted-foreground mt-1">Leave empty to auto-create Stripe Product/Price on save.</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Google Play Product ID (optional)</label>
                    <Input value={formData.googleProductId || ''} onChange={e => setFormData({...formData, googleProductId: e.target.value || null})} placeholder="com.methnapp.app.premium_monthly" />
                    <p className="text-xs text-muted-foreground mt-1">The in-app product ID from Google Play Console. Must match the subscription product ID exactly.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={formData.isActive} onCheckedChange={(v) => setFormData({...formData, isActive: v})} />
                    <label className="text-sm">Active</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={formData.isVisible} onCheckedChange={(v) => setFormData({...formData, isVisible: v})} />
                    <label className="text-sm">Visible in App</label>
                  </div>
                </div>
                {(formData.price <= 0 || formData.code?.toLowerCase().startsWith('free')) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
                    <strong>Free plan:</strong> This plan will auto-activate for users without requiring Stripe payment. Users will get the configured limits immediately upon subscribing.
                  </div>
                )}

                {/* Numeric Limits */}
                <h3 className="font-semibold border-b pb-2 mt-6">Numeric Limits (-1 = unlimited)</h3>
                <div className="grid grid-cols-2 gap-4">
                  {NUMERIC_LIMITS.map(lim => (
                    <div key={lim.key}>
                      <label className="text-xs font-medium">{lim.label}</label>
                      <Input
                        type="number"
                        value={formData.entitlements?.[lim.key] ?? lim.defaultVal}
                        onChange={e => setEntitlementLimit(lim.key, Number(e.target.value))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Boolean Feature Flags */}
              <div className="space-y-4">
                <h3 className="font-semibold border-b pb-2">Feature Flags</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto">
                  {BOOLEAN_FEATURES.map(feat => (
                    <div key={feat.key} className="flex items-center space-x-2 border p-2 rounded-md">
                      <Switch
                        checked={!!formData.entitlements?.[feat.key]}
                        onCheckedChange={() => toggleEntitlement(feat.key)}
                      />
                      <label className="text-xs flex-1 cursor-pointer" onClick={() => toggleEntitlement(feat.key)}>
                        {feat.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSavePlan}>Save Plan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
