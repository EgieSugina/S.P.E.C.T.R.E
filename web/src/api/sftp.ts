import { api, getToken } from './client'

export interface FileEntry {
  name: string
  path: string
  size: number
  is_dir: boolean
  mode: string
  modified_at: number
}

export const sftpApi = {
  list: (connId: string, path: string) =>
    api<FileEntry[]>(`/sftp/${connId}/list?path=${encodeURIComponent(path)}`),
  mkdir: (connId: string, path: string) =>
    api(`/sftp/${connId}/mkdir`, { method: 'POST', body: JSON.stringify({ path }) }),
  delete: (connId: string, path: string) =>
    api(`/sftp/${connId}/delete`, { method: 'DELETE', body: JSON.stringify({ path }) }),
  rename: (connId: string, from: string, to: string) =>
    api(`/sftp/${connId}/rename`, { method: 'POST', body: JSON.stringify({ from, to }) }),
  upload: async (connId: string, file: File, remotePath: string, jobId: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('path', remotePath)
    form.append('job_id', jobId)
    const token = getToken()
    const res = await fetch(`/api/sftp/${connId}/upload`, {
      method: 'POST',
      headers: { 'X-SPECTRE-Token': token || '' },
      body: form,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  downloadUrl: (connId: string, path: string) => {
    const token = getToken()
    return `/api/sftp/${connId}/download?path=${encodeURIComponent(path)}&token=${token}`
  },
}
