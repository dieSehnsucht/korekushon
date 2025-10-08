import { supabase } from '../supabase/supabaseClient'

export type UserCollectionRow = {
  id: number
  name: string
  category_id: number | null
}

type EnsureCollectionParams = {
  userId: string
  categoryId: number
  categoryName: string
}

type AddFavoriteParams = EnsureCollectionParams & {
  linkId: number
}

type RemoveFavoriteParams = {
  userId: string
  categoryId: number
  linkId: number
}

export type AdjustFavoriteResult = {
  collection: UserCollectionRow
  newCount: number | null
}

function parseCount(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0]
  return null
}

export async function getUserCollection(userId: string, categoryId: number): Promise<UserCollectionRow | null> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('id,name,category_id')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .maybeSingle<UserCollectionRow>()
  if (error && error.code !== 'PGRST116') {
    console.error('getUserCollection error', error)
    throw error
  }
  return data ?? null
}

export async function ensureUserCollection({ userId, categoryId, categoryName }: EnsureCollectionParams): Promise<UserCollectionRow> {
  const existing = await getUserCollection(userId, categoryId)
  if (existing) return existing

  const { data, error } = await supabase
    .from('user_collections')
    .insert({ user_id: userId, category_id: categoryId, name: categoryName })
    .select('id,name,category_id')
    .single<UserCollectionRow>()
  if (error) {
    console.error('ensureUserCollection insert error', error)
    throw error
  }
  return data
}

export async function fetchUserFavoritesInCategory(userId: string, categoryId: number) {
  const collection = await getUserCollection(userId, categoryId)
  if (!collection) {
    return { collection: null as UserCollectionRow | null, linkIds: [] as number[] }
  }
  const { data, error } = await supabase
    .from('user_collection_items')
    .select('link_id')
    .eq('collection_id', collection.id)
  if (error) {
    console.error('fetchUserFavoritesInCategory error', error)
    throw error
  }
  const linkIds = (data ?? []).map((row) => row.link_id as number)
  return { collection, linkIds }
}

export async function addFavoriteToCollection({
  userId,
  categoryId,
  categoryName,
  linkId,
}: AddFavoriteParams): Promise<AdjustFavoriteResult> {
  const collection = await ensureUserCollection({ userId, categoryId, categoryName })
  const { error } = await supabase
    .from('user_collection_items')
    .insert({ collection_id: collection.id, link_id: linkId })
  if (error) {
    if (error.code === '23505') {
      const { data: linkRow, error: linkError } = await supabase
        .from('links')
        .select('favorite_count')
        .eq('id', linkId)
        .maybeSingle<{ favorite_count: number | null }>()
      if (linkError) throw linkError
      return { collection, newCount: linkRow?.favorite_count ?? null }
    }
    console.error('addFavoriteToCollection insert error', error)
    throw error
  }
  const { data: count, error: rpcError } = await supabase.rpc('adjust_link_favorite_count', { link_id: linkId, delta: 1 })
  if (rpcError) {
    console.error('adjust_link_favorite_count (+1) error', rpcError)
    throw rpcError
  }
  return { collection, newCount: parseCount(count) }
}

export async function removeFavoriteFromCollection({ userId, categoryId, linkId }: RemoveFavoriteParams): Promise<number | null> {
  const collection = await getUserCollection(userId, categoryId)
  if (!collection) return null

  const { error } = await supabase
    .from('user_collection_items')
    .delete()
    .eq('collection_id', collection.id)
    .eq('link_id', linkId)
  if (error) {
    console.error('removeFavoriteFromCollection delete error', error)
    throw error
  }
  const { data: count, error: rpcError } = await supabase.rpc('adjust_link_favorite_count', { link_id: linkId, delta: -1 })
  if (rpcError) {
    console.error('adjust_link_favorite_count (-1) error', rpcError)
    throw rpcError
  }
  return parseCount(count)
}