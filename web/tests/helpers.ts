import { render } from '@testing-library/svelte';
import { type Component } from 'svelte';
import TestWrapper from '$lib/components/TestWrapper.svelte';

// The result is TestWrapper's own, as at runtime: `rerender` takes the wrapper's props, { component, componentProps }.
export const renderWithTooltips = <T extends Record<string, unknown>, K extends Component<T>>(
  component: K,
  props: T,
) => {
  return render(TestWrapper as Component<{ component: K; componentProps: T }>, {
    component,
    componentProps: props,
  });
};
