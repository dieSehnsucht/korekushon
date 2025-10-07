import { useEffect, useState } from 'react'
import { supabase, type Category } from '../supabase/supabaseClient'
import { ensurePrefetch, getPrefetchedData, invalidatePrefetch } from '../utils/prefetchCache'

type SidebarProps = {
	admin: boolean
	selectedId: number | null
	onSelect: (id: number | null) => void
}

export default function Sidebar({ admin, selectedId, onSelect }: SidebarProps) {
	const prefetched = getPrefetchedData()
	const [categories, setCategories] = useState<Category[]>(() => prefetched?.categories ?? [])
	const [loading, setLoading] = useState(() => !prefetched)

	useEffect(() => {
		let mounted = true
		ensurePrefetch()
			.then((data) => {
				if (!mounted) return
				setCategories(data.categories)
				setLoading(false)
			})
			.catch((error) => console.error('sidebar prefetch failed', error))
		return () => { mounted = false }
	}, [])

	const addCategory = async () => {
		const name = prompt('新增栏目名称：')?.trim()
		if (!name) return
		const { data, error } = await supabase.from('categories').insert({ name }).select('*').single()
		if (error) return alert(error.message)
		const row = data as Category
		setCategories((prev) => [...prev, row])
		invalidatePrefetch()
		ensurePrefetch().catch(() => undefined)
	}

		const renameCategory = async (c: Category) => {
			const name = prompt('修改栏目名称：', c.name)?.trim()
			if (!name || name === c.name) return
			const { data, error } = await supabase.from('categories').update({ name }).eq('id', c.id).select('*').single()
			if (error) return alert(error.message)
			setCategories((prev) => prev.map((x) => (x.id === c.id ? (data as Category) : x)))
			invalidatePrefetch()
			ensurePrefetch().catch(() => undefined)
		}

		const deleteCategory = async (c: Category) => {
			const ok = confirm(`确认删除栏目「${c.name}」及其下内容？`)
			if (!ok) return
			const { error } = await supabase.from('categories').delete().eq('id', c.id)
			if (error) return alert(error.message)
			setCategories((prev) => prev.filter((x) => x.id !== c.id))
			invalidatePrefetch()
			ensurePrefetch().catch(() => undefined)
			// reset selection if needed
			if (selectedId === c.id) onSelect(null)
		}

	return (
		<div className="sidebar">
			<div className="sidebar-header">
				<h3>目录</h3>
				{admin && (
					<button className="add-btn" onClick={addCategory}>新增目录</button>
				)}
			</div>
			<ul className="sidebar-list">
				<li className={!selectedId ? 'active' : ''}>
					<button onClick={() => onSelect(null)}>
						<svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M3 11.5L12 4l9 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
							<path d="M5 21V12h14v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
						<span>首页</span>
					</button>
				</li>
				{loading && <li className="muted">加载中…</li>}
						{categories.map((c) => (
									<li key={c.id} className={selectedId === c.id ? 'active' : ''}>
										<div style={{ display:'flex', gap:6, alignItems:'center' }}>
											<button style={{ flex:1 }} onClick={() => onSelect(c.id)}>
												<svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
													<path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
													<path d="M2 12h20M12 2v20M4.2 4.2l15.6 15.6M19.8 4.2L4.2 19.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
												</svg>
												<span>{c.name}</span>
											</button>
											{/* counts hidden here; shown in Content view per user request */}
											{admin && (
												<>
													<button title="重命名" onClick={() => renameCategory(c)}>✎</button>
													<button title="删除" onClick={() => deleteCategory(c)}>🗑</button>
												</>
											)}
										</div>
									</li>
								))}
			</ul>
		</div>
	)
}

