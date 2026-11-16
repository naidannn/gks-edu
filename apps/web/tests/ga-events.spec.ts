import { describe, expect, it } from 'vitest';
import { toGaEvent } from '../app/utils/ga-events';

describe('toGaEvent', () => {
  it('keys a purchase on the payment id so the server copy deduplicates', () => {
    const event = toGaEvent({
      name: 'Purchase',
      eventId: 'pay-1',
      data: { value: 1_200_000, currency: 'MNT', content_ids: ['PREPAYMENT'] },
    });
    expect(event).toEqual({
      name: 'purchase',
      params: { transaction_id: 'pay-1', value: 1_200_000, currency: 'MNT', items: [{ item_id: 'PREPAYMENT' }] },
    });
  });

  it('maps the funnel to GA4 recommended names', () => {
    const name = (n: string) => toGaEvent({ name: n, eventId: 'e' })?.name;
    expect(name('Lead')).toBe('generate_lead');
    expect(name('CompleteRegistration')).toBe('sign_up');
    expect(name('InitiateCheckout')).toBe('begin_checkout');
    expect(name('ViewContent')).toBe('view_item');
    expect(name('Contact')).toBe('contact');
  });

  it('leaves PageView to GA and ignores unknown names', () => {
    expect(toGaEvent({ name: 'PageView', eventId: 'e' })).toBeNull();
    expect(toGaEvent({ name: 'Nope', eventId: 'e' })).toBeNull();
  });

  it('maps a search to search_term', () => {
    expect(toGaEvent({ name: 'Search', eventId: 'e', data: { search_string: 'IT' } })?.params).toEqual({
      search_term: 'IT',
    });
  });
});
