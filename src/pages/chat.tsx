import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { ConversationDetail, Message } from '@/types'
import { formatDateTime, formatDate } from '@/lib/utils'
import {
  Loader2, MessageSquare, Search, ArrowLeft, Flag, Lock, Unlock,
  User, ChevronLeft, ChevronRight, AlertTriangle, ExternalLink,
} from 'lucide-react'

function HighlightedText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) return <>{text}</>
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return ''
}

const extractCollection = (payload: unknown): Record<string, any>[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of ['conversations', 'messages', 'items', 'results', 'rows', 'data']) {
    const candidate = payload[key]
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
    if (isRecord(candidate)) {
      const nested = extractCollection(candidate)
      if (nested.length > 0) {
        return nested
      }
    }
  }

  return []
}

const normalizeConversation = (conversation: Record<string, any>): ConversationDetail | null => {
  const user1 = isRecord(conversation.user1) ? conversation.user1 : isRecord(conversation.participant1) ? conversation.participant1 : undefined
  const user2 = isRecord(conversation.user2) ? conversation.user2 : isRecord(conversation.participant2) ? conversation.participant2 : undefined
  const id = pickString(conversation.id, conversation.conversationId)
  const user1Id = pickString(conversation.user1Id, conversation.participant1Id, user1?.id)
  const user2Id = pickString(conversation.user2Id, conversation.participant2Id, user2?.id)

  if (!id || !user1Id || !user2Id) {
    return null
  }

  return {
    id,
    matchId: pickString(conversation.matchId),
    user1Id,
    user2Id,
    lastMessageContent: pickString(conversation.lastMessageContent, conversation.lastMessage?.content, conversation.lastMessage?.message),
    lastMessageAt: pickString(conversation.lastMessageAt, conversation.lastMessage?.createdAt, conversation.updatedAt),
    lastMessageSenderId: pickString(conversation.lastMessageSenderId, conversation.lastMessage?.senderId),
    user1UnreadCount: Number(conversation.user1UnreadCount ?? conversation.unreadCountUser1 ?? 0),
    user2UnreadCount: Number(conversation.user2UnreadCount ?? conversation.unreadCountUser2 ?? 0),
    user1Muted: Boolean(conversation.user1Muted),
    user2Muted: Boolean(conversation.user2Muted),
    isActive: conversation.isActive !== false,
    isLocked: Boolean(conversation.isLocked),
    lockReason: pickString(conversation.lockReason),
    isFlagged: Boolean(conversation.isFlagged),
    flagReason: pickString(conversation.flagReason),
    createdAt: pickString(conversation.createdAt, conversation.updatedAt) || new Date().toISOString(),
    updatedAt: pickString(conversation.updatedAt, conversation.createdAt) || new Date().toISOString(),
    user1: user1 as any,
    user2: user2 as any,
    lastMessage: isRecord(conversation.lastMessage) ? conversation.lastMessage as any : undefined,
  }
}

const normalizeMessage = (message: Record<string, any>): Message | null => {
  const id = pickString(message.id, message.messageId)
  const conversationId = pickString(message.conversationId)
  const senderId = pickString(message.senderId, message.sender?.id)

  if (!id || !conversationId || !senderId) {
    return null
  }

  return {
    id,
    conversationId,
    senderId,
    content: pickString(message.content, message.body, message.text, message.message) || '[No message content]',
    type: pickString(message.type) || 'text',
    isRead: Boolean(message.isRead ?? message.status === 'seen'),
    isDelivered: Boolean(message.isDelivered ?? (message.status === 'delivered' || message.status === 'seen')),
    createdAt: pickString(message.createdAt, message.sentAt) || new Date().toISOString(),
    sender: isRecord(message.sender) ? message.sender as any : undefined,
  }
}

export default function ChatPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [conversations, setConversations] = useState<ConversationDetail[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 20

  const [selectedConvo, setSelectedConvo] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [msgSearch, setMsgSearch] = useState('')
  const [msgPage, setMsgPage] = useState(1)
  const [msgTotal, setMsgTotal] = useState(0)
  const msgLimit = 50

  const [lockDialog, setLockDialog] = useState<{ open: boolean; id: string; locked: boolean }>({ open: false, id: '', locked: false })
  const [lockReason, setLockReason] = useState('')
  const [flagDialog, setFlagDialog] = useState<{ open: boolean; id: string; flagged: boolean }>({ open: false, id: '', flagged: false })
  const [flagReason, setFlagReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await adminApi.getConversations(page, limit, search || undefined)
      const normalizedList = extractCollection(data)
        .map((conversation) => normalizeConversation(conversation))
        .filter((conversation): conversation is ConversationDetail => Boolean(conversation))
      const trimmedSearch = search.trim().toLowerCase()
      const list = trimmedSearch
        ? normalizedList.filter((conversation) => {
            const haystack = [
              `${conversation.user1?.firstName || ''} ${conversation.user1?.lastName || ''}`,
              `${conversation.user2?.firstName || ''} ${conversation.user2?.lastName || ''}`,
              conversation.user1?.email || '',
              conversation.user2?.email || '',
              conversation.lastMessageContent || '',
            ].join(' ').toLowerCase()

            return haystack.includes(trimmedSearch)
          })
        : normalizedList
      setConversations(list)
      setTotal(trimmedSearch ? list.length : Number(data?.total ?? list.length))
    } catch (err) {
      console.error(err)
      setConversations([])
      setTotal(0)
      setError('Unable to load conversations right now.')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  const fetchMessages = useCallback(async () => {
    if (!selectedConvo) return
    setMessagesLoading(true)
    setMessagesError('')
    try {
      const { data } = await adminApi.getConversationMessages(selectedConvo.id, msgPage, msgLimit, msgSearch || undefined)
      const normalizedList = extractCollection(data)
        .map((message) => normalizeMessage(message))
        .filter((message): message is Message => Boolean(message))
      const trimmedSearch = msgSearch.trim().toLowerCase()
      const list = trimmedSearch
        ? normalizedList.filter((message) => {
            const haystack = [
              message.content,
              `${message.sender?.firstName || ''} ${message.sender?.lastName || ''}`,
              message.sender?.email || '',
            ].join(' ').toLowerCase()

            return haystack.includes(trimmedSearch)
          })
        : normalizedList
      setMessages(list)
      setMsgTotal(trimmedSearch ? list.length : Number(data?.total ?? list.length))
    } catch (err) {
      console.error(err)
      setMessages([])
      setMsgTotal(0)
      setMessagesError('Unable to load this conversation yet.')
    } finally {
      setMessagesLoading(false)
    }
  }, [selectedConvo, msgPage, msgSearch])

  useEffect(() => {
    if (selectedConvo) fetchMessages()
  }, [selectedConvo, msgPage, msgSearch, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleLock = async () => {
    setActionLoading(true)
    try {
      if (lockDialog.locked) {
        await adminApi.unlockConversation(lockDialog.id)
      } else {
        await adminApi.lockConversation(lockDialog.id, lockReason)
      }
      await fetchConversations()
      if (selectedConvo?.id === lockDialog.id) {
        setSelectedConvo(prev => prev ? { ...prev, isLocked: !lockDialog.locked, lockReason: lockDialog.locked ? undefined : lockReason } : null)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoading(false)
      setLockDialog({ open: false, id: '', locked: false })
      setLockReason('')
    }
  }

  const handleFlag = async () => {
    setActionLoading(true)
    try {
      if (flagDialog.flagged) {
        await adminApi.unflagConversation(flagDialog.id)
      } else {
        await adminApi.flagConversation(flagDialog.id, flagReason)
      }
      await fetchConversations()
      if (selectedConvo?.id === flagDialog.id) {
        setSelectedConvo(prev => prev ? { ...prev, isFlagged: !flagDialog.flagged, flagReason: flagDialog.flagged ? undefined : flagReason } : null)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoading(false)
      setFlagDialog({ open: false, id: '', flagged: false })
      setFlagReason('')
    }
  }

  const openConversation = (convo: ConversationDetail) => {
    setSelectedConvo(convo)
    setMsgSearch('')
    setMsgPage(1)
    setMessagesError('')
  }

  const totalPages = Math.ceil(total / limit)
  const msgTotalPages = Math.ceil(msgTotal / msgLimit)

  // ─── CONVERSATION DETAIL VIEW (WhatsApp-style) ──────────────
  if (selectedConvo) {
    const user1Name = selectedConvo.user1
      ? `${selectedConvo.user1.firstName} ${selectedConvo.user1.lastName}`
      : selectedConvo.user1Id.slice(0, 8)
    const user2Name = selectedConvo.user2
      ? `${selectedConvo.user2.firstName} ${selectedConvo.user2.lastName}`
      : selectedConvo.user2Id.slice(0, 8)
    const user1Photo = (selectedConvo.user1 as any)?.profile?.photos?.[0]?.url || (selectedConvo.user1 as any)?.photos?.[0]?.url
    const user2Photo = (selectedConvo.user2 as any)?.profile?.photos?.[0]?.url || (selectedConvo.user2 as any)?.photos?.[0]?.url

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedConvo(null); setMessages([]) }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold truncate">{user1Name} & {user2Name}</h2>
              {selectedConvo.isLocked && <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" /> Locked</Badge>}
              {selectedConvo.isFlagged && <Badge variant="warning" className="gap-1"><Flag className="h-3 w-3" /> Flagged</Badge>}
              {!selectedConvo.isActive && <Badge variant="secondary">Inactive</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Created {formatDate(selectedConvo.createdAt)}
              {selectedConvo.lastMessageAt && ` · Last activity ${formatDateTime(selectedConvo.lastMessageAt)}`}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button size="sm" variant="outline" onClick={() => navigate(`/users/${selectedConvo.user1Id}`)} className="gap-1">
              <ExternalLink className="h-3 w-3" /> {user1Name.split(' ')[0]}
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/users/${selectedConvo.user2Id}`)} className="gap-1">
              <ExternalLink className="h-3 w-3" /> {user2Name.split(' ')[0]}
            </Button>
            <Button
              size="sm"
              variant={selectedConvo.isFlagged ? 'outline' : 'default'}
              onClick={() => setFlagDialog({ open: true, id: selectedConvo.id, flagged: selectedConvo.isFlagged })}
              className="gap-1"
            >
              <Flag className="h-3 w-3" /> {selectedConvo.isFlagged ? 'Unflag' : 'Flag'}
            </Button>
            <Button
              size="sm"
              variant={selectedConvo.isLocked ? 'outline' : 'destructive'}
              onClick={() => setLockDialog({ open: true, id: selectedConvo.id, locked: selectedConvo.isLocked })}
              className="gap-1"
            >
              {selectedConvo.isLocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {selectedConvo.isLocked ? 'Unlock' : 'Lock'}
            </Button>
          </div>
        </div>

        {/* Flag/Lock reason display */}
        {selectedConvo.isFlagged && selectedConvo.flagReason && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
            <Flag className="h-4 w-4 shrink-0" />
            <span>Flag reason: {selectedConvo.flagReason}</span>
          </div>
        )}
        {selectedConvo.isLocked && selectedConvo.lockReason && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800">
            <Lock className="h-4 w-4 shrink-0" />
            <span>Lock reason: {selectedConvo.lockReason}</span>
          </div>
        )}

        {/* Message search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search messages by keyword..."
            value={msgSearch}
            onChange={(e) => { setMsgSearch(e.target.value); setMsgPage(1) }}
            className="pl-9"
          />
        </div>

        {/* Chat messages - WhatsApp style */}
        {messagesError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {messagesError}
          </div>
        )}
        <Card className="overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto p-4 space-y-3 bg-muted/20">
            {messagesLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('chat.noMessages')}</p>
            ) : (
              messages.map((msg) => {
                const isUser1 = msg.senderId === selectedConvo.user1Id
                const senderName = msg.sender
                  ? `${msg.sender.firstName} ${msg.sender.lastName}`
                  : msg.senderId.slice(0, 8)
                const senderPhoto = (msg.sender as any)?.profile?.photos?.[0]?.url || (msg.sender as any)?.photos?.[0]?.url

                return (
                  <div key={msg.id} className={`flex gap-2 ${isUser1 ? 'justify-start' : 'justify-end'}`}>
                    <div className={`flex gap-2 max-w-[75%] ${isUser1 ? '' : 'flex-row-reverse'}`}>
                      <Avatar className="h-8 w-8 shrink-0 mt-1">
                        {senderPhoto && <AvatarImage src={senderPhoto} />}
                        <AvatarFallback className="text-[10px]">{senderName.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className={`rounded-2xl px-4 py-2.5 ${isUser1 ? 'bg-white border' : 'bg-primary text-primary-foreground'}`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-semibold ${isUser1 ? 'text-blue-600' : 'text-primary-foreground/80'}`}>
                            {senderName}
                          </span>
                          <Badge variant={isUser1 ? 'secondary' : 'outline'} className={`text-[9px] h-4 ${isUser1 ? '' : 'border-primary-foreground/30 text-primary-foreground/70'}`}>
                            {msg.type || 'text'}
                          </Badge>
                        </div>
                        <p className={`text-sm whitespace-pre-wrap break-words ${isUser1 ? '' : 'text-primary-foreground'}`}>
                          <HighlightedText text={msg.content} highlight={msgSearch} />
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] ${isUser1 ? 'text-muted-foreground' : 'text-primary-foreground/60'}`}>
                            {formatDateTime(msg.createdAt)}
                          </span>
                          {(msg as any).status === 'seen' && <span className="text-[10px] text-blue-500">✓✓</span>}
                          {(msg as any).status === 'delivered' && <span className="text-[10px] text-muted-foreground">✓✓</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </Card>

        {/* Message pagination */}
        {msgTotalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {msgTotal} messages · Page {msgPage} of {msgTotalPages}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={msgPage <= 1} onClick={() => setMsgPage(msgPage - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={msgPage >= msgTotalPages} onClick={() => setMsgPage(msgPage + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Flag Dialog */}
        <Dialog open={flagDialog.open} onOpenChange={(open) => { if (!open) setFlagDialog({ open: false, id: '', flagged: false }) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{flagDialog.flagged ? 'Unflag Conversation' : 'Flag Conversation'}</DialogTitle>
              <DialogDescription>
                {flagDialog.flagged ? 'Remove the flag from this conversation.' : 'Flag this conversation for review. Provide a reason.'}
              </DialogDescription>
            </DialogHeader>
            {!flagDialog.flagged && (
              <Textarea
                placeholder="Reason for flagging..."
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                rows={3}
              />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setFlagDialog({ open: false, id: '', flagged: false })}>Cancel</Button>
              <Button
                variant={flagDialog.flagged ? 'outline' : 'default'}
                onClick={handleFlag}
                disabled={actionLoading || (!flagDialog.flagged && !flagReason.trim())}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                {flagDialog.flagged ? 'Unflag' : 'Flag'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Lock Dialog */}
        <Dialog open={lockDialog.open} onOpenChange={(open) => { if (!open) setLockDialog({ open: false, id: '', locked: false }) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{lockDialog.locked ? 'Unlock Conversation' : 'Lock Conversation'}</DialogTitle>
              <DialogDescription>
                {lockDialog.locked
                  ? 'Unlocking will allow participants to send messages again.'
                  : 'Locking will prevent participants from sending messages. Provide a reason.'}
              </DialogDescription>
            </DialogHeader>
            {!lockDialog.locked && (
              <Textarea
                placeholder="Reason for locking..."
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                rows={3}
              />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setLockDialog({ open: false, id: '', locked: false })}>Cancel</Button>
              <Button
                variant={lockDialog.locked ? 'outline' : 'destructive'}
                onClick={handleLock}
                disabled={actionLoading || (!lockDialog.locked && !lockReason.trim())}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : lockDialog.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {lockDialog.locked ? 'Unlock' : 'Lock'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ─── CONVERSATION LIST VIEW ────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('chat.title')}</h1>
          <p className="text-muted-foreground">{t('chat.subtitle')}</p>
        </div>
        <Badge variant="secondary">{total} conversations</Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by sender or receiver name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t('chat.conversations')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button variant="outline" onClick={() => void fetchConversations()}>
                Retry
              </Button>
            </div>
          ) : conversations.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t('chat.noConversations')}</p>
          ) : (
            <div className="divide-y">
              {conversations.map((convo) => {
                const p1Name = convo.user1 ? `${convo.user1.firstName} ${convo.user1.lastName}` : convo.user1Id.slice(0, 8)
                const p2Name = convo.user2 ? `${convo.user2.firstName} ${convo.user2.lastName}` : convo.user2Id.slice(0, 8)
                const p1Photo = (convo.user1 as any)?.profile?.photos?.[0]?.url || (convo.user1 as any)?.photos?.[0]?.url
                const p2Photo = (convo.user2 as any)?.profile?.photos?.[0]?.url || (convo.user2 as any)?.photos?.[0]?.url
                const unread = convo.user1UnreadCount + convo.user2UnreadCount

                return (
                  <div
                    key={convo.id}
                    className="flex items-center gap-3 py-3 px-2 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => openConversation(convo)}
                  >
                    <div className="flex -space-x-2">
                      <Avatar className="h-9 w-9 border-2 border-background">
                        {p1Photo && <AvatarImage src={p1Photo} />}
                        <AvatarFallback className="text-[10px]">{p1Name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <Avatar className="h-9 w-9 border-2 border-background">
                        {p2Photo && <AvatarImage src={p2Photo} />}
                        <AvatarFallback className="text-[10px]">{p2Name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{p1Name}</span>
                        <span className="text-xs text-muted-foreground">&</span>
                        <span className="text-sm font-medium truncate">{p2Name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {convo.lastMessageContent || 'No messages yet'}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {convo.lastMessageAt ? formatDateTime(convo.lastMessageAt) : formatDate(convo.createdAt)}
                      </span>
                      <div className="flex gap-1">
                        {convo.isLocked && <Badge variant="destructive" className="text-[9px] h-4 gap-0.5"><Lock className="h-2.5 w-2.5" /></Badge>}
                        {convo.isFlagged && <Badge variant="warning" className="text-[9px] h-4 gap-0.5"><Flag className="h-2.5 w-2.5" /></Badge>}
                        {!convo.isActive && <Badge variant="secondary" className="text-[9px] h-4">Inactive</Badge>}
                        {unread > 0 && <Badge variant="default" className="text-[9px] h-4">{unread}</Badge>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
