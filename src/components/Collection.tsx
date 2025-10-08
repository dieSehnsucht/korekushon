import { useEffect, useMemo, useState } from 'react'
import { supabase, type Category, type Link } from '../supabase/supabaseClient'
import { addFavoriteToCollection, removeFavoriteFromCollection } from '../utils/favoritesApi'
import '../styles/Collection.css'
import Spinner from './Spinner'

type UserCollection = {
  id: number
  name: string
  category_id: number | null
}

type CollectionProps = {
  userId: string | null
  onSelectCategory: (categoryId: number | null) => void
}

type CategoryTab = {
  categoryId: number
  label: string
  collectionId: number | null
}

export default function Collection({ userId, onSelectCategory }: CollectionProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [collectionByCategory, setCollectionByCategory] = useState<Record<number, UserCollection | null>>({})
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)
  const [itemsByCategory, setItemsByCategory] = useState<Record<number, Link[]>>({})
  const [featuredByCategory, setFeaturedByCategory] = useState<Record<number, Link[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const [{ data: catRows }, userCollectionsResult, featuredResult] = await Promise.all([
        supabase.from('categories').select('id,name').order('id'),
        userId
          ? supabase.from('user_collections').select('id,name,category_id').eq('user_id', userId)
          : Promise.resolve({ data: [] as UserCollection[] }),
  supabase.from('links').select('id,title,url,category_id,created_at,favorite_count').eq('featured', true),
      ])

      if (cancelled) return

      const catList = (catRows ?? []) as Category[]
      setCategories(catList)

      setActiveCategoryId(prev => {
        if (prev != null && catList.some((c) => c.id === prev)) return prev
        return catList[0]?.id ?? null
      })

      const userCollections = (userCollectionsResult?.data ?? []) as UserCollection[]
      const byCategory: Record<number, UserCollection | null> = {}
      const byCollectionId = new Map<number, UserCollection>()
      userCollections.forEach((col) => {
        if (col.category_id != null) {
          byCategory[col.category_id] = col
        }
        byCollectionId.set(col.id, col)
      })
      catList.forEach((cat) => {
        if (!(cat.id in byCategory)) byCategory[cat.id] = null
      })
      setCollectionByCategory(byCategory)

      if (userCollections.length > 0) {
        const ids = userCollections.map((c) => c.id)
        const { data: itemsRows } = await supabase
          .from('user_collection_items')
          .select('collection_id, links(*)')
          .in('collection_id', ids)
        if (!cancelled) {
          const itemsMap: Record<number, Link[]> = {}
          const rows = (itemsRows ?? []) as Array<{ collection_id: number; links: Link | Link[] | null }>
          rows.forEach((row) => {
            const collection = byCollectionId.get(row.collection_id)
            if (!collection || collection.category_id == null) return
            const rawLink = Array.isArray(row.links) ? row.links[0] : row.links
            if (!rawLink) return
            if (!itemsMap[collection.category_id]) itemsMap[collection.category_id] = []
            itemsMap[collection.category_id].push(rawLink as Link)
          })
          catList.forEach((cat) => {
            if (!itemsMap[cat.id]) itemsMap[cat.id] = []
          })
          setItemsByCategory(itemsMap)
        }
      } else {
        const emptyMap: Record<number, Link[]> = {}
        catList.forEach((cat) => { emptyMap[cat.id] = [] })
        setItemsByCategory(emptyMap)
      }

      const featuredRows = (featuredResult.data ?? []) as Link[]
      const featuredMap: Record<number, Link[]> = {}
      featuredRows.forEach((link) => {
        const catId = link.category_id
        if (catId == null) return
        if (!featuredMap[catId]) featuredMap[catId] = []
        featuredMap[catId].push(link)
      })
      setFeaturedByCategory(featuredMap)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const tabs: CategoryTab[] = useMemo(() => {
    if (categories.length === 0) return []
    return categories.map((cat) => {
      const collection = collectionByCategory[cat.id] ?? null
      return {
        categoryId: cat.id,
        label: collection?.name ?? cat.name,
        collectionId: collection?.id ?? null,
      }
    })
  }, [categories, collectionByCategory])

  const activeTab = useMemo(() => tabs.find((tab) => tab.categoryId === activeCategoryId) ?? null, [tabs, activeCategoryId])
  const activeItems = activeCategoryId != null ? itemsByCategory[activeCategoryId] ?? [] : []
  const recommendedForActive = activeCategoryId != null ? featuredByCategory[activeCategoryId] ?? [] : []

  const goToCategory = () => {
    if (activeCategoryId != null) {
      onSelectCategory(activeCategoryId)
    }
  }

  // helper: update favorite count in featured map and in items map
  const applyFavoriteCountUpdate = (catId: number, linkId: number, newCount: number | null) => {
    setFeaturedByCategory((prev) => {
      const next = { ...prev }
      const arr = next[catId] ?? []
      next[catId] = arr.map((l) => (l.id === linkId ? { ...l, favorite_count: newCount ?? 0 } : l))
      return next
    })
    setItemsByCategory((prev) => {
      const next = { ...prev }
      const arr = next[catId] ?? []
      next[catId] = arr.map((l) => (l.id === linkId ? { ...l, favorite_count: newCount ?? 0 } : l))
      return next
    })
  }

  const toggleFavorite = async (link: Link) => {
    if (!userId) return alert('请先登录以收藏')
    if (activeCategoryId == null) return
    const catId = activeCategoryId
    const has = (itemsByCategory[catId] ?? []).some((l) => l.id === link.id)
    try {
      if (has) {
        // remove
        const newCount = await removeFavoriteFromCollection({ userId, categoryId: catId, linkId: link.id })
        // remove from items map
        setItemsByCategory((prev) => {
          const next = { ...prev }
          next[catId] = (next[catId] ?? []).filter((l) => l.id !== link.id)
          return next
        })
        if (typeof newCount === 'number') applyFavoriteCountUpdate(catId, link.id, newCount)
      } else {
        // add
        const { newCount } = await addFavoriteToCollection({ userId: userId!, categoryId: catId, categoryName: activeTab?.label ?? '我的收藏', linkId: link.id })
        // insert into items map at top
        setItemsByCategory((prev) => {
          const next = { ...prev }
          next[catId] = [link as Link].concat(next[catId] ?? [])
          return next
        })
        if (typeof newCount === 'number') applyFavoriteCountUpdate(catId, link.id, newCount)
      }
    } catch (e) {
      console.error('toggleFavorite error', e)
      alert('收藏操作失败，请稍后重试')
    }
  }

  if (loading) {
    return (
      <div className="collection-wrap" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spinner />
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="collection-wrap">
        <div className="auth-cta-wrap">
          <button className="auth-cta" onClick={() => document.dispatchEvent(new CustomEvent('app:open-auth'))}>
            登录 / 注册
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="collection-wrap">
      <div className="collection-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.categoryId}
            className={tab.categoryId === activeCategoryId ? 'active' : ''}
            onClick={() => setActiveCategoryId(tab.categoryId)}
          >
            {tab.label}
          </button>
        ))}
        {tabs.length === 0 && <div className="muted">暂无栏目</div>}
      </div>

      {activeTab && (
        <div className={`collection-body${activeItems.length > 0 ? ' stacked' : ' empty'}`}>
          {activeItems.length > 0 ? (
            <section className="collection-items">
              <ul>
                {activeItems.map((it) => {
                  const isFav = (itemsByCategory[activeCategoryId ?? -1] ?? []).some((x) => x.id === it.id)
                  return (
                    <li key={it.id}>
                      <div className="recommend-row">
                        <a href={it.url} target="_blank" rel="noreferrer">{it.title}</a>
                        <button className="favorite-toggle" onClick={() => toggleFavorite(it)} title={`收藏 (${it.favorite_count || 0})`}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={isFav ? '#ffc107' : 'none'} stroke={isFav ? '#ffc107' : 'currentColor'} />
                          </svg>
                          <span className="fav-count">{it.favorite_count || 0}</span>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : (
            <div className="collection-empty-stack">
              <button className="collection-empty-card" onClick={goToCategory} disabled={activeCategoryId == null}>
                <span className="plus">+</span>
                <span>去「{activeTab.label}」栏添加收藏</span>
              </button>
              <div className="collection-recommend">
                <div className="recommend-label muted">推荐收藏</div>
                {recommendedForActive.length > 0 ? (
                  <ul>
                    {recommendedForActive.map((link) => {
                        const isFav = (itemsByCategory[activeCategoryId ?? -1] ?? []).some((x) => x.id === link.id)
                        return (
                          <li key={link.id}>
                            <div className="recommend-row">
                              <a href={link.url} target="_blank" rel="noreferrer">{link.title}</a>
                              <button className="favorite-toggle" onClick={() => toggleFavorite(link)} title={`收藏 (${link.favorite_count || 0})`}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={isFav ? '#ffc107' : 'none'} stroke={isFav ? '#ffc107' : 'currentColor'} />
                                </svg>
                                <span className="fav-count">{link.favorite_count || 0}</span>
                              </button>
                            </div>
                          </li>
                        )
                      })}
                  </ul>
                ) : (
                  <div className="muted">暂无推荐</div>
                )}
              </div>
            </div>
          )}

          {activeItems.length > 0 && recommendedForActive.length > 0 && (
            <aside className="collection-recommend">
              <div className="recommend-label muted">推荐收藏</div>
              <ul>
                {recommendedForActive.map((link) => {
                  const isFav = (itemsByCategory[activeCategoryId ?? -1] ?? []).some((x) => x.id === link.id)
                  return (
                    <li key={link.id}>
                      <div className="recommend-row">
                        <a href={link.url} target="_blank" rel="noreferrer">{link.title}</a>
                        <button className="favorite-toggle" onClick={() => toggleFavorite(link)} title={`收藏 (${link.favorite_count || 0})`}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={isFav ? '#ffc107' : 'none'} stroke={isFav ? '#ffc107' : 'currentColor'} />
                          </svg>
                          <span className="fav-count">{link.favorite_count || 0}</span>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
