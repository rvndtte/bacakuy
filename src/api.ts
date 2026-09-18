export type ApiBook = { id: number; title: string; author: string; folder: string; progress: number; color: string; coverData?: string; fileUrl?: string }
export type ApiWord = { id: number; word: string; translation: string; context: string; savedAt: string }
export type Bootstrap = { folders: string[]; books: ApiBook[]; words: ApiWord[] }
export type ApiUser = { id: number; name: string; role: string; avatar: string }
export type AuthResponse = { token: string; user: ApiUser }

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('bacakuy-token')
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(url, { ...options, headers })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Permintaan gagal')
  return response.status === 204 ? undefined as T : response.json()
}
export const api = {
  login: async (email: string, password: string) => { const result = await request<AuthResponse>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); localStorage.setItem('bacakuy-token', result.token); return result.user },
  register: async (name: string, email: string, password: string) => { const result = await request<AuthResponse>('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) }); localStorage.setItem('bacakuy-token', result.token); return result.user },
  me: () => request<ApiUser>('/api/auth/me'),
  logout: async () => { await request<void>('/api/auth/logout', { method: 'POST' }); localStorage.removeItem('bacakuy-token') },
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),
  getUser: () => request<ApiUser>('/api/user'),
  updateUser: (user: ApiUser) => request<ApiUser>('/api/user', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) }),
  createFolder: (name: string) => request<{ name: string }>('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
  renameFolder: (name: string, nextName: string) => request<{ name: string }>(`/api/folders/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nextName }) }),
  deleteFolder: (name: string) => request<void>(`/api/folders/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  importBook: (file: File, folder = 'Sedang dibaca') => { const body = new FormData(); body.append('file', file); body.append('folder', folder); return request<ApiBook>('/api/books', { method: 'POST', body }) },
  updateBook: (book: ApiBook) => request<ApiBook>(`/api/books/${book.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(book) }),
  deleteBook: (id: number) => request<void>(`/api/books/${id}`, { method: 'DELETE' }),
  saveWord: (word: ApiWord) => request<ApiWord>('/api/words', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(word) }),
  updateWord: (word: ApiWord) => request<ApiWord>(`/api/words/${word.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(word) }),
  deleteWord: (id: number) => request<void>(`/api/words/${id}`, { method: 'DELETE' }),
  translateWord: (word: string) => request<{ word: string; translation: string }>('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word }) }),
  createShare: (bookId: number | null, quote: string) => request<{ id: number }>('/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId, quote }) }),
}
