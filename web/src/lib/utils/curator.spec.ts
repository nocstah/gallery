import { authManager } from '$lib/managers/auth-manager.svelte';
import { curatorIsMine } from '$lib/utils/curator';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

// Local Omarchy layer: the one gate in front of Curator's tools. Curator acts for its owner only, the owner of its API
// key, who is this server's admin; any other account (a family member's) is offered none of them.

const signIn = (isAdmin: boolean) => {
  authManager.setUser(userAdminFactory.build({ isAdmin }));
  authManager.setPreferences(preferencesFactory.build());
};

describe('curatorIsMine', () => {
  afterEach(() => {
    authManager.reset();
  });

  it('is false while nobody is signed in (a shared link), without reading a user that is not there', () => {
    expect(curatorIsMine()).toBe(false);
  });

  it("is true for the server's admin, whose key Curator holds", () => {
    signIn(true);
    expect(curatorIsMine()).toBe(true);
  });

  it("is false for a family member's account", () => {
    signIn(false);
    expect(curatorIsMine()).toBe(false);
  });

  it('follows a sign-out and the next sign-in in the same tab', () => {
    signIn(true);
    expect(curatorIsMine()).toBe(true);
    authManager.reset();
    expect(curatorIsMine()).toBe(false);
    signIn(false);
    expect(curatorIsMine()).toBe(false);
  });
});
