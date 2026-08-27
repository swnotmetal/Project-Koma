import { describe, expect, it } from 'vitest';
import { createMiko } from './index';
import type { MikoContract } from './index';
import {
  evidenceFromSuccessfulHostTool,
  riskForHostTool,
  toProjectRelativePath,
  verifyBeforeHostTool,
  type HostToolProfile,
} from './host-adapter';

const profile: HostToolProfile = {
  skillTools: ['skill'],
  readTools: ['read'],
  writeTools: ['edit'],
  shellTools: ['shell'],
  unknownRisk: 'high',
};

const contract: MikoContract = {
  id: 'shared-host-v1',
  appliesWhen: { action: { tools: ['edit'], pathPrefixes: ['src/ui'] } },
  requires: { skills: ['product-design'] },
  mode: 'enforce',
};

describe('host-neutral adapter protocol', () => {
  it('normalizes paths and maps risk without host dependencies', () => {
    expect(toProjectRelativePath('D:\\work\\src\\ui\\Hero.tsx', 'D:\\work'))
      .toBe('src/ui/Hero.tsx');
    expect(riskForHostTool('edit', profile)).toBe('medium');
    expect(riskForHostTool('shell', profile)).toBe('high');
    expect(riskForHostTool('unknown', profile)).toBe('high');
  });

  it('keeps an exact missing Skill load reachable after the protected action is denied', () => {
    const miko = createMiko({ contracts: [contract] });
    miko.startTask({ sessionId: 's', taskId: 's', tags: [] });

    const edit = verifyBeforeHostTool(miko, 's', {
      tool: 'edit',
      arguments: { path: 'src/ui/Hero.tsx' },
      cwd: 'D:\\work',
    }, profile);
    expect(edit.verification.decision).toBe('DENY');

    const skill = verifyBeforeHostTool(miko, 's', {
      tool: 'skill',
      arguments: { name: 'product-design' },
      cwd: 'D:\\work',
    }, profile);
    expect(skill.remediation).toBe(true);
  });

  it('records only path metadata from successful host tools', () => {
    const evidence = evidenceFromSuccessfulHostTool({
      tool: 'edit',
      arguments: { path: 'src/ui/Hero.tsx', content: 'private source' },
      cwd: 'D:\\work',
    }, profile);
    const serialized = JSON.stringify(evidence);

    expect(serialized).toContain('src/ui/Hero.tsx');
    expect(serialized).not.toContain('private source');
  });
});
