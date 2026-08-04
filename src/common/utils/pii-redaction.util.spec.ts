import { describe, expect, it } from '@jest/globals';

import { redactContactInfo, redactPersonalBlock, redactPiiDeep } from './pii-redaction.util';

describe('redactContactInfo', () => {
  it('masks email addresses', () => {
    expect(redactContactInfo('Contact: jane.doe@example.com for details')).toBe(
      'Contact: [REDACTED_EMAIL] for details',
    );
  });

  it('masks phone numbers', () => {
    expect(redactContactInfo('Phone: +84 912 345 678')).toBe('Phone: [REDACTED_PHONE]');
  });

  it('preserves surrounding text/structure', () => {
    const input = 'Technical Skills\nFrontend/Mobile: React, React Native';
    expect(redactContactInfo(input)).toBe(input);
  });
});

describe('redactPiiDeep', () => {
  it('redacts strings nested inside objects and arrays', () => {
    const input = {
      summary: 'Reach me at test@example.com',
      experience: [{ responsibilities: ['Called clients at 0912345678'] }],
    };

    expect(redactPiiDeep(input)).toEqual({
      summary: 'Reach me at [REDACTED_EMAIL]',
      experience: [{ responsibilities: ['Called clients at [REDACTED_PHONE]'] }],
    });
  });

  it('leaves non-string primitives untouched', () => {
    expect(redactPiiDeep({ count: 3, active: true, note: null })).toEqual({
      count: 3,
      active: true,
      note: null,
    });
  });
});

describe('redactPersonalBlock', () => {
  it('replaces non-null values with a marker, keeps null as null', () => {
    expect(
      redactPersonalBlock({
        full_name: 'Nguyen Van A',
        email: 'a@example.com',
        phone: '0912345678',
        location: null,
        linkedin_url: null,
        github_url: 'https://github.com/a',
        portfolio_url: null,
      }),
    ).toEqual({
      full_name: '[REDACTED]',
      email: '[REDACTED]',
      phone: '[REDACTED]',
      location: null,
      linkedin_url: null,
      github_url: '[REDACTED]',
      portfolio_url: null,
    });
  });
});
