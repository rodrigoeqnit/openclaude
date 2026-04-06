const STRING_ARGUMENT_TOOL_FIELDS: Record<string, string> = {
  Bash: 'command',
}

function isBlankString(value: string): boolean {
  return value.trim().length === 0
}

function isLikelyStructuredObjectLiteral(value: string): boolean {
  return /^\s*\{\s*"[^"\\]+"\s*:/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getPlainStringToolArgumentField(toolName: string): string | null {
  return STRING_ARGUMENT_TOOL_FIELDS[toolName] ?? null
}

function wrapPlainStringToolArguments(
  toolName: string,
  value: string,
): Record<string, string> | null {
  const field = getPlainStringToolArgumentField(toolName)
  if (!field) return null
  return { [field]: value }
}

export function normalizeToolArguments(
  toolName: string,
  rawArguments: string | undefined,
): unknown {
  if (rawArguments === undefined) return {}

  try {
    const parsed = JSON.parse(rawArguments)
    if (isRecord(parsed)) {
      return parsed
    }
    if (toolName === 'Bash') {
      if (typeof parsed === 'string') {
        if (isBlankString(parsed)) {
          return { raw: parsed }
        }
        return wrapPlainStringToolArguments(toolName, parsed) ?? parsed
      }
      return wrapPlainStringToolArguments(toolName, rawArguments) ?? rawArguments
    }
    if (typeof parsed === 'string') {
      return wrapPlainStringToolArguments(toolName, parsed) ?? parsed
    }
    return parsed
  } catch {
    if (toolName === 'Bash') {
      if (isBlankString(rawArguments) || isLikelyStructuredObjectLiteral(rawArguments)) {
        return { raw: rawArguments }
      }
    }
    return (
      wrapPlainStringToolArguments(toolName, rawArguments) ?? { raw: rawArguments }
    )
  }
}
