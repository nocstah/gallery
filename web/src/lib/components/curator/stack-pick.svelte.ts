// Local Omarchy layer: which stack's "Pick the best" card the photo viewer shows. Set from the viewer's stack strip, or
// from a stack's right-click menu in the timeline before the viewer opens on it.
class StackPickState {
  stackId = $state<string>();

  open(stackId: string) {
    this.stackId = stackId;
  }

  close() {
    this.stackId = undefined;
  }
}

export const stackPick = new StackPickState();
