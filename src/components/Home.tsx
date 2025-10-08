import '../styles/Home.css'
import { useEffect, useMemo, useState } from 'react'
import { supabase, fetchCommentsOverview, type Comment as CommentRow } from '../supabase/supabaseClient'
import { addFavoriteToCollection, removeFavoriteFromCollection, fetchUserFavoritesInCategory } from '../utils/favoritesApi'
import Comment from './Comment'
import { ensurePrefetch, getPrefetchedData, invalidatePrefetch, type PrefetchedData } from '../utils/prefetchCache'
import type { Category, Link } from '../supabase/supabaseClient'

type Props = {
  userId: string | null
  admin: boolean
}

export default function Home({ userId, admin }: Props) {
  const prefetched = getPrefetchedData()
  type EnrichedComment = CommentRow & { category_name?: string; link_title?: string; link_url?: string; link_index?: number }
  type LatestEntry = { id: number; title: string; url: string; categoryName: string; categoryId?: number; created_at?: string }

  const buildPerCategory = useMemo(() => {
    return (data: PrefetchedData | null) => {
      if (!data) return [] as Array<{id:number;name:string;commentsCount:number;linksCount:number}>
      const map = new Map<number, { id:number; name:string; commentsCount:number; linksCount:number }>()
      data.categories.forEach(c => {
        map.set(c.id, { id: c.id, name: c.name, commentsCount: 0, linksCount: 0 })
      })
      data.links.forEach(l => {
        const bucket = map.get(l.category_id)
        if (bucket) bucket.linksCount += 1
      })
      data.comments.forEach(c => {
        if (c.category_id != null) {
          const bucket = map.get(c.category_id)
          if (bucket) bucket.commentsCount += 1
        }
      })
      return Array.from(map.values())
    }
  }, [])

  const buildRecent = useMemo(() => {
    return (data: PrefetchedData | null): EnrichedComment[] => {
      if (!data) return []
      const recent = [...data.comments]
  .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  .slice(0, 3)
      const catMap = new Map(data.categories.map(c => [c.id, c.name]))
      const linkMap = new Map(data.links.map(l => [l.id, l]))
      const indexMap = new Map<number, number>()
      const grouped = new Map<number, Array<{ id: number; title: string }>>()
      data.links.forEach(l => {
        const arr = grouped.get(l.category_id) ?? []
        arr.push({ id: l.id, title: l.title })
        grouped.set(l.category_id, arr)
      })
      grouped.forEach(arr => {
        arr.sort((a, b) => a.id - b.id)
        arr.forEach((item, idx) => indexMap.set(item.id, idx + 1))
      })
      return recent.map(r => ({
        ...r,
        category_name: r.category_id ? (catMap.get(r.category_id) ?? '已删除栏目') : '首页',
        link_title: r.link_id ? (linkMap.get(r.link_id)?.title ?? '已删除内容') : '',
        link_url: r.link_id ? (linkMap.get(r.link_id)?.url ?? '') : '',
        link_index: r.link_id ? (indexMap.get(r.link_id) ?? 0) : 0,
      }))
    }
  }, [])

  const buildLatest = useMemo(() => {
    return (data: PrefetchedData | null): LatestEntry[] => {
      if (!data) return []
      const catMap = new Map(data.categories.map(c => [c.id, c.name]))
  return [...data.links]
  .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  .slice(0, 3)
        .map(link => ({
          id: link.id,
          title: link.title,
          url: link.url,
          created_at: link.created_at,
          categoryName: catMap.get(link.category_id) ?? '未知栏目',
        }))
    }
  }, [])

  const [categoryCount, setCategoryCount] = useState<number>(prefetched?.categories.length ?? 0)
  const [linkCount, setLinkCount] = useState<number>(prefetched?.links.length ?? 0)
  const [totalComments, setTotalComments] = useState<number>(prefetched?.comments.length ?? 0)
  const [perCategoryCounts, setPerCategoryCounts] = useState<Array<{id:number;name:string;commentsCount:number;linksCount:number}>>(buildPerCategory(prefetched))
  const [recentComments, setRecentComments] = useState<EnrichedComment[]>(buildRecent(prefetched))
  const [latestLinks, setLatestLinks] = useState<LatestEntry[]>(buildLatest(prefetched))
  const [featuredLinks, setFeaturedLinks] = useState<LatestEntry[]>(() => {
    if (!prefetched) return []
    const catMap = new Map(prefetched.categories.map(c => [c.id, c.name]))
    return prefetched.links.filter(l => l.featured).map(link => ({
      id: link.id,
      title: link.title,
      url: link.url,
      categoryName: catMap.get(link.category_id) ?? '未知栏目',
      categoryId: link.category_id,
      created_at: link.created_at,
    }))
  })
  // favorite counts and user favorites for featured/latest items on home
  const [homeFavoriteCounts, setHomeFavoriteCounts] = useState<Record<number, number>>(() => {
    if (!prefetched) return {}
    const map: Record<number, number> = {}
    prefetched.links.forEach(l => { if (l.favorite_count != null) map[l.id] = l.favorite_count })
    return map
  })
  const [homeUserFavorites, setHomeUserFavorites] = useState<Set<number>>(new Set())
  // admin featured controls
  const [addFeaturedMode, setAddFeaturedMode] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [selectedLinkId, setSelectedLinkId] = useState<number | null>(null)
  const [editingFeaturedId, setEditingFeaturedId] = useState<number | null>(null)
  // edit now chooses an existing link (category -> link), so title/url inputs are not needed
  const [editFeaturedCategoryId, setEditFeaturedCategoryId] = useState<number | null>(null)
  const [editSelectedLinkId, setEditSelectedLinkId] = useState<number | null>(null)

  // computed links for selected category
  const linksForCategory = useMemo(() => {
    if (!prefetched || selectedCategoryId == null) return []
    return prefetched.links.filter(l => l.category_id === selectedCategoryId && !l.featured)
  }, [prefetched, selectedCategoryId])

  const linksForEditCategory = useMemo(() => {
    if (!prefetched || editFeaturedCategoryId == null) return []
    // include the currently editing featured link so it can remain selected
    return prefetched.links.filter(l => l.category_id === editFeaturedCategoryId && (!l.featured || l.id === editingFeaturedId))
  }, [prefetched, editFeaturedCategoryId, editingFeaturedId])

  const addFeatured = async () => {
    if (selectedLinkId == null) return alert('请选择内容')
    const { error } = await supabase.from('links').update({ featured: true }).eq('id', selectedLinkId)
    if (error) return alert(error.message)
    setSelectedLinkId(null)
    setSelectedCategoryId(null)
    setAddFeaturedMode(false)
    invalidatePrefetch()
    ensurePrefetch().then(data => {
      if (data) {
        const catMap = new Map(data.categories.map(c => [c.id, c.name]))
        setFeaturedLinks(data.links.filter(l => l.featured).map(link => ({
          id: link.id,
          title: link.title,
          url: link.url,
          categoryName: catMap.get(link.category_id) ?? '未知栏目',
          categoryId: link.category_id,
          created_at: link.created_at,
        })))
      }
    }).catch(() => undefined)
  }

  const formatDate = (value?: string) => {
    if (!value) return '未知日期'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  useEffect(() => {
    if (!prefetched) return
    setCategoryCount(prefetched.categories.length)
    setLinkCount(prefetched.links.length)
    setTotalComments(prefetched.comments.length)
    setPerCategoryCounts(buildPerCategory(prefetched))
    setRecentComments(buildRecent(prefetched))
    setLatestLinks(buildLatest(prefetched))
    const catMap = new Map(prefetched.categories.map(c => [c.id, c.name]))
    setFeaturedLinks(prefetched.links.filter(l => l.featured).map(link => ({
      id: link.id,
      title: link.title,
      url: link.url,
      categoryName: catMap.get(link.category_id) ?? '未知栏目',
      categoryId: link.category_id,
      created_at: link.created_at,
    })))
    // init counts map for home
    const counts: Record<number, number> = {}
    prefetched.links.forEach(l => { if (typeof l.favorite_count === 'number') counts[l.id] = l.favorite_count })
    setHomeFavoriteCounts(counts)
    // if user present, fetch their favorites for featured categories
    if (userId) {
      (async () => {
        try {
          const featuredCatIds = prefetched.links.filter(l => l.featured).map(l => l.category_id).filter((v): v is number => v != null)
          const latestTop3 = [...prefetched.links].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()).slice(0,3)
          const latestCatIds = latestTop3.map(l => l.category_id).filter((v): v is number => v != null)
          const catSet = new Set<number>([...featuredCatIds, ...latestCatIds])
          const favSet = new Set<number>()
          for (const cid of Array.from(catSet)) {
            const res = await fetchUserFavoritesInCategory(userId, cid)
            res.linkIds.forEach(id => favSet.add(id))
          }
          setHomeUserFavorites(favSet)
        } catch (e) {
          console.error('failed to fetch home user favorites', e)
        }
      })()
    }
  }, [prefetched, buildPerCategory, buildRecent, buildLatest, userId])

  // addFeatured helper removed (unused)

  const startEditFeatured = (link: LatestEntry) => {
    setEditingFeaturedId(link.id)
    // initialize editor to select existing link by default
    const cat = prefetched?.categories.find(c => c.name === link.categoryName)
    setEditFeaturedCategoryId(cat?.id ?? null)
    setEditSelectedLinkId(link.id)
  }

  const saveEditFeatured = async () => {
    if (editingFeaturedId == null) return
    if (editSelectedLinkId == null || editFeaturedCategoryId == null) return alert('请选择栏目和内容')
    // if user didn't change selection, simply close editor and refresh
    if (editSelectedLinkId === editingFeaturedId) {
      setEditingFeaturedId(null)
      setEditFeaturedCategoryId(null)
      setEditSelectedLinkId(null)
      invalidatePrefetch()
      ensurePrefetch().then(data => {
        if (data) {
          const catMap = new Map(data.categories.map(c => [c.id, c.name]))
          setFeaturedLinks(data.links.filter(l => l.featured).map(link => ({
            id: link.id,
            title: link.title,
            url: link.url,
            categoryName: catMap.get(link.category_id) ?? '未知栏目',
            created_at: link.created_at,
          })))
        }
      }).catch(() => undefined)
      return
    }

    // unset old featured, set new one
    const { error: unsetError } = await supabase.from('links').update({ featured: false }).eq('id', editingFeaturedId)
    if (unsetError) return alert(unsetError.message)
    const { error: setError } = await supabase.from('links').update({ featured: true }).eq('id', editSelectedLinkId)
    if (setError) return alert(setError.message)

    setEditingFeaturedId(null)
    setEditFeaturedCategoryId(null)
    setEditSelectedLinkId(null)
    invalidatePrefetch()
    ensurePrefetch().then(data => {
      if (data) {
        const catMap = new Map(data.categories.map(c => [c.id, c.name]))
        setFeaturedLinks(data.links.filter(l => l.featured).map(link => ({
          id: link.id,
          title: link.title,
          url: link.url,
          categoryName: catMap.get(link.category_id) ?? '未知栏目',
          created_at: link.created_at,
        })))
      }
    }).catch(() => undefined)
  }

  const deleteFeatured = async (id: number) => {
    const ok = confirm('确认删除该精选内容？')
    if (!ok) return
    const { error } = await supabase.from('links').update({ featured: false }).eq('id', id)
    if (error) return alert(error.message)
    invalidatePrefetch()
    ensurePrefetch().then(data => {
      if (data) {
        const catMap = new Map(data.categories.map(c => [c.id, c.name]))
        setFeaturedLinks(data.links.filter(l => l.featured).map(link => ({
          id: link.id,
          title: link.title,
          url: link.url,
          categoryName: catMap.get(link.category_id) ?? '未知栏目',
          created_at: link.created_at,
        })))
      }
    }).catch(() => undefined)
  }

  useEffect(() => {
    ensurePrefetch().catch(() => undefined)
    const load = async () => {
      const prefData = await ensurePrefetch().catch(() => null)
      if (prefData) {
        setCategoryCount(prefData.categories.length)
        setLinkCount(prefData.links.length)
        setTotalComments(prefData.comments.length)
        setPerCategoryCounts(buildPerCategory(prefData))
        setRecentComments(buildRecent(prefData))
        setLatestLinks(buildLatest(prefData))
      } else {
        const { count: c1 } = await supabase.from('categories').select('*', { count: 'exact', head: true })
        const { count: c2 } = await supabase.from('links').select('*', { count: 'exact', head: true })
        setCategoryCount(c1 ?? 0)
        setLinkCount(c2 ?? 0)
        const { data: latestRaw } = await supabase
          .from('links')
          .select('id,title,url,category_id,created_at')
          .order('created_at', { ascending: false })
          .limit(10)
        let latestList: LatestEntry[] = []
        if (latestRaw && latestRaw.length > 0) {
          const catIds = Array.from(new Set(latestRaw.map((item: Link) => item.category_id))).filter((id): id is number => typeof id === 'number')
          let catMap = new Map<number, string>()
          if (catIds.length > 0) {
            const { data: catRows } = await supabase.from('categories').select('id,name').in('id', catIds)
            if (catRows) {
              catMap = new Map(catRows.map((row: Category) => [row.id, row.name]))
            }
          }
          latestList = latestRaw.map((item: Link) => ({
            id: item.id,
            title: item.title,
            url: item.url,
            categoryName: catMap.get(item.category_id) ?? `栏目 #${item.category_id}`,
            categoryId: item.category_id,
            created_at: item.created_at ?? undefined,
          }))
        }
        setLatestLinks(latestList)
      }
      const stats = await fetchCommentsOverview()
      setTotalComments(stats.total)
      setPerCategoryCounts(stats.perCategory)
      setRecentComments(stats.recent as EnrichedComment[])
    }
    load()
  }, [buildLatest, buildPerCategory, buildRecent])

  return (
    <div className="home-wrap">
      <p>栏：{categoryCount}，评论：{totalComments}，内容：{linkCount}</p>
      <section>
        <ul>
          {perCategoryCounts.map(c => (
            <li key={c.id}>{c.name}: 内容 {c.linksCount} 条，评论 {c.commentsCount} 条</li>
          ))}
        </ul>
      </section>
      <section className="category-featured-block">
        <h3>
          <span>精选内容</span>
          {admin && (
            <button onClick={() => setAddFeaturedMode(!addFeaturedMode)} title={addFeaturedMode ? '取消添加' : '添加精选'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </h3>
        {addFeaturedMode && admin && (
          <div className="add-featured-form">
            <select value={selectedCategoryId ?? ''} onChange={e => {
              const categoryId = e.target.value ? Number(e.target.value) : null
              setSelectedCategoryId(categoryId)
              setSelectedLinkId(null)
            }}>
              <option value="">选择栏目</option>
              {prefetched?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={selectedLinkId ?? ''} onChange={e => setSelectedLinkId(e.target.value ? Number(e.target.value) : null)} disabled={!selectedCategoryId}>
              <option value="">选择内容</option>
              {linksForCategory.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
            <button onClick={addFeatured} disabled={!selectedCategoryId || !selectedLinkId}>添加</button>
          </div>
        )}
        <ul>
          {featuredLinks.map(item => (
            <li key={item.id} className="home-list-item">
              <div className="home-list-row">
                <div className="home-list-main">
                  <span className="home-list-category">{item.categoryName}</span>
                  <span className="home-list-sep">—</span>
                  <a href={item.url} target="_blank" rel="noreferrer" className="home-list-link">{item.title}</a>
                </div>
                <div className="home-list-actions">
                  <button className="favorite-toggle" onClick={async () => {
                    if (!userId || !item.categoryId) { alert('请先登录以收藏'); return }
                    const has = homeUserFavorites.has(item.id)
                    try {
                      if (has) {
                        const newCount = await removeFavoriteFromCollection({ userId, categoryId: item.categoryId, linkId: item.id })
                        setHomeUserFavorites(prev => { const next = new Set(prev); next.delete(item.id); return next })
                        if (typeof newCount === 'number') setHomeFavoriteCounts(prev => ({ ...prev, [item.id]: newCount }))
                      } else {
                        const { newCount } = await addFavoriteToCollection({ userId, categoryId: item.categoryId, categoryName: item.categoryName, linkId: item.id })
                        setHomeUserFavorites(prev => { const next = new Set(prev); next.add(item.id); return next })
                        if (typeof newCount === 'number') setHomeFavoriteCounts(prev => ({ ...prev, [item.id]: newCount }))
                      }
                    } catch (err) {
                      console.error('home toggleFavorite error', err)
                      alert('收藏操作失败，请稍后重试')
                    }
                  }} title={`收藏 (${homeFavoriteCounts[item.id] || 0})`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={homeUserFavorites.has(item.id) ? '#ffc107' : 'none'} stroke={homeUserFavorites.has(item.id) ? '#ffc107' : 'currentColor'} />
                    </svg>
                    <span className="favorite-count">{homeFavoriteCounts[item.id] || 0}</span>
                  </button>
                  {admin && (
                    <div className="featured-actions">
                      {editingFeaturedId === item.id ? (
                        <>
                          <select value={editFeaturedCategoryId ?? ''} onChange={e => {
                            const cid = e.target.value ? Number(e.target.value) : null
                            setEditFeaturedCategoryId(cid)
                            setEditSelectedLinkId(null)
                          }}>
                            <option value="">选择栏目</option>
                            {prefetched?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <select value={editSelectedLinkId ?? ''} onChange={e => setEditSelectedLinkId(e.target.value ? Number(e.target.value) : null)} disabled={!editFeaturedCategoryId}>
                            <option value="">选择内容</option>
                            {linksForEditCategory.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                          </select>
                          <button className="btn-primary" onClick={saveEditFeatured} title="保存" disabled={!editFeaturedCategoryId || !editSelectedLinkId}>
                            保存
                          </button>
                          <button className="btn-ghost" onClick={() => { setEditingFeaturedId(null); setEditFeaturedCategoryId(null); setEditSelectedLinkId(null) }} title="取消">
                            取消
                          </button>
                          <button onClick={() => deleteFeatured(item.id)} title="删除">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditFeatured(item)} title="编辑">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="home-list-meta">
                <span className="muted">{formatDate(item.created_at)}</span>
              </div>
              
            </li>
          ))}
          {featuredLinks.length === 0 && <li className="muted">暂无数据</li>}
        </ul>
      </section>
      <section>
        <h3>最新内容</h3>
        <ul>
          {latestLinks.map(item => (
            <li key={item.id} className="home-list-item">
              <div className="home-list-row">
                <div className="home-list-main">
                  <span className="home-list-category">{item.categoryName}</span>
                  <span className="home-list-sep">—</span>
                  <a href={item.url} target="_blank" rel="noreferrer" className="home-list-link">{item.title}</a>
                </div>
                <div className="home-list-actions">
                  <button className="favorite-toggle" onClick={async () => {
                    if (!userId || !item.categoryId) { alert('请先登录以收藏'); return }
                    const has = homeUserFavorites.has(item.id)
                    try {
                      if (has) {
                        const newCount = await removeFavoriteFromCollection({ userId, categoryId: item.categoryId, linkId: item.id })
                        setHomeUserFavorites(prev => { const next = new Set(prev); next.delete(item.id); return next })
                        if (typeof newCount === 'number') setHomeFavoriteCounts(prev => ({ ...prev, [item.id]: newCount }))
                      } else {
                        const { newCount } = await addFavoriteToCollection({ userId, categoryId: item.categoryId, categoryName: item.categoryName, linkId: item.id })
                        setHomeUserFavorites(prev => { const next = new Set(prev); next.add(item.id); return next })
                        if (typeof newCount === 'number') setHomeFavoriteCounts(prev => ({ ...prev, [item.id]: newCount }))
                      }
                    } catch (err) {
                      console.error('home latest toggleFavorite error', err)
                      alert('收藏操作失败，请稍后重试')
                    }
                  }} title={`收藏 (${homeFavoriteCounts[item.id] || 0})`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={homeUserFavorites.has(item.id) ? '#ffc107' : 'none'} stroke={homeUserFavorites.has(item.id) ? '#ffc107' : 'currentColor'} />
                    </svg>
                    <span className="favorite-count">{homeFavoriteCounts[item.id] || 0}</span>
                  </button>
                </div>
              </div>
              <div className="home-list-meta">
                <span className="muted"> {formatDate(item.created_at)}</span>
              </div>
            </li>
          ))}
          {latestLinks.length === 0 && <li className="muted">暂无数据</li>}
        </ul>
      </section>
      <section>
        <h3>最新评论</h3>
        <ul>
          {recentComments.map(r => (
            <li key={r.id} className="home-list-item home-comment-item">
              <div className="home-list-main">
                <span className="home-list-category">{r.category_name ?? '首页'}</span>
                {r.link_title ? (
                  <>
                    <span className="home-list-sep">—</span>
                    {r.link_url ? (
                      <a href={r.link_url} target="_blank" rel="noreferrer" className="home-list-link">{r.link_title}</a>
                    ) : (
                      <span className="home-list-link">{r.link_title}</span>
                    )}
                  </>
                ) : null}
              </div>
              <div className="home-comment-text">
                <span>{r.author_name ?? '匿名'}: {r.content}</span>
              </div>
              <div className="home-list-meta">
                <span className="muted">{formatDate(r.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>评论与建议</h3>
        <Comment
          categoryId={null}
          linkId={null}
          userId={userId}
          open
          initialComments={prefetched?.comments.filter(c => c.category_id === null && c.link_id === null)}
        />
      </section>
    </div>
  )
}
