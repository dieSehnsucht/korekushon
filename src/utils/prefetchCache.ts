import { supabase, type Category, type Comment, type Link } from '../supabase/supabaseClient'

export type PrefetchedData = {
	categories: Category[]
	links: Link[]
	comments: Comment[]
	fetchedAt: number
}

let cache: PrefetchedData | null = null
let inFlight: Promise<PrefetchedData> | null = null

export function getPrefetchedData(): PrefetchedData | null {
	return cache
}

export function getPrefetchedComments(categoryId: number | null, linkId: number | null) {
	if (!cache) return null
	return cache.comments.filter((c) => {
		const sameCategory = (c.category_id ?? null) === categoryId
		const sameLink = (c.link_id ?? null) === linkId
		return sameCategory && sameLink
	})
}

export function getPrefetchedLinks(categoryId: number): Link[] | null {
	if (!cache) return null
	return cache.links.filter((l) => l.category_id === categoryId)
}

export async function ensurePrefetch(): Promise<PrefetchedData> {
	if (cache) return cache
	if (inFlight) return inFlight
	inFlight = (async () => {
		const [{ data: catData, error: catError }, { data: linkData, error: linkError }, { data: commentData, error: commentError }] = await Promise.all([
			supabase.from('categories').select('*').order('id'),
			supabase.from('links').select('*').order('category_id').order('id'),
			supabase.from('comments').select('*').order('created_at'),
		])
		if (catError) console.error('[prefetch] categories error', catError)
		if (linkError) console.error('[prefetch] links error', linkError)
		if (commentError) console.error('[prefetch] comments error', commentError)
		cache = {
			categories: (catData ?? []) as Category[],
			links: (linkData ?? []) as Link[],
			comments: (commentData ?? []) as Comment[],
			fetchedAt: Date.now(),
		}
		inFlight = null
		return cache
	})()
	return inFlight
}

export function invalidatePrefetch() {
	cache = null
	inFlight = null
}
