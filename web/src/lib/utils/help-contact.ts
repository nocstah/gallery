// Local Omarchy layer: who to ask about this Gallery. Nothing the server tells an account that is not the admin says
// who the admin is: `GET /users` lists the accounts (with the server's public-users setting) without their roles, and
// `GET /server/about` carries no owner. What it does carry, for every signed-in account, is upstream's four
// third-party links, which the owner sets in the server's environment (IMMICH_THIRD_PARTY_SUPPORT_URL and the rest;
// meant for whoever packaged the install, here the person who runs it). The support link is the way to reach the
// owner: an email address (mailto:), a phone number (tel:) or any web address. An email address that belongs to an
// account on this server also gives the owner's name and face.
import type { UserResponseDto } from '@immich/sdk';

/** the server setting a support link comes from, named where the owner is told how to set it */
export const SUPPORT_URL_VARIABLE = 'IMMICH_THIRD_PARTY_SUPPORT_URL';

export type HelpContact = {
  /** the link as the owner set it */
  href: string;
  /** what it reaches, as a person reads it: the email address, the number, or the web address's host */
  address: string;
  kind: 'email' | 'phone' | 'web';
};

/** The owner's support link in words, or nothing when it is unset or not a link a browser can follow. */
export const helpContact = (url: string | null | undefined): HelpContact | undefined => {
  const href = url?.trim();
  if (!href) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return;
  }
  switch (parsed.protocol) {
    case 'mailto:': {
      const address = decodeURIComponent(parsed.pathname).split(',', 1)[0].trim();
      return address ? { href, address, kind: 'email' } : undefined;
    }
    case 'tel:': {
      const address = decodeURIComponent(parsed.pathname).trim();
      return address ? { href, address, kind: 'phone' } : undefined;
    }
    case 'http:':
    case 'https:': {
      return { href, address: parsed.host.replace(/^www\./, ''), kind: 'web' };
    }
    default: {
      return;
    }
  }
};

/** The account a support email address belongs to, when it is one on this server. */
export const contactPerson = <T extends Pick<UserResponseDto, 'email'>>(
  contact: HelpContact | undefined,
  users: T[],
): T | undefined => {
  if (contact?.kind !== 'email') {
    return;
  }
  const address = contact.address.toLowerCase();
  return users.find((user) => user.email.toLowerCase() === address);
};
