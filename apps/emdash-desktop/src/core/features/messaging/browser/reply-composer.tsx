import { Alert, Button, Textarea } from '@emdash/ui/react/primitives';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type KeyboardEvent } from 'react';
import { MessagingQueryError, needYouQueryKey, saveDraft } from '../api/browser/messaging-queries';
import { draftInputFor, replyBlockedReason } from '../api/draft-payload';
import { describeMessagingFailure } from '../api/failure-messages';
import type { ConversationSummary } from '../api/schemas';
import { useOnline } from './use-online';

export const DRAFT_SAVED_NOTE = 'Draft saved. Approve it in Need you.';

/**
 * Writes a reply and saves it as a Core draft. Nothing is sent from here: the owner approves the
 * draft with Touch ID in the Client Ops Mac app. Mount it with a `key` per conversation so each
 * conversation starts with an empty box.
 */
export function ReplyComposer({
  conversation,
  onOpenNeedYou,
}: {
  conversation: ConversationSummary;
  onOpenNeedYou: () => void;
}) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  const blocked = replyBlockedReason(conversation, online);
  const input = draftInputFor(conversation, text, online);

  const save = useMutation({
    mutationFn: saveDraft,
    onSuccess: () => {
      setText('');
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: needYouQueryKey });
    },
  });

  const submit = () => {
    if (input === undefined || save.isPending) return;
    save.mutate(input);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const failure = save.isError
    ? describeMessagingFailure(
        save.error instanceof MessagingQueryError ? save.error.code : 'unknown',
        'draft'
      )
    : undefined;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-3">
      {saved && (
        <Alert.Root status="success" onDismiss={() => setSaved(false)}>
          <Alert.Description>
            {DRAFT_SAVED_NOTE}{' '}
            <button
              type="button"
              className="cursor-pointer underline underline-offset-2"
              onClick={onOpenNeedYou}
            >
              Open Need you
            </button>
          </Alert.Description>
        </Alert.Root>
      )}
      {failure && (
        <Alert.Root status="destructive">
          <Alert.Title>{failure.title}</Alert.Title>
          <Alert.Description>{failure.detail}</Alert.Description>
        </Alert.Root>
      )}
      <Textarea
        aria-label="Reply"
        rows={3}
        value={text}
        disabled={blocked !== null}
        placeholder={blocked ?? 'Write a reply. It is saved as a draft, not sent.'}
        onChange={(event) => {
          setText(event.target.value);
          if (saved) setSaved(false);
          if (save.isError) save.reset();
        }}
        onKeyDown={onKeyDown}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs text-foreground-muted">
          {blocked ?? 'Sending needs your Touch ID in the Client Ops Mac app.'}
        </p>
        <Button
          variant="primary"
          size="sm"
          disabled={input === undefined || save.isPending}
          onClick={submit}
        >
          {save.isPending ? 'Saving…' : 'Save draft'}
        </Button>
      </div>
    </div>
  );
}
