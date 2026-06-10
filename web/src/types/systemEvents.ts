export type SystemEvent =
  | { type: 'connection_up'; connection_id: string; name: string }
  | { type: 'connection_down'; connection_id: string; conn_id?: string; reason?: string }
  | { type: 'tunnel_started'; tunnel_id: string; port?: number }
  | { type: 'tunnel_stopped'; tunnel_id: string }
  | { type: 'session_created'; session_id: string; conn_id?: string }
  | { type: 'session_destroyed'; session_id: string }
  | {
      type: 'broadcast_started'
      batch_id: string
      session_ids: string[]
      command: string
    }
  | {
      type: 'broadcast_completed'
      batch_id: string
      session_ids: string[]
      succeeded: number
      failed: number
    }
  | {
      type: 'broadcast_failed'
      batch_id: string
      session_id: string
      error: string
    }
  | {
      type: 'jump_connecting'
      connection_id: string
      jump_host_id: string
      target_host: string
    }
  | {
      type: 'jump_connected'
      connection_id: string
      jump_host_id: string
      hop_count: number
    }
  | {
      type: 'jump_failed'
      connection_id: string
      jump_host_id: string
      reason: string
    }

export function parseSystemEvent(data: unknown): SystemEvent | null {
  if (!data || typeof data !== 'object' || !('type' in data)) return null
  return data as SystemEvent
}
