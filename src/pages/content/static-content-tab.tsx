import { useEffect, useState } from 'react'
import { Loader2, Save, Globe } from 'lucide-react'
import { contentApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'

interface AppContent {
  id: string
  type: string
  title: string
  content: string
  locale: string
  isPublished: boolean
}

export function StaticContentTab() {
  const [contents, setContents] = useState<AppContent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const [selectedType, setSelectedType] = useState('terms')
  const [selectedLocale, setSelectedLocale] = useState('en')

  // The content currently being edited
  const [editingContent, setEditingContent] = useState<AppContent | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    isPublished: true,
  })

  const fetchContents = async () => {
    setLoading(true)
    try {
      const res = await contentApi.getAllContent()
      const payload = res.data?.data || res.data
      const list = Array.isArray(payload)
        ? payload
        : payload?.content || payload?.items || payload?.results || []
      const normalized = (Array.isArray(list) ? list : []).map((content: any) => ({
        ...content,
        id: content.id || content._id,
      }))
      setContents(normalized)
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to fetch contents', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContents()
  }, [])

  // Update form when selections change
  useEffect(() => {
    if (contents.length === 0) return
    const matched = contents.find(c => c.type === selectedType && c.locale === selectedLocale)
    
    if (matched) {
      setEditingContent(matched)
      setFormData({
        title: matched.title,
        content: matched.content,
        isPublished: matched.isPublished,
      })
    } else {
      setEditingContent(null)
      setFormData({
        title: '',
        content: '',
        isPublished: true,
      })
    }
  }, [selectedType, selectedLocale, contents])

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      toast({ title: 'Error', description: 'Title and content are required', variant: 'error' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        type: selectedType,
        locale: selectedLocale,
        ...formData
      }

      if (editingContent) {
        await contentApi.updateContent(editingContent.id, payload)
        toast({ title: 'Success', description: 'Content updated successfully' })
      } else {
        await contentApi.createContent(payload)
        toast({ title: 'Success', description: 'Content created successfully' })
      }
      
      await fetchContents()
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to save content', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-muted/30 p-4 rounded-lg border">
        <div className="flex gap-4 w-full sm:w-auto">
          <div className="grid gap-1.5 w-full sm:w-48">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Page Type</label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="terms">Terms & Conditions</SelectItem>
                <SelectItem value="privacy">Privacy Policy</SelectItem>
                <SelectItem value="about">About Us</SelectItem>
                <SelectItem value="community_guidelines">Community Guidelines</SelectItem>
                <SelectItem value="safety_tips">Safety Tips</SelectItem>
                <SelectItem value="accessibility">Accessibility</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid gap-1.5 w-full sm:w-40">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Globe className="h-3 w-3" /> Language
            </label>
            <Select value={selectedLocale} onValueChange={setSelectedLocale}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English (EN)</SelectItem>
                <SelectItem value="ar">Arabic (AR)</SelectItem>
                <SelectItem value="fr">French (FR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex flex-col items-end">
             <span className="text-xs font-medium">Status</span>
             {editingContent ? (
               editingContent.isPublished ? <Badge variant="success" className="text-[10px] h-5 px-1.5">Live</Badge> : <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Draft</Badge>
             ) : (
               <Badge variant="outline" className="text-[10px] h-5 px-1.5">New Document</Badge>
             )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center border rounded-lg">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6 animate-in fade-in duration-300">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Page Label / Title</label>
            <Input
              placeholder="e.g. Terms of Service"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="max-w-md font-semibold text-lg"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Page Content</label>
              <span className="text-xs text-muted-foreground">Markdown & HTML are supported locally.</span>
            </div>
            <Textarea
              className="min-h-[400px] font-mono text-sm leading-relaxed whitespace-pre-wrap rounded-md"
              placeholder="Write your content here..."
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-3">
              <Switch
                id="publish-toggle"
                checked={formData.isPublished}
                onCheckedChange={(checked) => setFormData({ ...formData, isPublished: checked })}
              />
              <div className="flex flex-col">
                <label htmlFor="publish-toggle" className="text-sm font-medium cursor-pointer">Published to App</label>
                <span className="text-xs text-muted-foreground">When enabled, users can read this in the app.</span>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving || !formData.title || !formData.content} className="gap-2 px-6">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingContent ? 'Save Changes' : 'Create Content'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
