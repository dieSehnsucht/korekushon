import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, type Link } from '../supabase/supabaseClient'
import Home from './Home'
import Collection from './Collection'
import Settings from './Settings'
import Comment from './Comment'
import { COLLECTION_VIEW_ID } from './Sidebar'
export const SETTINGS_VIEW_ID = -2
import { ensurePrefetch, getPrefetchedComments, getPrefetchedData, getPrefetchedLinks, invalidatePrefetch, type PrefetchedData } from '../utils/prefetchCache'
import { addFavoriteToCollection, fetchUserFavoritesInCategory, removeFavoriteFromCollection } from '../utils/favoritesApi'
import Spinner from './Spinner'

type Props = {
	admin: boolean
	user: { id: string } | null
	selectedCategoryId: number | null
	onSelectCategory: (categoryId: number | null) => void
}

export default function Content({ admin, user, selectedCategoryId, onSelectCategory }: Props) {
	if (selectedCategoryId === SETTINGS_VIEW_ID) {
		return <Settings user={user} />
	}
	if (selectedCategoryId === COLLECTION_VIEW_ID) {
		return <Collection userId={user?.id ?? null} onSelectCategory={onSelectCategory} />
	}
	if (selectedCategoryId == null) {
		return <Home userId={user?.id ?? null} admin={admin} />
	}
	return <CategoryLinks categoryId={selectedCategoryId} admin={admin} userId={user?.id ?? null} />
}

export function CategoryLinks({ categoryId, admin, userId }: { categoryId: number; admin: boolean; userId: string | null }) {
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
	// favorites: counts per link and which links current user has favorited
	const [favoriteCounts, setFavoriteCounts] = useState<Record<number, number>>({})
	const [userFavorites, setUserFavorites] = useState<Set<number>>(() => new Set<number>())
	const featuredLinks = useMemo(() => links.filter((l) => l.featured), [links])

	const updateFavoriteCount = (linkId: number, newCount: number) => {
		setFavoriteCounts((prev) => ({ ...prev, [linkId]: newCount }))
		setLinks((prev) => prev.map((item) => (item.id === linkId ? { ...item, favorite_count: newCount } : item)))
	}

	// toggle favorite for current user
	const toggleFavorite = async (link: Link) => {
		if (!userId) {
			alert('请先登录以收藏')
			return
		}
		const has = userFavorites.has(link.id)
		const fallbackCount = favoriteCounts[link.id] ?? link.favorite_count ?? 0
		try {
			if (has) {
				const newCount = await removeFavoriteFromCollection({ userId, categoryId, linkId: link.id })
				setUserFavorites((prev) => {
					const next = new Set(prev)
					next.delete(link.id)
					return next
				})
				const applied = typeof newCount === 'number' ? Math.max(0, newCount) : Math.max(0, fallbackCount - 1)
				updateFavoriteCount(link.id, applied)
			} else {
				const { newCount } = await addFavoriteToCollection({ userId, categoryId, categoryName, linkId: link.id })
				setUserFavorites((prev) => {
					const next = new Set(prev)
					next.add(link.id)
					return next
				})
				const applied = typeof newCount === 'number' ? Math.max(0, newCount) : Math.max(0, fallbackCount + 1)
				updateFavoriteCount(link.id, applied)
			}
		} catch (error) {
			console.error('toggleFavorite error', error)
			if (error instanceof Error) alert(error.message)
			else alert('收藏操作失败，请稍后重试')
		}
	}

	const hydrateFromPrefetch = useCallback((data: PrefetchedData | null) => {
		if (!data) return
		const filtered = data.links.filter((l) => l.category_id === categoryId)
		setLinks(filtered)

		const counts: Record<number, number> = {}
		for (const link of filtered) {
			counts[link.id] = link.favorite_count ?? 0
		}
		setFavoriteCounts(counts)

		if (userId) {
			;(async () => {
				try {
					const { linkIds } = await fetchUserFavoritesInCategory(userId, categoryId)
					setUserFavorites(new Set(linkIds))
				} catch (e) {
					console.error('fetchUserFavoritesInCategory failed', e)
				}
			})()
		} else {
			setUserFavorites(new Set())
		}

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
	}, [categoryId, userId])

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
				<h2>{categoryName} <span className="muted">  总评论：{categoryCommentsCount} </span></h2>
				{admin && !addMode && <button onClick={() => setAddMode(true)} title="新增内容">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
				</button>}
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
					<button onClick={addLink} title="添加">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
					</button>
					<button onClick={cancelAdd} title="取消">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
			)}
			{featuredLinks.length > 0 && (
				<section className="category-featured-block">
					<h3>精选</h3>
					<ul>
						{featuredLinks.map((link) => (
							<li key={link.id} className="home-list-item">
								<div className="home-list-row">
									<div className="home-list-main">
										<a href={link.url} target="_blank" rel="noreferrer" className="home-list-link">{link.title}</a>
									</div>
									<div className="home-list-actions">
										<button className="favorite-toggle" onClick={() => toggleFavorite(link)} title={`收藏 (${favoriteCounts[link.id] || 0})`}>
											<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={userFavorites.has(link.id) ? '#ffc107' : 'none'} stroke={userFavorites.has(link.id) ? '#ffc107' : 'currentColor'} />
											</svg>
											<span className="favorite-count">{favoriteCounts[link.id] || 0}</span>
										</button>
									</div>
								</div>
								<div className="home-list-meta">
									<span className="muted">{formatDate(link.created_at)}</span>
								</div>
							</li>
						))}
					</ul>
				</section>
			)}
			{loading && (
				<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
					<Spinner />
				</div>
			)}
			<ul className="links-list">
						{links.map((l, idx) => (
							<li key={l.id} className="link-item">
								<div className="link-row">
									<span className="index">{idx + 1}.</span>{' '}
									{editingId === l.id ? (
										<>
											<input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
											<input value={editUrl} onChange={e => setEditUrl(e.target.value)} />
											<button onClick={saveEdit} title="保存">
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
											</button>
											<button onClick={cancelEdit} title="取消">
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
											</button>
											<button onClick={() => removeLink(l.id)} title="删除">
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
											</button>
										</>
									) : (
										<>
											<a href={l.url} target="_blank" rel="noreferrer">{l.title}</a>
											{' '}
											<button className="comment-toggle" onClick={() => toggleComment(l.id)} title={`评论 (${commentCounts[l.id] || 0})`}>
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
													<circle cx="8" cy="12" r="1" />
													<circle cx="12" cy="12" r="1" />
													<circle cx="16" cy="12" r="1" />
												</svg>
												<span className="comment-count">{commentCounts[l.id] || 0}</span>
											</button>
											<button className="favorite-toggle" onClick={() => toggleFavorite(l)} title={`收藏 (${favoriteCounts[l.id] || 0})`}>
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={userFavorites.has(l.id) ? '#ffc107' : 'none'} stroke={userFavorites.has(l.id) ? '#ffc107' : 'currentColor'} />
												</svg>
												<span className="favorite-count">{favoriteCounts[l.id] || 0}</span>
											</button>
											{admin && (
												<>
													{' '}
													<button onClick={() => startEdit(l)} title="编辑">
														<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
													</button>
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

