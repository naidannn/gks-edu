import { describe, expect, it } from 'vitest';
import { AccessLevel } from '../../../prisma/client.js';
import { buildSystemPrompt } from './prompt.builder.js';

/**
 * The capture ladder (2C-05, `AI-ASSISTANT.md` §6.2).
 *
 * The layer is computed per turn, and what it says changes the conversation:
 * too early and a visitor is interrogated before they have been given
 * anything, too late and nobody is ever asked. These assert the three
 * transitions rather than the wording, which the office will want to tune.
 */
function prompt(capture: { turns: number; askAfter: number; contactSettled: boolean }, profile = {}) {
  return buildSystemPrompt({
    persona: 'Чи GKS EDU-ийн зөвлөх туслах.',
    level: AccessLevel.PUBLIC,
    hits: [],
    profile,
    toolNames: ['save_visitor_profile', 'create_consultation_request'],
    capture,
  }).system;
}

describe('the capture layer', () => {
  it('forbids asking before the office’s threshold', () => {
    const system = prompt({ turns: 1, askAfter: 3, contactSettled: false });

    expect(system).toContain('юу ч бүү асуу');
    // And the phone must not even be mentioned yet.
    expect(system).not.toContain('create_consultation_request`-ыг дууд');
  });

  it('opens one question at a time once the threshold is passed', () => {
    const system = prompt({ turns: 3, askAfter: 3, contactSettled: false });

    expect(system).toContain('зөвхөн нэг');
    expect(system).toContain('create_consultation_request');
  });

  it('names only the fields still missing', () => {
    const system = prompt({ turns: 4, askAfter: 3, contactSettled: false }, { educationLevel: 'BACHELOR', gpa: 3.5 });

    expect(system).toContain('koreanLevel, goalLevel, budget, timing');
    expect(system).not.toContain('educationLevel, gpa');
  });

  it('closes the subject once the number is settled, either way', () => {
    const settled = prompt({ turns: 6, askAfter: 3, contactSettled: true });

    expect(settled).toContain('Утасны асуудал шийдэгдсэн');
    expect(settled).not.toContain('Зөвлөх залгаад');
  });

  it('says the profile is complete rather than listing nothing', () => {
    const system = prompt({ turns: 8, askAfter: 3, contactSettled: true }, {
      educationLevel: 'BACHELOR',
      gpa: 3.5,
      koreanLevel: 'TOPIK 4',
      goalLevel: 'MASTER',
      budget: 'UPTO_20M',
      timing: 'NEXT_YEAR',
    });

    expect(system).toContain('Профайл бүрэн');
  });

  it('is absent when the tool is not on this caller’s level', () => {
    const system = buildSystemPrompt({
      persona: 'Туслах',
      level: AccessLevel.INTERNAL,
      hits: [],
      toolNames: ['search_knowledge'],
      capture: { turns: 9, askAfter: 3, contactSettled: false },
    }).system;

    // A staff copilot turn must not start collecting a visitor profile.
    expect(system).not.toContain('Мэдээлэл цуглуулах');
  });
});
