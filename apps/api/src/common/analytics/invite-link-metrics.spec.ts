import {
  inviteLinkAttributedSubscribers,
  inviteLinkJoinedSubscribers,
  sumInviteLinkAttributedSubscribers,
  sumInviteLinkJoinedSubscribers,
} from './invite-link-metrics';

describe('invite-link-metrics', () => {
  it('counts only joined subscribers for joined metrics', () => {
    expect(
      inviteLinkJoinedSubscribers({
        joinedCount: 16,
        requestedCount: 8,
      }),
    ).toBe(16);

    expect(
      sumInviteLinkJoinedSubscribers([
        { joinedCount: 16, requestedCount: 8 },
        { joinedCount: 3, requestedCount: 2 },
      ]),
    ).toBe(19);
  });

  it('keeps attributed totals including pending requests where explicitly needed', () => {
    expect(
      inviteLinkAttributedSubscribers({
        joinedCount: 16,
        requestedCount: 8,
      }),
    ).toBe(24);

    expect(
      sumInviteLinkAttributedSubscribers([
        { joinedCount: 16, requestedCount: 8 },
        { joinedCount: 3, requestedCount: 2 },
      ]),
    ).toBe(29);
  });
});
