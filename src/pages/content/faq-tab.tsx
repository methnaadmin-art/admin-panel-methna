import { useEffect, useState } from 'react'
import { Plus, Edit, Trash2, Loader2, Globe } from 'lucide-react'
import { contentApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Faq {
  id: string
  question: string
  answer: string
  category: string
  locale: string
  order: number
  isPublished: boolean
}

export function FaqTab() {
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  // State for Add/Edit
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null)
  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category: 'general',
    locale: 'en',
    order: 0,
    isPublished: true,
  })

  // State for Delete
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [faqToDelete, setFaqToDelete] = useState<string | null>(null)

  const fetchFaqs = async () => {
    setLoading(true)
    try {
      const res = await contentApi.getAllFaqs()
      const payload = res.data?.data || res.data
      const list = Array.isArray(payload)
        ? payload
        : payload?.faqs || payload?.items || payload?.results || []
      const normalized = (Array.isArray(list) ? list : []).map((faq: any) => ({
        ...faq,
        id: faq.id || faq._id,
      }))
      setFaqs(normalized)
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to fetch FAQs', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFaqs()
  }, [])

  const handleOpenAdd = () => {
    setEditingFaq(null)
    setFormData({ question: '', answer: '', category: 'general', locale: 'en', order: 0, isPublished: true })
    setDialogOpen(true)
  }

  const handleOpenEdit = (faq: Faq) => {
    setEditingFaq(faq)
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      locale: faq.locale,
      order: faq.order || 0,
      isPublished: faq.isPublished,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.question || !formData.answer) return
    setSubmitting(true)
    try {
      if (editingFaq) {
        await contentApi.updateFaq(editingFaq.id, formData)
        toast({ title: 'Success', description: 'FAQ updated successfully' })
      } else {
        await contentApi.createFaq(formData)
        toast({ title: 'Success', description: 'FAQ created successfully' })
      }
      setDialogOpen(false)
      fetchFaqs()
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to save FAQ', variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!faqToDelete) return
    try {
      await contentApi.deleteFaq(faqToDelete)
      toast({ title: 'Success', description: 'FAQ deleted' })
      setDeleteConfirmOpen(false)
      fetchFaqs()
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete FAQ', variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Manage your help center questions.</div>
        <Button onClick={handleOpenAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add FAQ
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : faqs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
          No FAQs found. Create one to get started.
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground bg-muted/50">
                <th className="p-3 font-medium w-1/3">Question</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium">Locale</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {faqs.map((faq) => (
                <tr key={faq.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <p className="font-medium truncate max-w-xs">{faq.question}</p>
                    <p className="text-muted-foreground truncate max-w-xs text-xs mt-1">{faq.answer}</p>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="capitalize">{faq.category}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Globe className="h-3 w-3" />
                      <span className="uppercase">{faq.locale}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {faq.isPublished ? (
                      <Badge variant="success" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleOpenEdit(faq)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                        onClick={() => {
                          setFaqToDelete(faq.id);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{editingFaq ? 'Edit FAQ' : 'Add FAQ'}</DialogTitle>
            <DialogDescription>
              {editingFaq ? 'Update the details for this question.' : 'Create a new question for the help center.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Question</label>
              <Input
                placeholder="What is Methna?"
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Answer</label>
              <Textarea
                rows={4}
                placeholder="Methna is a..."
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Category</label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="account">Account</SelectItem>
                    <SelectItem value="matching">Matching</SelectItem>
                    <SelectItem value="subscription">Subscription</SelectItem>
                    <SelectItem value="safety">Safety</SelectItem>
                    <SelectItem value="privacy">Privacy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Language (Locale)</label>
                <Select value={formData.locale} onValueChange={(v) => setFormData({ ...formData, locale: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English (EN)</SelectItem>
                    <SelectItem value="ar">Arabic (AR)</SelectItem>
                    <SelectItem value="fr">French (FR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Published</label>
                <span className="text-xs text-muted-foreground">Make this visible to users in the app.</span>
              </div>
              <Switch
                checked={formData.isPublished}
                onCheckedChange={(checked) => setFormData({ ...formData, isPublished: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !formData.question || !formData.answer}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingFaq ? 'Save Changes' : 'Create FAQ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete FAQ</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this question? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete FAQ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
