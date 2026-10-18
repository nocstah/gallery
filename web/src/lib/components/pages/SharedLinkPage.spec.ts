import { fireEvent, screen, waitFor } from '@testing-library/svelte';
import { renderWithTooltips } from '$tests/helpers';
import SharedLinkPage from './SharedLinkPage.svelte';

// Local Omarchy layer: a shared link's password prompt (DESIGN.md, Error pages): a labelled field and Open, and a
// wrong password said under the field instead of in a toast

const { sharedLinkLogin, handleError } = vi.hoisted(() => ({ sharedLinkLogin: vi.fn(), handleError: vi.fn() }));

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  sharedLinkLogin,
  isHttpError: (error: unknown) => typeof (error as { status?: unknown })?.status === 'number',
}));
vi.mock('$lib/utils/handle-error', () => ({ handleError }));

const renderPrompt = () =>
  renderWithTooltips(SharedLinkPage, {
    data: { key: 'link-key', passwordRequired: true, meta: { title: 'shared_link_password_title' } },
  });

describe('shared link password prompt', () => {
  it('asks for the password with a field that has its own label', () => {
    renderPrompt();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('shared_link_password_title');
    expect(screen.getByLabelText('password')).toHaveAttribute('id', 'shared-link-password');
    expect(screen.getByRole('button', { name: 'shared_link_password_open' })).toBeInTheDocument();
  });

  it('says a wrong password under the field, not in a toast', async () => {
    sharedLinkLogin.mockRejectedValue({ status: 401, data: { message: 'Invalid password' } });
    renderPrompt();
    await fireEvent.input(screen.getByLabelText('password'), { target: { value: 'not it' } });
    await fireEvent.click(screen.getByRole('button', { name: 'shared_link_password_open' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('shared_link_password_wrong');
    expect(screen.getByLabelText('password')).toHaveAttribute('aria-invalid', 'true');
    expect(sharedLinkLogin).toHaveBeenCalledWith({
      key: 'link-key',
      slug: undefined,
      sharedLinkLoginDto: { password: 'not it' },
    });
    expect(handleError).not.toHaveBeenCalled();
  });

  it('lets typing again clear what went wrong', async () => {
    sharedLinkLogin.mockRejectedValue({ status: 401, data: { message: 'Invalid password' } });
    renderPrompt();
    const field = screen.getByLabelText('password');
    await fireEvent.input(field, { target: { value: 'not it' } });
    await fireEvent.click(screen.getByRole('button', { name: 'shared_link_password_open' }));
    await screen.findByRole('alert');

    await fireEvent.input(field, { target: { value: 'not it either' } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('leaves any other failure to the usual toast', async () => {
    sharedLinkLogin.mockRejectedValue({ status: 500, data: { message: 'Internal server error' } });
    renderPrompt();
    await fireEvent.input(screen.getByLabelText('password'), { target: { value: 'secret' } });
    await fireEvent.click(screen.getByRole('button', { name: 'shared_link_password_open' }));

    await waitFor(() => expect(handleError).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks nothing of the server for an empty field', async () => {
    renderPrompt();
    await fireEvent.click(screen.getByRole('button', { name: 'shared_link_password_open' }));
    expect(sharedLinkLogin).not.toHaveBeenCalled();
  });
});
