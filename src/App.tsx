import { useEffect, useMemo, useState } from 'react'
import { supabase, isAdmin } from './supabase/supabaseClient'
import { clearAvatarUrl, setAvatarUrl } from './utils/theme'
import { ensureUserPrefetch, invalidateUserPrefetch } from './utils/prefetchCache'
import Sidebar, { COLLECTION_VIEW_ID } from './components/Sidebar'
import Content, { CategoryLinks, SETTINGS_VIEW_ID } from './components/Content'
import Auth from './components/Auth'
import './styles/index.css'
import './styles/Sidebar.css'
import './styles/Content.css'
import './styles/Auth.css'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'

function Footer() {
	const [uptime, setUptime] = useState('')
	useEffect(() => {
		const start = new Date('2025-10-08T02:00:00+08:00')
		function update() {
			const now = new Date()
			let diff = Math.floor((now.getTime() - start.getTime()) / 1000)
			const days = Math.floor(diff / (24 * 3600)); diff %= 24 * 3600
			const hours = Math.floor(diff / 3600); diff %= 3600
			const minutes = Math.floor(diff / 60); const seconds = diff % 60
			setUptime(`${days}天 ${String(hours).padStart(2,'0')}时 ${String(minutes).padStart(2,'0')}分 ${String(seconds).padStart(2,'0')}秒`)
		}
		update()
		const id = setInterval(update, 1000)
		return () => clearInterval(id)
	}, [])

	return (
		<div className="global-footer">
			<div className="footer-up-time">本站已存活：{uptime}</div>
			<div className="footer-copyright">© 2025 - dieSehnsucht</div>
		</div>
	)
}

export type SessionUser = {
	id: string
	email: string | undefined
	user_metadata?: { username?: string | null }
}

export default function App() {
	const [user, setUser] = useState<SessionUser | null>(null)
	const [admin, setAdmin] = useState(false)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
	const [authOpen, setAuthOpen] = useState(false)
	const [recovering, setRecovering] = useState(false)
	const navigate = useNavigate()
	const location = useLocation()

	useEffect(() => {
		const handleAuthChange = async (event: AuthChangeEvent, session: Session | null) => {
			if (event === 'PASSWORD_RECOVERY') {
				setRecovering(true)
				setAuthOpen(true)
			}

			const currentUser = session?.user ?? null
			setUser(currentUser ? { id: currentUser.id, email: currentUser.email, user_metadata: currentUser.user_metadata } : null)
			
			const newAdmin = currentUser ? await isAdmin(currentUser.email) : false
			setAdmin(newAdmin)

			if (currentUser) {
				const avatarUrl = currentUser.user_metadata?.avatar_url as string | undefined
				if (avatarUrl) {
					setAvatarUrl(avatarUrl)
					document.dispatchEvent(new CustomEvent('app:avatar-updated', { detail: { url: avatarUrl } }))
				}
				ensureUserPrefetch(currentUser.id).catch(err => console.error('User prefetch failed', err))
			} else {
				clearAvatarUrl()
				document.dispatchEvent(new CustomEvent('app:avatar-updated', { detail: { url: null } }))
				invalidateUserPrefetch()
			}
		}

		const openAuth = () => setAuthOpen(true)
		document.addEventListener('app:open-auth', openAuth)

		const { data: authListener } = supabase.auth.onAuthStateChange(handleAuthChange)

		// Also trigger on initial load
		supabase.auth.getSession().then(({ data: { session } }) => handleAuthChange('INITIAL_SESSION', session))

		return () => {
			authListener?.subscription.unsubscribe()
			document.removeEventListener('app:open-auth', openAuth)
		}
	}, [])

	const username = useMemo(() => user?.user_metadata?.username || user?.email?.split('@')[0] || '用户', [user])

	const selectedId = useMemo(() => {
		const { pathname } = location
		if (pathname === '/') return null
		if (pathname === '/collections') return COLLECTION_VIEW_ID
		if (pathname === '/settings') return SETTINGS_VIEW_ID
		const match = pathname.match(/^\/category\/(\d+)$/)
		if (match) {
			return Number(match[1])
		}
		return null
	}, [location])

	return (
		<div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
			<header className="app-header">
				<button
					className="sidebar-toggle"
					aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
					onClick={() => setSidebarCollapsed((v) => !v)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
						<path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" fill="currentColor"></path>
					</svg>
				</button>
				<div className="spacer" />
				<div className="auth-area">
					{user ? (
						<UserMenu username={username} onLogout={async () => {
							try {
								await supabase.auth.signOut()
							} catch (error) {
								console.error('退出失败:', error)
								alert('退出失败，请重试')
							}
						}} />
					) : (
						<button className="auth-btn" onClick={() => setAuthOpen(true)} title="登录/注册">登录 / 注册</button>
					)}
				</div>
			</header>

			<div className="app-body">
				<aside className={`app-sidebar ${sidebarCollapsed ? '' : 'open'}`}>
					<Sidebar
						admin={admin}
						selectedId={selectedId}
						onSelect={(id) => {
							setSidebarCollapsed(true)
							if (id === null) navigate('/')
							else if (id === SETTINGS_VIEW_ID) navigate('/settings')
							else if (id === COLLECTION_VIEW_ID) navigate('/collections')
							else navigate(`/category/${id}`)
						}}
					/>
				</aside>
				{!sidebarCollapsed && (
					<div className="sidebar-backdrop" onClick={() => setSidebarCollapsed(true)} />
				)}
				<main className="app-content">
					<Routes>
						<Route path="/" element={<Content admin={admin} user={user} selectedCategoryId={null} onSelectCategory={(id) => { navigate(id ? `/category/${id}` : '/'); setSidebarCollapsed(true) }} />} />
						<Route path="/collections" element={<Content admin={admin} user={user} selectedCategoryId={COLLECTION_VIEW_ID} onSelectCategory={(id) => { navigate(id ? `/category/${id}` : '/'); setSidebarCollapsed(true) }} />} />
						<Route path="/settings" element={<Content admin={admin} user={user} selectedCategoryId={SETTINGS_VIEW_ID} onSelectCategory={(id) => { navigate(id ? `/category/${id}` : '/'); setSidebarCollapsed(true) }} />} />
						<Route path="/category/:id" element={<CategoryLinksWrapper admin={admin} user={user} />} />
						<Route path="*" element={<Content admin={admin} user={user} selectedCategoryId={null} onSelectCategory={(id) => { navigate(id ? `/category/${id}` : '/'); setSidebarCollapsed(true) }} />} />
					</Routes>
				</main>
			</div>

			{authOpen && (
				<Auth
					recovering={recovering}
					onClose={() => { setAuthOpen(false); setRecovering(false) }}
					onAuthed={() => { setAuthOpen(false); setRecovering(false) }}
				/>
			)}
			<Footer />
		</div>
	)
}

function UserMenu({ username, onLogout }: { username: string; onLogout: () => void | Promise<void> }) {
	const [open, setOpen] = useState(false)
	return (
		<div className="user-menu" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }} tabIndex={0}>
			<button className="user-chip" onClick={() => setOpen((v) => !v)}>{username}</button>
			{open && (
					<div className="user-menu-dropdown">
						<button className="auth-btn logout-btn" onMouseDown={onLogout} title="退出登录">退出登录</button>
					</div>
			)}
		</div>
	)
}

// wrapper to read route param and render CategoryLinks
function CategoryLinksWrapper({ admin, user }: { admin: boolean; user: SessionUser | null }) {
	const params = useParams()
	const cidRaw = params?.id
	const cid = cidRaw ? Number(cidRaw) : NaN
	if (Number.isNaN(cid)) return <div className="muted">无效的栏目 ID</div>
	return <CategoryLinks categoryId={cid} admin={admin} userId={user?.id ?? null} />
}

