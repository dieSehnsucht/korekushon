import '../styles/Home.css'
import { useEffect, useMemo, useState } from 'react'
import { supabase, fetchCommentsOverview, type Comment as CommentRow } from '../supabase/supabaseClient'
import Comment from './Comment'
import { ensurePrefetch, getPrefetchedData, type PrefetchedData } from '../utils/prefetchCache'

type Props = {
  userId: string | null
}

export default function Home({ userId }: Props) {
  const prefetched = getPrefetchedData()
  type EnrichedComment = CommentRow & { category_name?: string; link_title?: string; link_url?: string; link_index?: number }
  type LatestEntry = { id: number; title: string; url: string; categoryName: string; created_at?: string }

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
        .slice(0, 10)
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
        .slice(0, 10)
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
  }, [prefetched, buildPerCategory, buildRecent, buildLatest])

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
          const catIds = Array.from(new Set(latestRaw.map(item => item.category_id))).filter((id): id is number => typeof id === 'number')
          let catMap = new Map<number, string>()
          if (catIds.length > 0) {
            const { data: catRows } = await supabase.from('categories').select('id,name').in('id', catIds)
            if (catRows) {
              catMap = new Map(catRows.map(row => [row.id, row.name]))
            }
          }
          latestList = latestRaw.map(item => ({
            id: item.id,
            title: item.title,
            url: item.url,
            categoryName: catMap.get(item.category_id) ?? `栏目 #${item.category_id}`,
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
      <h1>首页</h1>
      <p>栏：{categoryCount}，评论总数：{totalComments}，内容总数：{linkCount}</p>
      <section>
        <h3>各栏：</h3>
        <ul>
          {perCategoryCounts.map(c => (
            <li key={c.id}>{c.name}: 内容 {c.linksCount} 条，评论 {c.commentsCount} 条</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>最新内容</h3>
        <ul>
          {latestLinks.map(item => (
            <li key={item.id}>
              <strong>{item.categoryName}</strong>
              &nbsp;—&nbsp;
              <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              <span className="muted">（{formatDate(item.created_at)}）</span>
            </li>
          ))}
          {latestLinks.length === 0 && <li className="muted">暂无数据</li>}
        </ul>
      </section>
      <section>
        <h3>最新评论</h3>
        <ul>
          {recentComments.map(r => (
            <li key={r.id}>
              <strong>{r.category_name ?? '首页'}</strong>
              &nbsp;—&nbsp;
              {r.link_title ? (
                <>
                  {r.link_url ? (
                    <a href={r.link_url} target="_blank" rel="noreferrer">{r.link_index ? `${r.link_index}. ` : ''}{r.link_title}</a>
                  ) : (
                    <span>{r.link_index ? `${r.link_index}. ` : ''}{r.link_title}</span>
                  )}
                  &nbsp;—&nbsp;
                </>
              ) : null}
              <span>{r.author_name ?? '匿名'}: {r.content}</span>
              <span className="muted">（{formatDate(r.created_at)}）</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>总评论</h3>
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
