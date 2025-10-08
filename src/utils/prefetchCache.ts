import { supabase, type Category, type Comment, type Link } from '../supabase/supabaseClient'

export type UserCollection = {
	id: number
	name: string
	category_id: number | null
}

export type UserCollectionItem = {
	collection_id: number
	links: Link | Link[] | null
}

export type PrefetchedData = {
	categories: Category[]
	links: Link[]
	comments: Comment[]
	fetchedAt: number
}

export type PrefetchedUserData = {
	userCollections: UserCollection[]
	userCollectionItems: Array<{ collection_id: number; links: Link | Link[] | null }>
	fetchedAt: number
}

let globalCache: PrefetchedData | null = null
let globalInFlight: Promise<PrefetchedData> | null = null

let userCache: PrefetchedUserData | null = null
let userInFlight: Promise<PrefetchedUserData> | null = null
let cachedForUserId: string | null = null

export function getPrefetchedData(): PrefetchedData | null {
	return globalCache
}

export function getPrefetchedUserData(): PrefetchedUserData | null {
	return userCache
}

export function getPrefetchedComments(categoryId: number | null, linkId: number | null) {
	if (!globalCache) return null
	return globalCache.comments.filter((c) => {
		const sameCategory = (c.category_id ?? null) === categoryId
		const sameLink = (c.link_id ?? null) === linkId
		return sameCategory && sameLink
	})
}

export function getPrefetchedLinks(categoryId: number): Link[] | null {
	if (!globalCache) return null
	return globalCache.links.filter((l) => l.category_id === categoryId)
}

export async function ensurePrefetch(): Promise<PrefetchedData> {
	if (globalCache) return globalCache
	if (globalInFlight) return globalInFlight
	globalInFlight = (async () => {
		const [{ data: catData, error: catError }, { data: linkData, error: linkError }, { data: commentData, error: commentError }] = await Promise.all([
			supabase.from('categories').select('*').order('id'),
			supabase.from('links').select('*').order('category_id').order('id'),
			supabase.from('comments').select('*').order('created_at'),
		])
		if (catError) console.error('[prefetch] categories error', catError)
		if (linkError) console.error('[prefetch] links error', linkError)
		if (commentError) console.error('[prefetch] comments error', commentError)
		globalCache = {
			categories: (catData ?? []) as Category[],
			links: (linkData ?? []) as Link[],
			comments: (commentData ?? []) as Comment[],
			fetchedAt: Date.now(),
		}
		globalInFlight = null
		return globalCache
	})()
	return globalInFlight
}

export async function ensureUserPrefetch(userId: string): Promise<PrefetchedUserData> {
	if (userCache && cachedForUserId === userId) return userCache
	if (userInFlight && cachedForUserId === userId) return userInFlight

	cachedForUserId = userId
	userInFlight = (async () => {
		const { data: userCollectionData, error: userCollectionError } = await supabase.from('user_collections').select('id,name,category_id').eq('user_id', userId)
		if (userCollectionError) {
			console.error('[prefetch] user collections error', userCollectionError)
			// Don't cache partial data on error
			userInFlight = null
			cachedForUserId = null
			throw userCollectionError
		}

		const collections = (userCollectionData ?? []) as UserCollection[]
		let collectionItems: UserCollectionItem[] = []

		if (collections.length > 0) {
			const ids = collections.map((c) => c.id)
			const { data: itemsRows, error: itemsError } = await supabase.from('user_collection_items').select('collection_id, links(*)').in('collection_id', ids)
			if (itemsError) {
				console.error('[prefetch] user collection items error', itemsError)
				userInFlight = null
				cachedForUserId = null
				throw itemsError
			}
			collectionItems = (itemsRows ?? []) as UserCollectionItem[]
		}

		userCache = {
			userCollections: collections,
			userCollectionItems: collectionItems,
			fetchedAt: Date.now(),
		}
		userInFlight = null
		return userCache
	})()
	return userInFlight
}

export function invalidatePrefetch() {
	globalCache = null
	globalInFlight = null
	// Also invalidate user data as it might depend on global data (e.g. links)
	invalidateUserPrefetch()
}

export function invalidateUserPrefetch() {
	userCache = null
	userInFlight = null
	cachedForUserId = null
}
