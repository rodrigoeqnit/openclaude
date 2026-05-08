import { describe, expect, test } from 'bun:test'

import type { LoadedPlugin } from '../../types/plugin.js'
import { mergeHooksSettings, mergePluginSources } from './pluginLoader.js'

function marketplacePlugin(
  name: string,
  marketplace: string,
  enabled: boolean,
): LoadedPlugin {
  const pluginId = `${name}@${marketplace}`
  return {
    name,
    manifest: { name } as LoadedPlugin['manifest'],
    path: `/tmp/${pluginId}`,
    source: pluginId,
    repository: pluginId,
    enabled,
  }
}

describe('mergeHooksSettings', () => {
  test('concatenates matchers for the same event instead of overwriting', () => {
    const pluginJsonHooks = {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo a' }] }],
    }
    const marketplaceHooks = {
      PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo b' }] }],
    }

    const merged = mergeHooksSettings(pluginJsonHooks as any, marketplaceHooks as any)

    expect(merged.PreToolUse).toHaveLength(2)
    expect((merged.PreToolUse as any[])[0].matcher).toBe('Bash')
    expect((merged.PreToolUse as any[])[1].matcher).toBe('Write')
  })

  test('returns additional when base is undefined', () => {
    const hooks = { PostToolUse: [{ matcher: 'Read', hooks: [] }] }
    const merged = mergeHooksSettings(undefined, hooks as any)
    expect(merged).toBe(hooks)
  })

  test('adds new event from additional when base lacks it', () => {
    const base = { PreToolUse: [{ matcher: 'Bash', hooks: [] }] }
    const additional = { PostToolUse: [{ matcher: 'Write', hooks: [] }] }
    const merged = mergeHooksSettings(base as any, additional as any)
    expect(merged.PreToolUse).toHaveLength(1)
    expect(merged.PostToolUse).toHaveLength(1)
  })
})

describe('mergePluginSources', () => {
  test('keeps the enabled copy when duplicate marketplace plugins disagree on enabled state', () => {
    const enabledOfficial = marketplacePlugin(
      'frontend-design',
      'claude-plugins-official',
      true,
    )
    const disabledLegacy = marketplacePlugin(
      'frontend-design',
      'claude-code-plugins',
      false,
    )

    const result = mergePluginSources({
      session: [],
      marketplace: [disabledLegacy, enabledOfficial],
      builtin: [],
    })

    expect(result.plugins).toEqual([enabledOfficial])
    expect(result.errors).toEqual([])
  })

  test('keeps the later copy when duplicate marketplace plugins are both enabled', () => {
    const legacy = marketplacePlugin(
      'frontend-design',
      'claude-code-plugins',
      true,
    )
    const official = marketplacePlugin(
      'frontend-design',
      'claude-plugins-official',
      true,
    )

    const result = mergePluginSources({
      session: [],
      marketplace: [legacy, official],
      builtin: [],
    })

    expect(result.plugins).toEqual([official])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({
      type: 'generic-error',
      source: legacy.source,
      plugin: legacy.name,
    })
  })
})
