import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import AlbumDescriptionField from '$lib/components/omarchy/AlbumDescriptionField.svelte';

// Local Omarchy layer: an album's description. Whoever may edit the album gets the field, everyone else the words
// alone, so a viewer never sees "Add a description"; on a phone an editor's empty description is one quiet line that
// opens the field.
const mocks = vi.hoisted(() => ({ mediaQueryManager: { isPhone: false } }));
vi.mock('$lib/stores/media-query-manager.svelte', () => ({ mediaQueryManager: mocks.mediaQueryManager }));

const renderField = (props: { isEditor: boolean; description?: string }) =>
  render(AlbumDescriptionField, { id: 'album-1', description: props.description ?? '', isEditor: props.isEditor });

describe('AlbumDescriptionField', () => {
  beforeEach(() => {
    mocks.mediaQueryManager.isPhone = false;
    sdkMock.updateAlbumInfo.mockResolvedValue({} as never);
  });

  for (const isPhone of [false, true]) {
    describe(isPhone ? 'on a phone' : 'on a wider screen', () => {
      beforeEach(() => {
        mocks.mediaQueryManager.isPhone = isPhone;
      });

      it('never offers a viewer to add a description', () => {
        renderField({ isEditor: false });
        expect(screen.queryByText('add_a_description')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('add_a_description')).not.toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      });

      it("shows a viewer the album's words, not a field", () => {
        renderField({ isEditor: false, description: 'Two weeks on the island' });
        expect(screen.getByText('Two weeks on the island')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      });

      it("keeps an editor's description in its field", () => {
        renderField({ isEditor: true, description: 'Two weeks on the island' });
        expect(screen.getByRole('textbox')).toHaveValue('Two weeks on the island');
        expect(screen.queryByTestId('album-describe')).not.toBeInTheDocument();
      });
    });
  }

  it('gives an editor the empty field on a wider screen', () => {
    renderField({ isEditor: true });
    expect(screen.getByPlaceholderText('add_a_description')).toBeInTheDocument();
    expect(screen.queryByTestId('album-describe')).not.toBeInTheDocument();
  });

  it("folds an editor's empty description into one quiet line on a phone, which opens the field", async () => {
    mocks.mediaQueryManager.isPhone = true;
    renderField({ isEditor: true });

    const line = screen.getByRole('button', { name: 'add_a_description' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await fireEvent.click(line);
    const field = screen.getByPlaceholderText('add_a_description');
    expect(field).toHaveFocus();
    expect(screen.queryByTestId('album-describe')).not.toBeInTheDocument();

    // left empty, the field goes back to the line
    await fireEvent.focusOut(field);
    expect(screen.getByRole('button', { name: 'add_a_description' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
