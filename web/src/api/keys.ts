import { api, ensureToken } from './client'

export interface SSHKey {
  id: string
  name: string
  type: string
  public_key: string
  fingerprint: string
  created_at: string
}

export type KeyType = 'ed25519' | 'rsa4096' | 'rsa2048'

export const keysApi = {
  list: () => api<SSHKey[]>('/keys'),
  generate: (data: { name: string; type: KeyType; passphrase?: string }) =>
    api<SSHKey>('/keys/generate', { method: 'POST', body: JSON.stringify(data) }),
  import: (data: { name: string; pem: string; passphrase?: string }) =>
    api<SSHKey>('/keys/import', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => api(`/keys/${id}`, { method: 'DELETE' }),
  publicUrl: (id: string) => `/api/keys/${id}/public`,
  downloadPublic: async (id: string, filename: string) => {
    const token = await ensureToken()
    const res = await fetch(`/api/keys/${id}/public`, {
      headers: { 'X-SPECTRE-Token': token },
    })
    if (!res.ok) {
      throw new Error('Failed to download public key')
    }
    const text = await res.text()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.pub`
    a.click()
    URL.revokeObjectURL(url)
  },
}
