import { Pill } from '@emdash/ui/react/components';
import { RelativeTime } from '@emdash/ui/react/primitives';
import type { ReplyState } from '../api/reply-state';

/** Whether a conversation waits on the owner, at a glance: "Reply · 2h" or "Replied". */
export function ReplyChip({ state }: { state: ReplyState | undefined }) {
  if (!state || state.kind === 'quiet') return null;
  if (state.kind === 'replied')
    return (
      <Pill variant="neutral" title="You answered last">
        Replied
      </Pill>
    );
  return (
    <Pill variant="warning" title="The client wrote last and is waiting on you">
      Reply
      {state.since && (
        <>
          {' · '}
          <RelativeTime value={state.since} compact />
        </>
      )}
    </Pill>
  );
}
