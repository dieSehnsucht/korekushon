import { useEffect, useState, useCallback } from 'react'
import { supabase, type Link } from '../supabase/supabaseClient'
import Home from './Home'
import Comment from './Comment'
import { ensurePrefetch, getPrefetchedComments, getPrefetchedData, getPrefetchedLinks, invalidatePrefetch, type PrefetchedData } from '../utils/prefetchCache'

type Props = {
	admin: boolean
	user: { id: string } | null
	selectedCategoryId: number | null
}

export default function Content({ admin, user, selectedCategoryId }: Props) {
	if (selectedCategoryId == null) {
		return <Home userId={user?.id ?? null} />
	}
	return <CategoryLinks categoryId={selectedCategoryId} admin={admin} userId={user?.id ?? null} />
}

function CategoryLinks({ categoryId, admin, userId }: { categoryId: number; admin: boolean; userId: string | null }) {
	const prefetched = getPrefetchedData()
	const [links, setLinks] = useState<Link[]>(() => getPrefetchedLinks(categoryId) ?? [])
	const [loading, setLoading] = useState(() => !prefetched)
	const [addMode, setAddMode] = useState(false)
	const [newTitle, setNewTitle] = useState('')
	const [newUrl, setNewUrl] = useState('')
	const [categoryName, setCategoryName] = useState<string>(() => {
		const cat = prefetched?.categories.find((c) => c.id === categoryId)
		return cat?.name || `栏目 #${categoryId}`
	})
	const [commentOpens, setCommentOpens] = useState<Record<number, boolean>>({})
	const [commentCounts, setCommentCounts] = useState<Record<number, number>>(() => {
		const map: Record<number, number> = {}
		prefetched?.comments.forEach((c) => {
			if (c.category_id === categoryId && c.link_id != null) {
				map[c.link_id] = (map[c.link_id] || 0) + 1
			}
		})
		return map
	})
	const [categoryCommentsCount, setCategoryCommentsCount] = useState<number>(() => {
		if (!prefetched) return 0
		let total = 0
		prefetched.comments.forEach((c) => {
			if (c.category_id === categoryId && c.link_id != null) total += 1
		})
		return total
	})
	const [editingId, setEditingId] = useState<number | null>(null)
	const [editTitle, setEditTitle] = useState('')
	const [editUrl, setEditUrl] = useState('')

		const hydrateFromPrefetch = useCallback((data: PrefetchedData | null) => {
			if (!data) return
			const filtered = data.links.filter((l) => l.category_id === categoryId)
			setLinks(filtered)
			const map: Record<number, number> = {}
			let total = 0
			data.comments.forEach((c) => {
				if (c.category_id === categoryId && c.link_id != null) {
					map[c.link_id] = (map[c.link_id] || 0) + 1
					total += 1
				}
			})
			setCommentCounts(map)
			setCategoryCommentsCount(total)
			const cat = data.categories.find((c) => c.id === categoryId)
			setCategoryName(cat?.name || `栏目 #${categoryId}`)
		}, [categoryId])

		useEffect(() => {
			hydrateFromPrefetch(prefetched)
			let mounted = true
			setLoading(!prefetched)
			ensurePrefetch()
				.then((data) => {
					if (!mounted) return
					hydrateFromPrefetch(data)
					setLoading(false)
				})
				.catch((error) => console.error('category links prefetch failed', error))
			return () => { mounted = false }
		}, [categoryId, hydrateFromPrefetch, prefetched])

	const formatDate = (value?: string | null) => {
		if (!value) return '未知日期'
		const d = new Date(value)
		if (Number.isNaN(d.getTime())) return value
		return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
	}

	const toggleComment = (linkId: number) => {
		setCommentOpens(prev => ({ ...prev, [linkId]: !prev[linkId] }))
	}

	const addLink = async () => {
		if (!newTitle.trim() || !newUrl.trim()) return alert('标题和链接都不能为空')
		const { error } = await supabase.from('links').insert({ category_id: categoryId, title: newTitle.trim(), url: newUrl.trim() })
		if (error) return alert(error.message)
		setNewTitle('')
		setNewUrl('')
		setAddMode(false)
		invalidatePrefetch()
		ensurePrefetch().then((data) => hydrateFromPrefetch(data)).catch(() => undefined)
	}

	const cancelAdd = () => {
		setNewTitle('')
		setNewUrl('')
		setAddMode(false)
	}

		const removeLink = async (id: number) => {
			const ok = confirm('确认删除该内容？')
			if (!ok) return
			const { error } = await supabase.from('links').delete().eq('id', id)
			if (error) return alert(error.message)
			invalidatePrefetch()
			ensurePrefetch().then((data) => hydrateFromPrefetch(data)).catch(() => undefined)
		}

	const startEdit = (link: Link) => {
		setEditingId(link.id)
		setEditTitle(link.title || '')
		setEditUrl(link.url || '')
	}

	const saveEdit = async () => {
		if (editingId == null) return
		if (!editTitle.trim() || !editUrl.trim()) return alert('标题和链接都不能为空')
		const { error } = await supabase.from('links').update({ title: editTitle.trim(), url: editUrl.trim() }).eq('id', editingId)
		if (error) return alert(error.message)
		setEditingId(null)
		setEditTitle('')
		setEditUrl('')
		invalidatePrefetch()
		ensurePrefetch().then((data) => hydrateFromPrefetch(data)).catch(() => undefined)
	}

	const cancelEdit = () => {
		setEditingId(null)
		setEditTitle('')
		setEditUrl('')
	}

	return (
		<div className="content-wrap">
			<div className="content-header">
				<h2>{categoryName} <span className="muted">  评论 {categoryCommentsCount} 条</span></h2>
				{admin && !addMode && <button onClick={() => setAddMode(true)}>新增内容</button>}
			</div>
			{addMode && (
				<div className="add-link-form">
					<input
						type="text"
						placeholder="内容标题"
						value={newTitle}
						onChange={(e) => setNewTitle(e.target.value)}
					/>
					<input
						type="url"
						placeholder="链接 URL"
						value={newUrl}
						onChange={(e) => setNewUrl(e.target.value)}
					/>
					<button onClick={addLink}>添加</button>
					<button onClick={cancelAdd}>取消</button>
				</div>
			)}
			{loading && <div className="muted">加载中…</div>}
			<ul className="links-list">
						{links.map((l, idx) => (
							<li key={l.id} className="link-item">
								<div className="link-row">
									<span className="index">{idx + 1}.</span>{' '}
									{editingId === l.id ? (
										<>
											<input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
											<input value={editUrl} onChange={e => setEditUrl(e.target.value)} />
											<button onClick={saveEdit}>保存</button>
											<button onClick={cancelEdit}>取消</button>
										</>
									) : (
										<>
											<a href={l.url} target="_blank" rel="noreferrer">{l.title}</a>
											{' '}
											<button className="comment-toggle" onClick={() => toggleComment(l.id)}>
												评论 {commentOpens[l.id] ? '▲' : '▼'} ({commentCounts[l.id] || 0})
											</button>
											{admin && (
												<>
													{' '}
													<button onClick={() => removeLink(l.id)}>删除</button>
													<button onClick={() => startEdit(l)}>编辑</button>
												</>
											)}
										</>
									)}
								</div>
								<div className="link-meta muted">添加于 {formatDate(l.created_at)}</div>
								<Comment
									categoryId={categoryId}
									linkId={l.id}
									userId={userId}
									open={commentOpens[l.id] || false}
									onCountChange={(c) => {
										setCommentCounts(prev => {
											const next = { ...prev, [l.id]: c }
											const total = Object.values(next).reduce((sum, val) => sum + val, 0)
											setCategoryCommentsCount(total)
											return next
										})
									}}
									initialComments={getPrefetchedComments(categoryId, l.id) ?? undefined}
								/>
							</li>
						))}
			</ul>
		</div>
	)
}

