import { useEffect, useMemo, useState } from 'react'
import { supabase, buildCommentsFilter, isAdmin, type Comment as CommentRow } from '../supabase/supabaseClient'
import '../styles/Comment.css'
import type { User } from '@supabase/supabase-js'

type Props = {
	categoryId: number | null
	linkId: number | null
	userId: string | null
	open?: boolean
	onCountChange?: (count: number) => void
	initialComments?: CommentRow[]
}

type CommentTreeNode = CommentRow & { replies: CommentTreeNode[] }

function buildCommentTree(items: CommentRow[]): CommentTreeNode[] {
	const map = new Map<number, CommentTreeNode>()
	const roots: CommentTreeNode[] = []
	for (const item of items) {
		const node: CommentTreeNode = { ...item, replies: [] }
		map.set(item.id, node)
	}
	for (const item of items) {
		const node = map.get(item.id)
		if (!node) continue
		const parentId = typeof item.parent_id === 'number' ? item.parent_id : null
		if (parentId && map.has(parentId)) {
			map.get(parentId)!.replies.push(node)
		} else {
			roots.push(node)
		}
	}
	return roots
}

export default function Comment({ categoryId, linkId, userId, open = false, onCountChange, initialComments }: Props) {
	const [comments, setComments] = useState<CommentRow[]>(() => initialComments ?? [])
	const [text, setText] = useState('')
	const [loading, setLoading] = useState(() => initialComments === undefined)

	const filter = useMemo(() => buildCommentsFilter({ categoryId, linkId }), [categoryId, linkId])
	const [adminEmail, setAdminEmail] = useState<string | undefined>(undefined)
	const [currentUser, setCurrentUser] = useState<{ id: string; email?: string | null; username?: string | null } | null>(null)
	const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({})
	const [replyTexts, setReplyTexts] = useState<Record<number, string>>({})
	const [initialLoadComplete, setInitialLoadComplete] = useState(() => initialComments !== undefined)

	const activeUserId = currentUser?.id ?? userId ?? null
	const canReply = Boolean(activeUserId)
	const admin = isAdmin(adminEmail)
	const commentTree = useMemo(() => buildCommentTree(comments), [comments])
	const getTimestamp = (value?: string) => (value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER)

	const appendComments = (rows: CommentRow[] | CommentRow | null | undefined) => {
		if (!rows) return
		const list = Array.isArray(rows) ? rows : [rows]
		if (list.length === 0) return
		setComments(prev => {
			const merged = [...prev, ...list]
			merged.sort((a, b) => getTimestamp(a.created_at) - getTimestamp(b.created_at))
			onCountChange?.(merged.length)
			return merged
		})
		setInitialLoadComplete(true)
	}

	const load = async (showSpinner = true) => {
		if (showSpinner) setLoading(true)
		let query = supabase.from('comments').select('*').order('created_at', { ascending: true })
		if (categoryId === null) query = query.is('category_id', null)
		else if (typeof categoryId === 'number') query = query.eq('category_id', categoryId)
		if (linkId === null) query = query.is('link_id', null)
		else if (typeof linkId === 'number') query = query.eq('link_id', linkId)
		const { data, error } = await query
		if (error) console.error(error)
		const fetched = (data ?? []) as CommentRow[]
		setComments(fetched)
		setReplyOpen({})
		setReplyTexts({})
		setLoading(false)
		setInitialLoadComplete(true)
		onCountChange?.(fetched.length)
	}

	useEffect(() => {
		if (initialComments !== undefined) {
			setInitialLoadComplete(true)
			setLoading(false)
			onCountChange?.(initialComments.length)
		}
		load(initialComments === undefined)
		// capture current user email for admin check and cache user info
		supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
			const user = data.user
			setAdminEmail(user?.email)
			if (user) {
				const meta = (user.user_metadata ?? {}) as { username?: string | null }
				setCurrentUser({ id: user.id, email: user.email, username: meta.username ?? undefined })
			} else {
				setCurrentUser(null)
			}
		})
		const channel = supabase
			.channel(`comments-${filter || 'all'}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter }, () => {
				load(false)
			})
			.subscribe()
		return () => {
			supabase.removeChannel(channel)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filter])

		const submit = async () => {
			if (!activeUserId) return alert('请先登录再评论')
			const content = text.trim()
			if (!content) return
			const { data: ures } = await supabase.auth.getUser()
			const user = ures.user
			if (!user) return alert('请重新登录后再试')
			const meta = (user.user_metadata ?? {}) as { username?: string | null }
			const author_name = meta.username ?? user.email?.split('@')[0] ?? '用户'
			const author_email = user.email ?? null
			const payload: Partial<CommentRow> = {
				content,
				category_id: categoryId,
				link_id: linkId,
				parent_id: null,
				author_id: user.id,
				author_name,
				author_email,
			}
			const { data: inserted, error } = await supabase.from('comments').insert(payload).select().single<CommentRow>()
			if (error) return alert(error.message)
			setText('')
			appendComments(inserted)
		}

		const toggleReply = (id: number) => {
			setReplyOpen(prev => ({ ...prev, [id]: !prev[id] }))
		}

		const handleReplyTextChange = (id: number, value: string) => {
			setReplyTexts(prev => ({ ...prev, [id]: value }))
		}

		const submitReply = async (parent: CommentTreeNode) => {
			if (!canReply) return alert('请先登录再回复')
			const content = (replyTexts[parent.id] ?? '').trim()
			if (!content) return
			const { data: ures } = await supabase.auth.getUser()
			const user = ures.user
			if (!user) return alert('请重新登录后再试')
			const meta = (user.user_metadata ?? {}) as { username?: string | null }
			const author_name = meta.username ?? user.email?.split('@')[0] ?? '用户'
			const author_email = user.email ?? null
			const payload: Partial<CommentRow> = {
				content,
				category_id: parent.category_id ?? categoryId,
				link_id: parent.link_id ?? linkId,
				parent_id: parent.id,
				author_id: user.id,
				author_name,
				author_email,
			}
			const { data: inserted, error } = await supabase.from('comments').insert(payload).select().single<CommentRow>()
			if (error) return alert(error.message)
			setReplyTexts(prev => ({ ...prev, [parent.id]: '' }))
			setReplyOpen(prev => ({ ...prev, [parent.id]: false }))
			appendComments(inserted)
		}

	const removeFromState = (id: number) => {
		setComments(prev => {
			// remove the comment and any children recursively
			const idsToRemove = new Set<number>()
			const collect = (cid: number) => {
				idsToRemove.add(cid)
				for (const c of prev) {
					if (c.parent_id === cid) collect(c.id)
				}
			}
			collect(id)
			const filtered = prev.filter(c => !idsToRemove.has(c.id))
			onCountChange?.(filtered.length)
			return filtered
		})
	}

	const del = async (id: number) => {
		const ok = confirm('确认删除该评论？')
		if (!ok) return
		const { error } = await supabase.from('comments').delete().eq('id', id)
		if (error) return alert(error.message)
		// remove from local state
		removeFromState(id)
	}

	const formatTime = (date: string | undefined) => {
		if (!date) return '未知时间'
		const commentDate = new Date(date)
		if (Number.isNaN(commentDate.getTime())) return date
		return commentDate.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
	}

	const renderNode = (node: CommentTreeNode) => {
		const isReplyOpen = Boolean(replyOpen[node.id])
		const replyValue = replyTexts[node.id] ?? ''
		const showToolbar = canReply || admin
		return (
			<li key={node.id} className="comment-row">
				<div className="comment-box">
					<div className="comment-grid">
						<div className="body-col">
							<div className="body-header">
								<span className="author">{node.author_name ?? '匿名'}</span>
								<div className="meta-actions">
									<span className="time">{formatTime(node.created_at)}</span>
									<div className="meta-buttons">
										{canReply && (
											<button className="reply" onClick={() => toggleReply(node.id)} title={isReplyOpen ? '取消回复' : '回复'}>
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
											</button>
										)}
										{(admin || activeUserId === node.author_id) && (
											<button className="delete" onClick={() => del(node.id)} title="删除">
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
											</button>
										)}
									</div>
								</div>
							</div>
							<div className="content">{node.content}</div>
						</div>
						<div className="meta-col" />
					</div>
					{showToolbar && (
						<div className="comment-toolbar">
							{canReply && (
								<button className="reply" onClick={() => toggleReply(node.id)} title={isReplyOpen ? '取消回复' : '回复'}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
								</button>
							)}
							{(admin || activeUserId === node.author_id) && (
								<button className="delete" onClick={() => del(node.id)} title="删除">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
								</button>
							)}
						</div>
					)}
				</div>
				{isReplyOpen && canReply && (
					<div className="reply-form">
						<textarea
							value={replyValue}
							onChange={(e) => handleReplyTextChange(node.id, e.target.value)}
							placeholder={`回复 ${node.author_name ?? '匿名'}…`}
						/>
						<div className="reply-actions">
							<button onClick={() => submitReply(node)} title="发送回复">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
							</button>
						</div>
					</div>
				)}
				{node.replies.length > 0 && (
					<ul className="comment-children">
						{node.replies.map((child) => renderNode(child))}
					</ul>
				)}
			</li>
		)
	}

	return (
		<div className="comment">
			{open && (
				<div className="comment-panel">
					<div className="comment-input">
						<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="说点什么…" />
						<button onClick={submit} title="发表">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
						</button>
					</div>
					{!initialLoadComplete ? (
						<div className="comment-loading">
							{Array.from({ length: 3 }).map((_, idx) => (
								<div key={idx} className="skeleton-row">
									<div className="skeleton-avatar" />
									<div className="skeleton-content">
										<div className="skeleton-line short" />
										<div className="skeleton-line" />
									</div>
								</div>
							))}
						</div>
					) : (
						<>
							{loading && <div className="comment-refresh muted">正在刷新评论…</div>}
							<ul className="comment-list">
								{commentTree.length === 0 && !loading ? (
									<li className="comment-empty muted">暂无评论，抢个沙发吧～</li>
								) : (
									commentTree.map((node) => renderNode(node))
								)}
							</ul>
						</>
					)}
				</div>
			)}
		</div>
	)
}

