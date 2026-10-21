import { EmptyState, Pill } from '@emdash/ui/react/components';
import { Alert, AbsoluteTime, Button, Sheet, Spinner, toast } from '@emdash/ui/react/primitives';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  MessagingQueryError,
  needYouQueryOptions,
  openApprovalApp,
} from '../api/browser/messaging-queries';
import { describeMessagingFailure } from '../api/failure-messages';
import { previewText } from '../api/labels';
import { buildDraftRows, describeDraftState, type DraftRow } from '../api/need-you';
import type { ConversationSummary } from '../api/schemas';

export const APPROVAL_NOTE =
  'Approving a draft needs your Touch ID, which only the Client Ops Mac app can ask for.';
export const APPROVE_LABEL = 'Approve in the Client Ops Mac app';

function codeOf(error: unknown): string {
  return error instanceof MessagingQueryError ? error.code : 'unknown';
}

function DraftItem({ row }: { row: DraftRow }) {
  const state = describeDraftState(row.draft.state);
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border bg-background-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {row.clientName}
        </span>
        <Pill
          variant={
            state.tone === 'warning' ? 'warning' : state.tone === 'info' ? 'info' : 'neutral'
          }
        >
          {state.label}
        </Pill>
      </div>
      <p className="truncate text-xs text-foreground-muted">{row.channel}</p>
      <p className="text-sm break-words whitespace-pre-wrap text-foreground">
        {previewText(row.draft.text, 280)}
      </p>
      {row.draft.createdAt && (
        <AbsoluteTime
          value={row.draft.createdAt}
          className="text-[11px] text-foreground-passive tabular-nums"
        />
      )}
    </li>
  );
}

function DraftList({ conversations }: { conversations: readonly ConversationSummary[] }) {
  const query = useQuery(needYouQueryOptions());
  if (query.isPending) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (query.isError) {
    const failure = describeMessagingFailure(codeOf(query.error), 'need_you');
    return <EmptyState bare label={failure.title} description={failure.detail} />;
  }
  const rows = buildDraftRows(query.data.drafts, conversations);
  if (rows.length === 0) {
    return (
      <EmptyState
        bare
        label="Nothing is waiting for you."
        description="Drafts you save from Messages appear here until you approve them."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {query.data.truncated && (
        <p className="rounded-md bg-background-1 px-3 py-1.5 text-xs text-foreground-muted">
          Showing the oldest drafts only.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <DraftItem key={row.draft.id} row={row} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Drafts waiting for the owner. Nothing can be approved here: the sheet only lists them and opens
 * the Client Ops Mac app, where approval is signed with Touch ID.
 */
export function NeedYouSheet({
  open,
  onClose,
  conversations,
}: {
  open: boolean;
  onClose: () => void;
  conversations: readonly ConversationSummary[];
}) {
  const opener = useMutation({
    mutationFn: openApprovalApp,
    onError: (error) => {
      const failure = describeMessagingFailure(codeOf(error), 'approval_app');
      toast.error(`${failure.title} ${failure.detail}`);
    },
  });
  return (
    <Sheet.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Sheet.Content className="[-webkit-app-region:no-drag]" style={{ maxWidth: '36rem' }}>
        <Sheet.Header>
          <div className="flex min-w-0 flex-col gap-1">
            <Sheet.Title>Need you</Sheet.Title>
            <p className="text-xs text-foreground-muted">Replies waiting for your approval.</p>
          </div>
        </Sheet.Header>
        <Sheet.Body>{open && <DraftList conversations={conversations} />}</Sheet.Body>
        <Sheet.Footer>
          <div className="flex w-full flex-col gap-2">
            <Alert.Root status="info" icon={null}>
              <Alert.Description>{APPROVAL_NOTE}</Alert.Description>
            </Alert.Root>
            <Button variant="primary" disabled={opener.isPending} onClick={() => opener.mutate()}>
              {APPROVE_LABEL}
            </Button>
          </div>
        </Sheet.Footer>
      </Sheet.Content>
    </Sheet.Root>
  );
}
