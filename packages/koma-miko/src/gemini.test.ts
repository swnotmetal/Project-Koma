import { describe, expect, it } from 'vitest';
import { createMiko } from './index';
import type { MikoContract } from './index';
import { geminiToolSucceeded, handleGeminiHookEvent } from './gemini';

const contract: MikoContract = {
  id: 'gemini-ui-v1',
  appliesWhen: {
    action: { tools: ['replace', 'write_file'], pathPrefixes: ['src/ui'] },
  },
  requires: { skills: ['product-design'] },
  actions: {
    allow: ['activate_skill', 'read_file', 'replace', 'write_file', 'run_shell_command'],
    scope: {
      tools: ['replace', 'write_file'],
      allowedPathPrefixes: ['src/ui'],
      argumentNames: ['file_path'],
    },
  },
  mode: 'enforce',
};

function start() {
  const miko = createMiko({ contracts: [contract] });
  miko.startTask({ sessionId: 'gemini-session', taskId: 'gemini-session', tags: [] });
  return miko;
}

describe('Gemini CLI adapter', () => {
  it('blocks an edit until activate_skill succeeds', () => {
    const miko = start();
    const edit = {
      session_id: 'gemini-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'BeforeTool' as const,
      tool_name: 'replace',
      tool_input: { file_path: 'src/ui/Hero.tsx', old_string: 'private', new_string: 'private' },
    };

    expect(handleGeminiHookEvent(miko, 'gemini-session', edit).output)
      .toMatchObject({ decision: 'deny' });
    expect(handleGeminiHookEvent(miko, 'gemini-session', {
      ...edit,
      tool_name: 'activate_skill',
      tool_input: { name: 'product-design' },
    }).output).toBeUndefined();

    handleGeminiHookEvent(miko, 'gemini-session', {
      ...edit,
      hook_event_name: 'AfterTool',
      tool_name: 'activate_skill',
      tool_input: { name: 'product-design' },
      tool_response: { llmContent: 'loaded' },
    });
    expect(handleGeminiHookEvent(miko, 'gemini-session', edit).output).toBeUndefined();
  });

  it('accepts only successful structured Gemini tool responses', () => {
    expect(geminiToolSucceeded({ llmContent: 'ok' })).toBe(true);
    expect(geminiToolSucceeded({ error: { message: 'nope' } })).toBe(false);
    expect(geminiToolSucceeded('unstructured')).toBe(false);
  });

  it('advances the context epoch before Gemini compression', () => {
    const miko = start();
    const result = handleGeminiHookEvent(miko, 'gemini-session', {
      session_id: 'gemini-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'PreCompress',
      trigger: 'auto',
    });
    expect(result.contextAdvance?.epoch).toBe(1);
    expect(result.contextAdvanceReason).toBe('compaction');
  });
});
