/**
 * Preset widget validation tests.
 *
 * Validates that every built-in preset widget:
 *  - Has all required fields with correct types
 *  - Contains valid JavaScript code (no syntax errors)
 *  - Defines a function named Widget (or Component)
 *  - Can be compiled through the same Function() path used by WidgetRunner
 */

import { describe, it, expect } from 'vitest'
import { PRESET_WIDGETS, type PresetDef } from '../src/widgets/presets'

const VALID_SIZES = new Set(['sm', 'md', 'lg', 'xl'])

// Stub browser globals that widget code might use at call time
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k in store) delete store[k] },
    length: 0,
    key: () => null,
  } as unknown as Storage
}

// Mirrors the compile logic in WidgetRunner.tsx
function compileWidget(code: string): unknown {
  const wrapped = `
    ${code}
    if (typeof Widget !== 'undefined') return Widget;
    if (typeof Component !== 'undefined') return Component;
    return null;
  `
  const fn = new Function(
    'React', 'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef',
    'exec', 'fetch', 'console', 'exports',
    wrapped,
  )
  // Minimal React-shaped stub — just enough for the function to be called
  const reactStub = {
    createElement: () => null,
    useState: (init: unknown) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useRef: (init: unknown) => ({ current: init }),
  }
  const exportsObj: Record<string, unknown> = {}
  return fn(
    reactStub,
    reactStub.useState,
    reactStub.useEffect,
    reactStub.useMemo,
    reactStub.useCallback,
    reactStub.useRef,
    () => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),  // exec stub
    () => Promise.resolve(new Response()),                            // fetch stub
    console,
    exportsObj,
  ) ?? exportsObj.default ?? null
}

describe('PRESET_WIDGETS', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(PRESET_WIDGETS)).toBe(true)
    expect(PRESET_WIDGETS.length).toBeGreaterThan(0)
  })

  it('has no duplicate IDs', () => {
    const ids = PRESET_WIDGETS.map(p => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  for (const preset of PRESET_WIDGETS) {
    describe(`preset: "${preset.title}" (${preset.id})`, () => {
      it('has all required string fields', () => {
        expect(typeof preset.id).toBe('string')
        expect(preset.id.length).toBeGreaterThan(0)

        expect(typeof preset.title).toBe('string')
        expect(preset.title.length).toBeGreaterThan(0)

        expect(typeof preset.description).toBe('string')
        expect(preset.description.length).toBeGreaterThan(0)

        expect(typeof preset.icon).toBe('string')
        expect(preset.icon.length).toBeGreaterThan(0)

        expect(typeof preset.code).toBe('string')
        expect(preset.code.length).toBeGreaterThan(0)
      })

      it('has a valid size value', () => {
        expect(VALID_SIZES.has(preset.size)).toBe(true)
      })

      it('code compiles without syntax errors', () => {
        expect(() => compileWidget(preset.code)).not.toThrow()
      })

      it('code defines a Widget function', () => {
        const result = compileWidget(preset.code)
        expect(typeof result).toBe('function')
      })

      it('Widget function can be called without throwing', () => {
        const WidgetFn = compileWidget(preset.code) as (() => unknown) | null
        expect(WidgetFn).not.toBeNull()
        // Call it — it should complete without throwing synchronously
        // (async side effects like fetch/exec are stubbed)
        expect(() => WidgetFn?.()).not.toThrow()
      })

      it('code does not import or require external modules', () => {
        // Widget code runs in new Function() — no module system available
        expect(preset.code).not.toMatch(/\bimport\s*[({'"]/m)
        expect(preset.code).not.toMatch(/\brequire\s*\(/m)
      })
    })
  }
})
