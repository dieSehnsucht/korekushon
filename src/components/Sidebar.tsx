import { useEffect, useState } from 'react'
import { supabase, type Category } from '../supabase/supabaseClient'
import { ensurePrefetch, getPrefetchedData, invalidatePrefetch } from '../utils/prefetchCache'
import { getAvatarUrl, initTheme, toggleTheme } from '../utils/theme'
import { SETTINGS_VIEW_ID } from './Content'
import Spinner from './Spinner'

export const COLLECTION_VIEW_ID = -1

type SidebarProps = {
	admin: boolean
	selectedId: number | null
	onSelect: (id: number | null) => void
}

export default function Sidebar({ admin, selectedId, onSelect }: SidebarProps) {
	const prefetched = getPrefetchedData()
	const [categories, setCategories] = useState<Category[]>(() => prefetched?.categories ?? [])
	const [loading, setLoading] = useState(() => !prefetched)
	const [avatar, setAvatar] = useState<string | null>(null)

	useEffect(() => {
		let mounted = true
		ensurePrefetch()
			.then((data) => {
				if (!mounted) return
				setCategories(data.categories)
				setLoading(false)
			})
			.catch((error) => console.error('sidebar prefetch failed', error))
			initTheme()
			const stored = getAvatarUrl()
			if (mounted) setAvatar(stored)
			const onAvatar = (e: Event) => {
				const url = (e as CustomEvent).detail?.url as string | null | undefined
				setAvatar(url ?? null)
			}
			document.addEventListener('app:avatar-updated', onAvatar)
			return () => { mounted = false; document.removeEventListener('app:avatar-updated', onAvatar) }
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
			const input = prompt(`输入新名称以重命名栏目「${c.name}」，或输入“DELETE”以删除。`, c.name)
			if (input === null) return // user cancelled

			const newName = input.trim()
			if (newName === 'DELETE') {
				const ok = confirm(`确认删除栏目「${c.name}」及其下所有内容？此操作不可撤销。`)
				if (!ok) return
				const { error } = await supabase.from('categories').delete().eq('id', c.id)
				if (error) return alert(error.message)
				setCategories((prev) => prev.filter((x) => x.id !== c.id))
				invalidatePrefetch()
				ensurePrefetch().catch(() => undefined)
				// reset selection if needed
				if (selectedId === c.id) onSelect(null)
			} else if (newName && newName !== c.name) {
				const { data, error } = await supabase.from('categories').update({ name: newName }).eq('id', c.id).select('*').single()
				if (error) return alert(error.message)
				setCategories((prev) => prev.map((x) => (x.id === c.id ? (data as Category) : x)))
				invalidatePrefetch()
				ensurePrefetch().catch(() => undefined)
			}
		}

		return (
			<div className="sidebar">
				{/* Top avatar/header area sits inside the green band */}
				<div className="avatar-wrap">
					{avatar ? (
						<img alt="avatar" width={96} height={96} style={{ width: 96, height: 96, borderRadius: 10, objectFit: 'cover' }} src={avatar} />
					) : (
						<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
							<rect width="96" height="96" rx="12" fill="#16221f" />
							<g transform="translate(12 12)" fill="#9fe6d2">
								<circle cx="36" cy="24" r="18" />
								<rect x="6" y="56" width="60" height="18" rx="6" />
							</g>
						</svg>
					)}
				</div>
			<div className="sidebar-header">
				{admin && (
					<button className="add-btn" onClick={addCategory} title="新增目录">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
					</button>
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
				<li className={selectedId === COLLECTION_VIEW_ID ? 'active' : ''}>
					<button onClick={() => onSelect(COLLECTION_VIEW_ID)}>
						<svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
						<span>我的收藏</span>
					</button>
				</li>
				{loading && (
					<div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
						<Spinner />
					</div>
				)}
						{categories.map((c) => (
									<li key={c.id} className={selectedId === c.id ? 'active' : ''}>
										<div style={{ display:'flex', gap:6, alignItems:'center' }}>
											<button style={{ flex:1, justifyContent: 'flex-start' }} onClick={() => onSelect(c.id)}>
												<svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
													<path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
													<path d="M2 12h20M12 2v20M4.2 4.2l15.6 15.6M19.8 4.2L4.2 19.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
												</svg>
												<span>{c.name}</span>
											</button>
											{/* counts hidden here; shown in Content view per user request */}
											{admin && (
												<>
													<button title="重命名或删除" onClick={() => renameCategory(c)}>✎</button>
												</>
											)}
										</div>
									</li>
								))}

								{/* Bottom actions: Settings and Theme toggle */}
								<li className={selectedId === SETTINGS_VIEW_ID ? 'active' : ''}>
									<button onClick={() => onSelect(SETTINGS_VIEW_ID)}>
										<svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.94 4a7 7 0 0 0-.14-1.4l2.12-1.65-2-3.46-2.5 1a7.06 7.06 0 0 0-2.42-1.4l-.38-2.65h-4l-.38 2.65a7.06 7.06 0 0 0-2.42 1.4l-2.5-1-2 3.46 2.12 1.65A7 7 0 0 0 3.06 12a7 7 0 0 0 .14 1.4L1.08 15.05l2 3.46 2.5-1a7.06 7.06 0 0 0 2.42 1.4l.38 2.65h4l.38-2.65a7.06 7.06 0 0 0 2.42-1.4l2.5 1 2-3.46-2.12-1.65c.09-.46.14-.93.14-1.4Z" stroke="currentColor" strokeWidth="1.2"/>
										</svg>
										<span>设置</span>
									</button>
								</li>
								<li>
									<button onClick={() => toggleTheme()} title="切换主题">
										{ /* show sun for light, moon for dark */ }
										<span className="theme-icon">
											<svg className="icon theme-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path className="icon-moon" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.2"/>
												<g className="icon-sun" transform="translate(0,0)">
													{/* Center disc */}
													<circle cx="12" cy="12" r="4" fill="currentColor" />
													{/* Surrounding dot rays to form a ring-like sun */}
													<g fill="currentColor">
														<circle cx="12" cy="3.5" r="1.4" />
														<circle cx="12" cy="20.5" r="1.4" />
														<circle cx="3.5" cy="12" r="1.4" />
														<circle cx="20.5" cy="12" r="1.4" />
														<circle cx="5.2" cy="5.2" r="1.2" />
														<circle cx="18.8" cy="5.2" r="1.2" />
														<circle cx="5.2" cy="18.8" r="1.2" />
														<circle cx="18.8" cy="18.8" r="1.2" />
													</g>
												</g>
											</svg>
										</span>
										<span>切换主题</span>
									</button>
								</li>
			</ul>
		</div>
	)
}

