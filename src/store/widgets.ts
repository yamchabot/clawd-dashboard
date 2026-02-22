import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export interface WidgetDef {
  id: string
  title: string
  code: string       // React component code as string
  createdAt: number
  updatedAt: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  pinned?: boolean
}

interface WidgetStore {
  widgets: WidgetDef[]
  addWidget: (def: Omit<WidgetDef, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateWidget: (id: string, updates: Partial<WidgetDef>) => void
  removeWidget: (id: string) => void
  setWidgets: (widgets: WidgetDef[]) => void
}

const STORAGE_KEY = 'clawd-dashboard:widgets'

function loadWidgets(): WidgetDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveWidgets(widgets: WidgetDef[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets))
  } catch {}
}

export const useWidgetStore = create<WidgetStore>((set, get) => ({
  widgets: loadWidgets(),

  addWidget: (def) => {
    const id = uuidv4()
    const widget: WidgetDef = {
      ...def,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((state) => {
      const widgets = [...state.widgets, widget]
      saveWidgets(widgets)
      return { widgets }
    })
    return id
  },

  updateWidget: (id, updates) => {
    set((state) => {
      const widgets = state.widgets.map((w) =>
        w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w,
      )
      saveWidgets(widgets)
      return { widgets }
    })
  },

  removeWidget: (id) => {
    set((state) => {
      const widgets = state.widgets.filter((w) => w.id !== id)
      saveWidgets(widgets)
      return { widgets }
    })
  },

  setWidgets: (widgets) => {
    saveWidgets(widgets)
    set({ widgets })
  },
}))
