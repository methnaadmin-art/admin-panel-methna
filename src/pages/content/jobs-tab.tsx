import { useEffect, useState } from 'react'
import { Plus, Edit, Trash2, Loader2, Globe, Building2, MapPin } from 'lucide-react'
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

interface JobVacancy {
  id: string
  title: string
  description: string
  requirements: string
  benefits: string
  type: string
  location: string
  department: string
  salaryRange: string
  applicationUrl: string
  applicationEmail: string
  isActive: boolean
  locale: string
}

export function JobsTab() {
  const [jobs, setJobs] = useState<JobVacancy[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  // Add/Edit State
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<JobVacancy | null>(null)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    requirements: '',
    benefits: '',
    type: 'full_time',
    location: '',
    department: '',
    salaryRange: '',
    applicationUrl: '',
    applicationEmail: '',
    isActive: true,
    locale: 'en',
  })

  // Delete State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [jobToDelete, setJobToDelete] = useState<string | null>(null)

  const fetchJobs = async () => {
    setLoading(true)
    try {
      const res = await contentApi.getAllJobs()
      const payload = res.data?.data || res.data
      const list = Array.isArray(payload)
        ? payload
        : payload?.jobs || payload?.items || payload?.results || []
      const normalized = (Array.isArray(list) ? list : []).map((job: any) => ({
        ...job,
        id: job.id || job._id,
      }))
      setJobs(normalized)
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to fetch jobs', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [])

  const handleOpenAdd = () => {
    setEditingJob(null)
    setFormData({
      title: '', description: '', requirements: '', benefits: '',
      type: 'full_time', location: '', department: '', salaryRange: '',
      applicationUrl: '', applicationEmail: '', isActive: true, locale: 'en'
    })
    setDialogOpen(true)
  }

  const handleOpenEdit = (job: JobVacancy) => {
    setEditingJob(job)
    setFormData({
      title: job.title,
      description: job.description,
      requirements: job.requirements || '',
      benefits: job.benefits || '',
      type: job.type,
      location: job.location || '',
      department: job.department || '',
      salaryRange: job.salaryRange || '',
      applicationUrl: job.applicationUrl || '',
      applicationEmail: job.applicationEmail || '',
      isActive: job.isActive,
      locale: job.locale,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.title || !formData.description) return
    setSubmitting(true)
    try {
      if (editingJob) {
        await contentApi.updateJob(editingJob.id, formData)
        toast({ title: 'Success', description: 'Job updated successfully' })
      } else {
        await contentApi.createJob(formData)
        toast({ title: 'Success', description: 'Job created successfully' })
      }
      setDialogOpen(false)
      fetchJobs()
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to save job', variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!jobToDelete) return
    try {
      await contentApi.deleteJob(jobToDelete)
      toast({ title: 'Success', description: 'Job deleted' })
      setDeleteConfirmOpen(false)
      fetchJobs()
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete job', variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Manage job vacancies for your careers page.</div>
        <Button onClick={handleOpenAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Post Job
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
          No active job postings.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <div key={job.id} className="flex flex-col border rounded-xl p-4 bg-background shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold text-base line-clamp-1">{job.title}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] uppercase font-medium">{job.type.replace('_', ' ')}</Badge>
                    {job.isActive ? (
                      <Badge variant="success" className="bg-emerald-100/50 text-emerald-800 hover:bg-emerald-100 text-[10px]">Active</Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-red-100/50 text-red-800 text-[10px]">Closed</Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex-1 mt-3 space-y-2 text-xs text-muted-foreground">
                {job.department && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{job.department}</span>
                  </div>
                )}
                {job.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{job.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t text-[10px]">
                   <Globe className="h-3 w-3" /> Locale: <span className="font-medium uppercase">{job.locale}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
                <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(job)} className="h-8 gap-1">
                  <Edit className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 gap-1"
                  onClick={() => {
                    setJobToDelete(job.id);
                    setDeleteConfirmOpen(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJob ? 'Edit Job' : 'Post Job'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Job Title *</label>
                <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
              </div>
              <div className="grid gap-2">
                 <label className="text-sm font-medium">Department</label>
                 <Input placeholder="Engineering" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-2">
               <label className="text-sm font-medium">Description *</label>
               <Textarea rows={4} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                 <label className="text-sm font-medium">Requirements</label>
                 <Textarea rows={3} placeholder="React, Node.js..." value={formData.requirements} onChange={(e) => setFormData({ ...formData, requirements: e.target.value })} />
              </div>
              <div className="grid gap-2">
                 <label className="text-sm font-medium">Benefits</label>
                 <Textarea rows={3} placeholder="Health insurance..." value={formData.benefits} onChange={(e) => setFormData({ ...formData, benefits: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
               <div className="grid gap-2">
                 <label className="text-sm font-medium">Type</label>
                 <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                   <SelectTrigger><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="full_time">Full Time</SelectItem>
                     <SelectItem value="part_time">Part Time</SelectItem>
                     <SelectItem value="contract">Contract</SelectItem>
                     <SelectItem value="remote">Remote</SelectItem>
                     <SelectItem value="internship">Internship</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               <div className="grid gap-2">
                  <label className="text-sm font-medium">Location</label>
                  <Input placeholder="Dubai, UAE" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
               </div>
               <div className="grid gap-2">
                 <label className="text-sm font-medium">Locale</label>
                 <Select value={formData.locale} onValueChange={(v) => setFormData({ ...formData, locale: v })}>
                   <SelectTrigger><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="en">English</SelectItem>
                     <SelectItem value="ar">Arabic</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-medium">Application Email</label>
                <Input type="email" placeholder="hr@methna.com" value={formData.applicationEmail} onChange={(e) => setFormData({ ...formData, applicationEmail: e.target.value })} />
            </div>

            <div className="flex flex-row items-center justify-between mt-2 pt-4 border-t">
              <div className="flex items-center gap-3">
                <Switch checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
                <span className="text-sm font-medium">Active (Open for applications)</span>
              </div>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !formData.title || !formData.description}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this job posting?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
