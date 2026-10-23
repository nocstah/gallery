import { contactPerson, helpContact } from '$lib/utils/help-contact';

describe('helpContact', () => {
  it('reads an email address, without its subject', () => {
    expect(helpContact('mailto:anna@example.com?subject=Gallery')).toEqual({
      href: 'mailto:anna@example.com?subject=Gallery',
      address: 'anna@example.com',
      kind: 'email',
    });
  });

  it('reads a phone number', () => {
    expect(helpContact('tel:+15550100')).toMatchObject({ address: '+15550100', kind: 'phone' });
  });

  it('names a web address by its host', () => {
    expect(helpContact('https://www.example.com/help')).toMatchObject({ address: 'example.com', kind: 'web' });
  });

  it.each([undefined, null, '', ' '.repeat(3), 'not a link', 'javascript:alert(1)', 'mailto:'])(
    'offers nothing for %j',
    (url) => {
      expect(helpContact(url)).toBeUndefined();
    },
  );
});

describe('contactPerson', () => {
  const users = [
    { email: 'ben@example.com', name: 'Ben' },
    { email: 'Anna@Example.com', name: 'Anna' },
  ];

  it('finds the account the support address belongs to, whatever its case', () => {
    expect(contactPerson(helpContact('mailto:anna@example.com'), users)?.name).toBe('Anna');
  });

  it('finds no one for an address no account has, or a link that is not an address', () => {
    expect(contactPerson(helpContact('mailto:someone@example.com'), users)).toBeUndefined();
    expect(contactPerson(helpContact('https://example.com'), users)).toBeUndefined();
    expect(contactPerson(undefined, users)).toBeUndefined();
  });
});
