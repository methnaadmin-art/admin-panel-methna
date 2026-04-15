import { useCallback, useEffect, useState } from 'react'
import {
  adminApi,
  type ConsumableProduct,
  type ConsumableProductPayload,
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
  Archive,
  Heart,
  MessageCircle,
  Zap,
} from 'lucide-react'

interface ProductFormState {
  code: string
  title: string
  description: string
  type: 'likes_pack' | 'compliments_pack' | 'boosts_pack'
  quantity: string
  price: string
  currency: string
  platformAvailability: 'all' | 'mobile' | 'web'
  sortOrder: string
  googleProductId: string
  stripePriceId: string
  stripeProductId: string
  isActive: boolean
}

const createInitialFormState = (product?: ConsumableProduct): ProductFormState => {
  if (!product) {
    return {
      code: '',
      title: '',
      description: '',
      type: 'likes_pack',
      quantity: '10',
      price: '0.99',
      currency: 'usd',
      platformAvailability: 'all',
      sortOrder: '0',
      googleProductId: '',
      stripePriceId: '',
      stripeProductId: '',
      isActive: true,
    }
  }
  return {
    code: product.code,
    title: product.title,
    description: product.description || '',
    type: product.type,
    quantity: String(product.quantity),
    price: String(product.price),
    currency: product.currency,
    platformAvailability: product.platformAvailability,
    sortOrder: String(product.sortOrder),
    googleProductId: product.googleProductId || '',
    stripePriceId: product.stripePriceId || '',
    stripeProductId: product.stripeProductId || '',
    isActive: product.isActive,
  }
}

const TYPE_ICON = {
  likes_pack: Heart,
  compliments_pack: MessageCircle,
  boosts_pack: Zap,
}

const TYPE_LABEL = {
  likes_pack: 'Likes',
  compliments_pack: 'Compliments',
  boosts_pack: 'Boosts',
}

const TYPE_COLOR = {
  likes_pack: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  compliments_pack: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  boosts_pack: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
}

export default function ConsumablesPage() {
  const { toast } = useToast()
  const [products, setProducts] = useState<ConsumableProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ConsumableProduct | null>(null)
  const [form, setForm] = useState<ProductFormState>(createInitialFormState())
  const [filterType, setFilterType] = useState<string>('all')

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.getConsumableProducts({
        type: filterType !== 'all' ? filterType : undefined,
      })
      setProducts(res.data?.items || res.data || [])
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to load consumable products', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [filterType, toast])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const openCreateDialog = () => {
    setEditingProduct(null)
    setForm(createInitialFormState())
    setDialogOpen(true)
  }

  const openEditDialog = (product: ConsumableProduct) => {
    setEditingProduct(product)
    setForm(createInitialFormState(product))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.code.trim() || !form.title.trim()) {
      toast({ title: 'Validation Error', description: 'Code and title are required', variant: 'error' })
      return
    }
    const quantity = parseInt(form.quantity, 10)
    const price = parseFloat(form.price)
    if (quantity < 1) {
      toast({ title: 'Validation Error', description: 'Quantity must be at least 1', variant: 'error' })
      return
    }
    if (price <= 0) {
      toast({ title: 'Validation Error', description: 'Price must be greater than 0', variant: 'error' })
      return
    }

    setSaving(true)
    try {
      const payload: ConsumableProductPayload = {
        code: form.code.trim(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        quantity,
        price,
        currency: form.currency.trim() || 'usd',
        platformAvailability: form.platformAvailability,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
        googleProductId: form.googleProductId.trim() || undefined,
        stripePriceId: form.stripePriceId.trim() || undefined,
        stripeProductId: form.stripeProductId.trim() || undefined,
      }

      if (editingProduct) {
        await adminApi.updateConsumableProduct(editingProduct.id, { ...payload, isActive: form.isActive })
        toast({ title: 'Updated', description: `Product "${form.title}" updated successfully` })
      } else {
        await adminApi.createConsumableProduct(payload)
        toast({ title: 'Created', description: `Product "${form.title}" created successfully` })
      }

      setDialogOpen(false)
      fetchProducts()
    } catch (err: any) {
      toast({ title: 'Error', description: err.response?.data?.message || err.message || 'Save failed', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (product: ConsumableProduct) => {
    if (!confirm(`Archive "${product.title}"? This will make it unavailable for purchase but preserves history.`)) return
    try {
      await adminApi.archiveConsumableProduct(product.id)
      toast({ title: 'Archived', description: `"${product.title}" has been archived` })
      fetchProducts()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Archive failed', variant: 'error' })
    }
  }

  const handleToggleActive = async (product: ConsumableProduct) => {
    try {
      await adminApi.updateConsumableProduct(product.id, { isActive: !product.isActive })
      toast({ title: product.isActive ? 'Deactivated' : 'Activated', description: `"${product.title}" ${product.isActive ? 'deactivated' : 'activated'}` })
      fetchProducts()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Toggle failed', variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Consumable Products</h1>
          <p className="text-muted-foreground">Manage likes, compliments, and boosts packs</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="likes_pack">Likes Packs</SelectItem>
              <SelectItem value="compliments_pack">Compliments Packs</SelectItem>
              <SelectItem value="boosts_pack">Boosts Packs</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchProducts}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No consumable products found. Create your first product pack.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const Icon = TYPE_ICON[product.type]
            return (
              <Card key={product.id} className={!product.isActive || product.isArchived ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      <CardTitle className="text-lg">{product.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge className={TYPE_COLOR[product.type]} variant="secondary">
                        {TYPE_LABEL[product.type]}
                      </Badge>
                      {product.isArchived && <Badge variant="outline">Archived</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Code:</span>{' '}
                      <code className="text-xs bg-muted px-1 rounded">{product.code}</code>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quantity:</span>{' '}
                      <span className="font-semibold">+{product.quantity}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Price:</span>{' '}
                      <span className="font-semibold">${product.price} {product.currency.toUpperCase()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Platform:</span>{' '}
                      <span className="capitalize">{product.platformAvailability}</span>
                    </div>
                  </div>

                  {product.description && (
                    <p className="text-sm text-muted-foreground">{product.description}</p>
                  )}

                  <div className="space-y-1 text-xs">
                    {product.googleProductId && (
                      <div>
                        <span className="text-muted-foreground">Google Play:</span>{' '}
                        <code className="bg-muted px-1 rounded">{product.googleProductId}</code>
                      </div>
                    )}
                    {product.stripePriceId && (
                      <div>
                        <span className="text-muted-foreground">Stripe Price:</span>{' '}
                        <code className="bg-muted px-1 rounded">{product.stripePriceId}</code>
                      </div>
                    )}
                    {product.stripeProductId && (
                      <div>
                        <span className="text-muted-foreground">Stripe Product:</span>{' '}
                        <code className="bg-muted px-1 rounded">{product.stripeProductId}</code>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={product.isActive}
                        onCheckedChange={() => handleToggleActive(product)}
                        disabled={product.isArchived}
                      />
                      <span className="text-sm text-muted-foreground">
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(product)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!product.isArchived && (
                        <Button variant="ghost" size="sm" onClick={() => handleArchive(product)}>
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Consumable Product' : 'Create Consumable Product'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Code *</label>
                <Input
                  placeholder="likes_10"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.replace(/[^a-z0-9_]/g, '') })}
                  disabled={!!editingProduct}
                />
                <p className="text-xs text-muted-foreground">Lowercase, alphanumeric + underscores</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Title *</label>
                <Input
                  placeholder="10 Likes"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Pack of 10 likes for your profile..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Type *</label>
                <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="likes_pack">Likes Pack</SelectItem>
                    <SelectItem value="compliments_pack">Compliments Pack</SelectItem>
                    <SelectItem value="boosts_pack">Boosts Pack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity *</label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Price *</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <Input
                  placeholder="usd"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Platform</label>
                <Select value={form.platformAvailability} onValueChange={(v: any) => setForm({ ...form, platformAvailability: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    <SelectItem value="mobile">Mobile Only</SelectItem>
                    <SelectItem value="web">Web Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Sort Order</label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Provider Mappings</h3>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Google Play Product ID</label>
                  <Input
                    placeholder="com.methnapp.app.likes_10"
                    value={form.googleProductId}
                    onChange={(e) => setForm({ ...form, googleProductId: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Stripe Price ID</label>
                  <Input
                    placeholder="price_abc123"
                    value={form.stripePriceId}
                    onChange={(e) => setForm({ ...form, stripePriceId: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Stripe Product ID</label>
                  <Input
                    placeholder="prod_xyz"
                    value={form.stripeProductId}
                    onChange={(e) => setForm({ ...form, stripeProductId: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {editingProduct && (
              <div className="flex items-center gap-2 border-t pt-4">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
                <label className="text-sm">Active</label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {editingProduct ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
