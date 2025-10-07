import { useEffect, useMemo, useState } from 'react'
import { supabase, isAdmin } from './supabase/supabaseClient'
import Sidebar from './components/Sidebar'
import Content from './components/Content'
import Auth from './components/Auth'
import './styles/index.css'
import './styles/Sidebar.css'
import './styles/Content.css'
import './styles/Auth.css'
import { ensurePrefetch } from './utils/prefetchCache'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

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
	const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
		const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
	const [authOpen, setAuthOpen] = useState(false)
		const [recovering, setRecovering] = useState(false)

	// Load session on mount
	useEffect(() => {
		let mounted = true
		ensurePrefetch().catch((error) => console.error('prefetch failed', error))
			supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
			if (!mounted) return
			const s = data.session
			if (s?.user) {
					setUser({ id: s.user.id, email: s.user.email, user_metadata: s.user.user_metadata as { username?: string | null } })
			}
		})

			const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
				if (event === 'PASSWORD_RECOVERY') {
					setRecovering(true)
					setAuthOpen(true)
				}
					if (session?.user) {
						setUser({ id: session.user.id, email: session.user.email, user_metadata: session.user.user_metadata as { username?: string | null } })
			} else {
				setUser(null)
			}
		})
		return () => {
			mounted = false
			sub.subscription.unsubscribe()
		}
	}, [])

	const username = useMemo(() => user?.user_metadata?.username || user?.email?.split('@')[0] || '用户', [user])
	const admin = isAdmin(user?.email || undefined)

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
								setUser(null) // 强制更新状态
							} catch (error) {
								console.error('退出失败:', error)
								alert('退出失败，请重试')
							}
						}} />
					) : (
						<button className="auth-btn" onClick={() => setAuthOpen(true)}>登录/注册</button>
					)}
				</div>
			</header>

					<div className="app-body">
						<aside className={`app-sidebar ${sidebarCollapsed ? '' : 'open'}`}>
					<Sidebar 
						admin={admin}
						selectedId={selectedCategoryId}
						onSelect={(id) => { setSelectedCategoryId(id); setSidebarCollapsed(true) }}
					/>
				</aside>
						{!sidebarCollapsed && (
							<div className="sidebar-backdrop" onClick={() => setSidebarCollapsed(true)} />
						)}
				<main className="app-content">
					<Content 
						admin={admin}
						user={user}
						selectedCategoryId={selectedCategoryId}
					/>
				</main>
			</div>

					{authOpen && (
						<Auth 
							recovering={recovering}
							onClose={() => { setAuthOpen(false); setRecovering(false) }} 
							onAuthed={() => { setAuthOpen(false); setRecovering(false) }} 
						/>
			)}
					{/* site footer */}
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
					<button className="logout-btn" onMouseDown={onLogout}>退出登录</button>
				</div>
			)}
		</div>
	)
}

