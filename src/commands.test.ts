import { describe, expect, test } from 'bun:test'
import {
  builtInCommandNames,
  formatDescriptionWithSource,
  INTERNAL_ONLY_COMMANDS,
} from './commands.js'
import { isCommand } from './types/command.js'

describe('builtInCommandNames', () => {
  test('includes the LSP command', () => {
    expect(builtInCommandNames()).toContain('lsp')
  })

  test('includes bughunter for normal users (not gated by INTERNAL_ONLY_COMMANDS)', () => {
    // Regression: bughunter previously lived in INTERNAL_ONLY_COMMANDS and was
    // never available to non-ant users. Ensure it stays in the public COMMANDS list.
    delete process.env['USER_TYPE']
    delete process.env['IS_DEMO']
    expect(builtInCommandNames()).toContain('bughunter')
    expect(INTERNAL_ONLY_COMMANDS.map(c => c.name)).not.toContain('bughunter')
  })
})

describe('isCommand', () => {
  test('rejects generated missing-module noop stubs', () => {
    function noop19() {
      return null
    }

    expect(isCommand(noop19)).toBe(false)
    expect(isCommand({ isHidden: true, name: 'stub' })).toBe(false)
  })

  test('accepts real command objects', () => {
    expect(
      isCommand({
        type: 'local',
        name: 'example',
        description: 'example command',
        supportsNonInteractive: false,
        load: async () => ({
          call: async () => ({ type: 'skip' }),
        }),
      }),
    ).toBe(true)
  })
})

describe('formatDescriptionWithSource', () => {
  test('returns empty text for prompt commands missing a description', () => {
    const command = {
      name: 'example',
      type: 'prompt',
      source: 'builtin',
      description: undefined,
    } as any

    expect(formatDescriptionWithSource(command)).toBe('')
  })

  test('formats plugin commands with missing description safely', () => {
    const command = {
      name: 'example',
      type: 'prompt',
      source: 'plugin',
      description: undefined,
      pluginInfo: {
        pluginManifest: {
          name: 'MyPlugin',
        },
      },
    } as any

    expect(formatDescriptionWithSource(command)).toBe('(MyPlugin) ')
  })
})
