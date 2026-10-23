import type { ServerAboutResponseDto, UserResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import HelpAndFeedbackModal from './HelpAndFeedbackModal.svelte';

// Local Omarchy layer: Help says who runs this Gallery and how to reach them; the projects' links are the owner's
const auth = vi.hoisted(() => ({
  user: { id: 'me', name: 'Ben', email: 'ben@example.com', isAdmin: false } as Record<string, unknown>,
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: {
    authenticated: true,
    get user() {
      return {
        avatarColor: 'primary',
        profileImagePath: '',
        profileChangedAt: '2026-01-01T00:00:00.000Z',
        ...auth.user,
      };
    },
  },
}));

const about = (overrides: Partial<ServerAboutResponseDto> = {}) =>
  ({ version: 'v5.9.0', versionUrl: '', licensed: false, ...overrides }) as ServerAboutResponseDto;
const anna = {
  id: 'anna',
  name: 'Anna',
  email: 'anna@example.com',
  avatarColor: 'primary',
  profileImagePath: '',
  profileChangedAt: '2026-01-01T00:00:00.000Z',
} as UserResponseDto;

beforeAll(async () => {
  await init({ fallbackLocale: 'en-US' });
  register('en-US', () => import('$i18n/en.json'));
  await waitLocale('en-US');
});

beforeEach(() => {
  vi.resetAllMocks();
  Element.prototype.animate = getAnimateMock();
  auth.user = { id: 'me', name: 'Ben', email: 'ben@example.com', isAdmin: false };
  sdkMock.searchUsers.mockResolvedValue([anna]);
});

// `Modal` mounts a bits-ui dialog whose body scroll lock releases on a 24ms timer
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 30));
});

const open = async (info: ServerAboutResponseDto) => {
  render(HelpAndFeedbackModal, { info, onClose: vi.fn() });
  return screen.findByTestId('help-sheet');
};

describe('HelpAndFeedbackModal', () => {
  it('tells the family who runs this Gallery, by name, and how to reach them', async () => {
    await open(about({ thirdPartySupportUrl: 'mailto:anna@example.com' }));

    expect(await screen.findByText('Anna runs this Gallery')).toBeInTheDocument();
    expect(screen.getByText(/Ask them about your account/)).toBeInTheDocument();
    const contact = screen.getByRole('link', { name: 'Email Anna' });
    expect(contact).toHaveAttribute('href', 'mailto:anna@example.com');
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
    // the projects behind it are the owner's
    expect(screen.queryByTestId('help-about')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /discord/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('help-version')).toHaveTextContent('v5.9.0');
  });

  it('reaches an address no account here has, without a name', async () => {
    await open(about({ thirdPartySupportUrl: 'https://example.com/ask' }));

    expect(screen.getByTestId('help-owner')).toHaveTextContent('The person who set up your account runs this Gallery');
    expect(screen.getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', 'https://example.com/ask');
    expect(sdkMock.searchUsers).not.toHaveBeenCalled();
  });

  it('says who to ask without a way to reach them when none is set', async () => {
    await open(about());

    expect(screen.getByTestId('help-owner')).toHaveTextContent('The person who set up your account runs this Gallery');
    expect(screen.queryByTestId('help-contact')).not.toBeInTheDocument();
  });

  it('shows the owner the projects, the server and how to be reached', async () => {
    auth.user = { id: 'me', name: 'Anna', email: 'anna@example.com', isAdmin: true };
    await open(about());

    expect(screen.getByTestId('help-owner')).toHaveTextContent('You run this Gallery');
    expect(screen.getByTestId('help-owner-setup')).toHaveTextContent(
      "Set IMMICH_THIRD_PARTY_SUPPORT_URL in the server's environment, for example to mailto:anna@example.com",
    );
    const aboutSection = screen.getByTestId('help-about');
    expect(within(aboutSection).getByRole('link', { name: 'Bugs and feature requests' })).toBeInTheDocument();
    expect(within(aboutSection).getByRole('link', { name: 'Discord' })).toHaveAttribute(
      'href',
      'https://discord.immich.app',
    );
    expect(within(aboutSection).getByRole('button', { name: 'Server details' })).toBeInTheDocument();
    expect(sdkMock.searchUsers).not.toHaveBeenCalled();
  });

  it('tells the owner where the family is pointed once a link is set', async () => {
    auth.user = { id: 'me', name: 'Anna', email: 'anna@example.com', isAdmin: true };
    await open(about({ thirdPartySupportUrl: 'mailto:anna@example.com' }));

    expect(screen.getByText('Family members can reach you here: anna@example.com.')).toBeInTheDocument();
    expect(screen.queryByTestId('help-contact')).not.toBeInTheDocument();
  });
});
