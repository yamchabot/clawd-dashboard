/**
 * Widget store backed by widgets.json on the server.
 *
 * - Loads from GET /api/widgets on init
 * - Subscribes to GET /api/widgets/events (SSE) for instant updates
 * - Falls back to polling every 5s if SSE fails
 * - Writes via PUT /api/widgets
 */

import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export interface WidgetDef {
  id: string
  title: string
  description?: string
  code: string         // React component as a string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  colSpan?: number     // grid column span (1 = 80px, 2 = 168px, etc.)
  rowSpan?: number     // grid row span (1 = 80px, 2 = 168px, etc.)
  colStart?: number    // explicit grid-column-start (1-indexed); undefined = CSS auto-place
  rowStart?: number    // explicit grid-row-start (1-indexed); undefined = CSS auto-place
  order?: number
  enabled?: boolean
  createdAt: number
  updatedAt: number
}

export interface WidgetsFile {
  version: number
  widgets: WidgetDef[]
}

interface WidgetStore {
  widgets: WidgetDef[]
  loading: boolean
  lastSaved: number

  // Internal
  _setWidgets: (widgets: WidgetDef[]) => void

  // Public API
  refresh: () => Promise<void>
  saveAll: (widgets: WidgetDef[]) => Promise<void>
  addWidget: (def: Omit<WidgetDef, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>
  updateWidget: (id: string, updates: Partial<Omit<WidgetDef, 'id'>>) => Promise<void>
  removeWidget: (id: string) => Promise<void>
}

async function fetchWidgets(): Promise<WidgetDef[]> {
  const res = await fetch('/api/widgets')
  if (!res.ok) throw new Error(`GET /api/widgets → ${res.status}`)
  const data: WidgetsFile = await res.json()
  return (data.widgets ?? []).filter((w) => w.enabled !== false)
}

async function putWidgets(widgets: WidgetDef[]): Promise<void> {
  const res = await fetch('/api/widgets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, widgets }),
  })
  if (!res.ok) throw new Error(`PUT /api/widgets → ${res.status}`)
}

export const useWidgetStore = create<WidgetStore>((set, get) => ({
  widgets: [],
  loading: true,
  lastSaved: 0,

  _setWidgets: (widgets) => set({ widgets, loading: false }),

  refresh: async () => {
    try {
      const widgets = await fetchWidgets()
      set({ widgets, loading: false })
    } catch (e) {
      console.warn('[widgets] refresh failed:', e)
      set({ loading: false })
    }
  },

  saveAll: async (widgets) => {
    // Sort by order field before saving
    const sorted = [...widgets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    await putWidgets(sorted)
    set({ widgets: sorted, lastSaved: Date.now() })
  },

  addWidget: async (def) => {
    const id = uuidv4()
    const now = Date.now()
    const existing = get().widgets
    const newWidget: WidgetDef = {
      ...def,
      id,
      enabled: true,
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    }
    const updated = [...existing, newWidget]
    await putWidgets(updated)
    set({ widgets: updated })
    return id
  },

  updateWidget: async (id, updates) => {
    const updated = get().widgets.map((w) =>
      w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w,
    )
    await putWidgets(updated)
    set({ widgets: updated })
  },

  removeWidget: async (id) => {
    const updated = get().widgets.filter((w) => w.id !== id)
    await putWidgets(updated)
    set({ widgets: updated })
  },
}))

// ── Bootstrap: load + subscribe ───────────────────────────────────────────────
let sseConn: EventSource | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

export function initWidgetSync() {
  const store = useWidgetStore.getState()

  // Initial load
  store.refresh()

  // Try SSE first
  function connectSSE() {
    if (sseConn) { try { sseConn.close() } catch {} }
    const es = new EventSource('/api/widgets/events')
    sseConn = es

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'widgets-changed') {
          useWidgetStore.getState().refresh()
        }
      } catch {}
    }

    es.onerror = () => {
      es.close()
      sseConn = null
      // Fall back to polling
      startPolling()
    }
  }

  function startPolling() {
    if (pollTimer) return
    console.log('[widgets] SSE unavailable, falling back to polling every 5s')
    pollTimer = setInterval(() => {
      useWidgetStore.getState().refresh()
    }, 5000)
  }

  if (typeof EventSource !== 'undefined') {
    connectSSE()
  } else {
    startPolling()
  }
}
