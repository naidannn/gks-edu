import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { VALIDATION_PIPE_OPTIONS } from '../../../common/validation/validation-pipe.options.js';
import { CreatePublicLeadDto } from './create-public-lead.dto.js';

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreatePublicLeadDto as never });

const base = { lastName: 'Бат', firstName: 'Болд', phone: '99119911' };

/**
 * The web now sends the visitor's arrival, not the form page's own URL. Every
 * key it sends has to be declared here: the pipe forbids unknown keys, so a
 * missing one turns every website enquiry into a 400.
 */
describe('CreatePublicLeadDto utm', () => {
  it('accepts the full arrival block the web sends', async () => {
    const utm = {
      source: 'facebook',
      medium: 'paid',
      campaign: 'gks-sep',
      content: 'video-a',
      term: 'gks',
      click: 'fbclid',
      landingPage: '/universities/kaist?fbclid=abc',
      referrer: 'https://l.facebook.com/',
      formPage: '/consultation?service=GKS_SCHOLARSHIP',
    };
    const dto = (await validate({ ...base, utm })) as CreatePublicLeadDto;
    expect(dto.utm).toEqual(utm);
  });

  it('still rejects a key nobody declared', async () => {
    await expect(validate({ ...base, utm: { bogus: '1' } })).rejects.toThrow();
  });
});
