import userEvent from '@testing-library/user-event';
import { renderWithTooltips } from '$tests/helpers';
import SharedLinkFormFields from './SharedLinkFormFields.svelte';

describe('SharedLinkFormFields component', () => {
  const isChecked = (element: Element) =>
    element instanceof HTMLInputElement ? element.checked : element.getAttribute('aria-checked') === 'true';

  // Local Omarchy layer: leaving the place out keeps downloads on (the privacy filter removes the place from them)
  it('keeps downloads on when the location is left out', async () => {
    const { container } = renderWithTooltips(SharedLinkFormFields, {
      slug: '',
      password: '',
      description: '',
      allowDownload: true,
      allowUpload: false,
      showMetadata: true,
      expiresAt: null,
    });
    const user = userEvent.setup();

    const switches = Array.from(container.querySelectorAll('[role="switch"], input[type="checkbox"]'));
    expect(switches).toHaveLength(3);

    const [showMetadataSwitch, allowDownloadSwitch] = switches;
    expect(isChecked(allowDownloadSwitch)).toBe(true);

    await user.click(showMetadataSwitch);

    expect(isChecked(showMetadataSwitch)).toBe(false);
    expect(isChecked(allowDownloadSwitch)).toBe(true);
  });
});
