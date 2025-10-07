import { createClient } from '@supabase/supabase-js'

// Env variables (configure in .env.local and Vercel project settings)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
	// This will help catch missing envs during local dev/build
	console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
	},
})

// Types (keep in sync with your Supabase schema)
export type UserProfile = {
	id: string
	username: string
	email: string
	created_at?: string
}

export type Category = {
	id: number
	name: string
	description?: string | null
	created_at?: string
}

export type Link = {
	id: number
	category_id: number
	title: string
	url: string
	created_at?: string
}

export type Comment = {
	id: number
	content: string
	author_id: string | null
	author_name?: string | null
	author_email?: string | null
	category_id: number | null
	link_id: number | null
	parent_id?: number | null
	created_at?: string
}

export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined

export function isAdmin(email?: string | null) {
	if (!email || !ADMIN_EMAIL) return false
	return email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
}

// Resolve login identifier (username or email) to email.
// Assumes you maintain a `profiles` table with columns: id(uuid), username(text unique), email(text unique)
export async function resolveEmailFromIdentifier(identifier: string): Promise<string | null> {
	const isEmail = /.+@.+\..+/.test(identifier)
	if (isEmail) return identifier
	const { data, error } = await supabase
		.from('profiles')
		.select('email')
		.eq('username', identifier)
		.maybeSingle()
		if (error) {
			console.error('[supabase] resolve email error:', error)
			return null
		}
	return data?.email ?? null
}

export type CommentsFilter = {
	categoryId?: number | null
	linkId?: number | null
}

// Build a Postgres Changes filter string for realtime subscription
export function buildCommentsFilter({ categoryId, linkId }: CommentsFilter) {
	const parts: string[] = []
	if (categoryId === null) parts.push('category_id=is.null')
	else if (typeof categoryId === 'number') parts.push(`category_id=eq.${categoryId}`)

	if (linkId === null) parts.push('link_id=is.null')
	else if (typeof linkId === 'number') parts.push(`link_id=eq.${linkId}`)

	// If neither provided, subscribe to all comments (use carefully)
	return parts.join(',')
}

// Fetch comments overview: total count, per-category counts, and recent comments
export async function fetchCommentsOverview() {
	// total count
	const { count: totalCount } = await supabase.from('comments').select('*', { count: 'exact', head: true })

	// per-category counts: fetch categories then count comments per category
	const { data: cats, error: catErr } = await supabase.from('categories').select('id,name')
	if (catErr) console.error('fetchCommentsOverview categories error:', catErr)

	// per-category counts (comments and links)
	const perCategory: Array<{ id: number; name: string; commentsCount: number; linksCount: number }> = []
	if (cats && Array.isArray(cats)) {
		for (const c of cats) {
			const { count: commentCount } = await supabase.from('comments').select('*', { count: 'exact', head: true }).eq('category_id', c.id)
			const { count: linkCount } = await supabase.from('links').select('*', { count: 'exact', head: true }).eq('category_id', c.id)
			perCategory.push({ id: c.id, name: c.name, commentsCount: commentCount ?? 0, linksCount: linkCount ?? 0 })
		}
	}

		// fetch recent comments (limit 10)
		const { data: recent, error: recentErr } = await supabase
			.from('comments')
			.select('*')
			.order('id', { ascending: false })
			.limit(10)

		if (recentErr) {
			console.error('fetchCommentsOverview recent error:', recentErr)
		}

		// Enrich recent comments with category name and link title
			const recentEnriched: Comment[] = []
			if (recent && Array.isArray(recent) && recent.length > 0) {
				const recentItems = recent as Comment[]
				const categoryIds = Array.from(new Set(recentItems.map((r) => r.category_id).filter((v) => v != null))) as number[]

					const { data: cats } = categoryIds.length > 0
						? await supabase.from('categories').select('id,name').in('id', categoryIds)
						: { data: [] as Category[] }

						const { data: links } = categoryIds.length > 0
							? await supabase.from('links').select('id,title,url,category_id').in('category_id', categoryIds).order('id', { ascending: true })
							: { data: [] as Link[] }

						type CatRow = { id: number; name: string }
						type LinkRow = { id: number; title: string; url?: string; category_id?: number }
						const catMap = new Map<number, CatRow>((cats ?? []).map((c: CatRow) => [c.id, c]))
						const linkMap = new Map<number, LinkRow>((links ?? []).map((l: LinkRow) => [l.id, l]))

						// compute index per category (1-based) using the ordered links array
						const linkIndexMap = new Map<number, number>()
						if (links && Array.isArray(links)) {
							// group by category_id
							const byCat = new Map<number, LinkRow[]>()
							for (const l of links as LinkRow[]) {
								const cid = l.category_id ?? 0
								if (!byCat.has(cid)) byCat.set(cid, [])
								byCat.get(cid)!.push(l)
							}
											for (const arr of byCat.values()) {
												arr.sort((a, b) => (a.id - b.id))
												arr.forEach((lnk, idx) => linkIndexMap.set(lnk.id, idx + 1))
											}
						}

					for (const r of recentItems) {
						// create a shallow copy and augment optional fields
						const enriched: Comment & { category_name?: string; link_title?: string; link_url?: string; link_index?: number } = {
							...r,
						}
						enriched.category_name = r.category_id ? (catMap.get(r.category_id)?.name ?? '已删除栏目') : '首页'
						enriched.link_title = r.link_id ? (linkMap.get(r.link_id)?.title ?? '已删除内容') : ''
						enriched.link_url = r.link_id ? (linkMap.get(r.link_id)?.url ?? '') : ''
						enriched.link_index = r.link_id ? (linkIndexMap.get(r.link_id) ?? 0) : 0
						recentEnriched.push(enriched)
					}
			}

		return {
			total: totalCount ?? 0,
			perCategory,
			recent: recentEnriched,
		}
}

