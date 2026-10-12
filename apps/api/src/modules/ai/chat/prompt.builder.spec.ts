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
function prompt(
  capture: { turns: number; askAfter: number; contactSettled: boolean },
  profile = {},
) {
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
  it('holds the phone back before the office’s threshold', () => {
    const system = prompt({ turns: 1, askAfter: 3, contactSettled: false });

    expect(system).toContain('утасны');
    expect(system).not.toContain('create_consultation_request`-ыг дууд');
  });

  it('offers the call once the threshold is passed, one request per turn', () => {
    const system = prompt({ turns: 3, askAfter: 3, contactSettled: false });

    expect(system).toContain('create_consultation_request');
    expect(system).toContain('нэг л хүсэлт');
  });

  // 2G-19: 182 of 935 production answers asked for a GPA. The layer used to
  // list the missing fields and ask for one a turn; now it only records them.
  it('never turns the missing profile fields into questions', () => {
    const system = prompt({ turns: 6, askAfter: 3, contactSettled: false }, { educationLevel: 'BACHELOR' });

    expect(system).toContain('асуулга маягаар **бүү** асуу');
    expect(system).not.toContain('Дутуу байгаа');
    expect(system).not.toContain('koreanLevel, goalLevel, budget, timing');
  });

  it('closes the subject once the number is settled, either way', () => {
    const settled = prompt({ turns: 6, askAfter: 3, contactSettled: true });

    expect(settled).toContain('Утасны асуудал шийдэгдсэн');
    expect(settled).not.toContain('Зөвлөх залгаад');
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
