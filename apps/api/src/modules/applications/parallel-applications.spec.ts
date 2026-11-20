import { describe, expect, it } from 'vitest';
import { CaseChoiceTrack, ServiceType } from '../../prisma/client.js';
import { parallelChoices } from './parallel-applications.js';

const choice = (universityId: string, track: CaseChoiceTrack = CaseChoiceTrack.REGULAR) => ({ universityId, track });

describe('parallelChoices (1E-13)', () => {
  it('offers a GKS case only its ordinary-brokerage school — the scholarship schools are one submission', () => {
    const choices = [
      choice('snu', CaseChoiceTrack.SCHOLARSHIP),
      choice('ku', CaseChoiceTrack.SCHOLARSHIP),
      choice('kyunghee', CaseChoiceTrack.REGULAR),
    ];
    expect(parallelChoices(ServiceType.GKS_SCHOLARSHIP, choices, 'snu').map((c) => c.universityId)).toEqual(['kyunghee']);
  });

  it('offers a regular case every school except the primary application`s', () => {
    const choices = [choice('a'), choice('b'), choice('c')];
    expect(parallelChoices(ServiceType.BACHELOR, choices, 'a').map((c) => c.universityId)).toEqual(['b', 'c']);
  });

  it('follows the primary application when staff re-pointed it at another choice', () => {
    const choices = [choice('a'), choice('b')];
    expect(parallelChoices(ServiceType.MASTER, choices, 'b').map((c) => c.universityId)).toEqual(['a']);
  });
});
