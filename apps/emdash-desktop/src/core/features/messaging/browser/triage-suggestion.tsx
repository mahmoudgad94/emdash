import { Pill } from '@emdash/ui/react/components';
import { Alert, Button, Textarea } from '@emdash/ui/react/primitives';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useMemento } from '@core/primitives/mementos/react';
import { saveDraft, needYouQueryKey } from '../api/browser/messaging-queries';
import { draftInputFor, replyBlockedReason } from '../api/draft-payload';
import type { ConversationSummary } from '../api/schemas';
import { triageTypeLabel } from '../api/triage-result';
import { threadTriageMemento } from '../contributions/mementos';
import { useOnline } from './use-online';

/**
 * What Claude made of this conversation: the kind of message, what must come first, and a reply to
 * review. While Claude is still working it says so. The reply is only ever saved as a draft.
 */
export function TriageSuggestion({ conversation }: { conversation: ConversationSummary }) {
  const [triage, setTriage] = useMemento(threadTriageMemento);
  const queryClient = useQueryClient();
  const online = useOnline();
  const [text, setText] = useState('');
  const result = triage.result;

  useEffect(() => {
    setText(result?.draft ?? '');
  }, [result?.draft]);

  const input = draftInputFor(conversation, text, online);
  const blocked = replyBlockedReason(conversation, online);
  const save = useMutation({
    mutationFn: saveDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: needYouQueryKey });
      setTriage((current) => ({ ...current, status: 'used' }));
    },
  });

  if (triage.status === 'waiting') {
    return (
      <p className="shrink-0 rounded-lg border border-border bg-background-1 px-3 py-2 text-xs text-foreground-muted">
        Claude is reading this conversation and checking the project. The suggested reply shows up
        here.
      </p>
    );
  }
  if (triage.status === 'failed') {
    return (
      <p className="shrink-0 rounded-lg border border-border bg-background-1 px-3 py-2 text-xs text-foreground-muted">
        Claude did not answer in time. Use Ask again, or open the task to see where it stopped.
      </p>
    );
  }
  if (triage.status === 'drafted' && result) {
    return (
      <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-border bg-background-1 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Claude drafted a reply</span>
          <Pill variant="info">{triageTypeLabel(result.type)}</Pill>
        </div>
        {result.first && (
          <p className="text-xs text-foreground-muted">
            <span className="text-foreground">First: </span>
            {result.first}
          </p>
        )}
        <p className="text-sm break-words whitespace-pre-wrap text-foreground">{result.draft}</p>
        <p className="text-xs text-foreground-muted">
          Saved as a draft in Need you. Sending needs your Touch ID in the Mac app.
        </p>
      </div>
    );
  }
  if (triage.status !== 'ready' || !result) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-background-1 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">Claude&apos;s read</span>
        <Pill variant="info">{triageTypeLabel(result.type)}</Pill>
      </div>
      {result.first && (
        <p className="text-xs text-foreground-muted">
          <span className="text-foreground">First: </span>
          {result.first}
        </p>
      )}
      {result.next && (
        <p className="text-xs text-foreground-muted">
          <span className="text-foreground">Next: </span>
          {result.next}
        </p>
      )}
      {result.project && (
        <p className="truncate text-xs text-foreground-passive" title={result.project}>
          {result.project}
        </p>
      )}
      {result.draft && (
        <>
          <Textarea
            aria-label="Suggested reply"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {save.isError && (
            <Alert.Root status="destructive">
              <Alert.Description>Could not save the draft. Try again.</Alert.Description>
            </Alert.Root>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs text-foreground-muted">
              {blocked ?? 'Saved as a draft. Sending needs your Touch ID in the Mac app.'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTriage((current) => ({ ...current, status: 'used' }))}
            >
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={input === undefined || save.isPending}
              onClick={() => input !== undefined && save.mutate(input)}
            >
              {save.isPending ? 'Saving…' : 'Save as draft'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
