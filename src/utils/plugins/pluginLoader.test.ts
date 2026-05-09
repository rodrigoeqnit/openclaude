import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { LoadedPlugin } from '../../types/plugin.js'
import type { PluginMarketplaceEntry } from './schemas.js'
import {
  finishLoadingPluginFromPath,
  mergeHooksSettings,
  mergePluginSources,
} from './pluginLoader.js'

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

describe('finishLoadingPluginFromPath — marketplace hook supplement', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'openclaude-plugin-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('concatenates marketplace entry hooks with plugin.json hooks for the same event', async () => {
    // Arrange: write a minimal plugin on disk with a PreToolUse hook
    await mkdir(join(tmpDir, '.claude-plugin'), { recursive: true })
    await writeFile(
      join(tmpDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'test-plugin', version: '1.0.0' }),
    )
    await mkdir(join(tmpDir, 'hooks'), { recursive: true })
    await writeFile(
      join(tmpDir, 'hooks', 'hooks.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo from-plugin-json' }] },
          ],
        },
      }),
    )

    // Marketplace entry supplements PreToolUse with an additional matcher
    const entry = {
      name: 'test-plugin',
      source: 'test-source',
      strict: true,
      hooks: {
        PreToolUse: [
          { matcher: 'Write', hooks: [{ type: 'command', command: 'echo from-marketplace' }] },
        ],
      },
    } as unknown as PluginMarketplaceEntry

    const errors: Parameters<typeof finishLoadingPluginFromPath>[3] = []

    // Act: run the actual loader path
    const plugin = await finishLoadingPluginFromPath(
      entry,
      'test-plugin@marketplace',
      true,
      errors,
      tmpDir,
    )

    // Assert: both matchers are present in order — plugin.json first, marketplace second
    expect(plugin).not.toBeNull()
    const preToolUse = plugin!.hooksConfig?.PreToolUse as Array<{ matcher: string }>
    expect(preToolUse).toHaveLength(2)
    expect(preToolUse[0]!.matcher).toBe('Bash')
    expect(preToolUse[1]!.matcher).toBe('Write')
    expect(errors).toHaveLength(0)
  })
})
