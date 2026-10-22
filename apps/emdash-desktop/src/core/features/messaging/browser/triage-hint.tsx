import { SubjectProvider, useMemento } from '@core/primitives/mementos/react';
import { triageTypeLabel } from '../api/triage-result';
import { threadTriageMemento } from '../contributions/mementos';
import { clientThreadSubject } from '../contributions/subject';

function Hint() {
  const [triage] = useMemento(threadTriageMemento);
  if (triage.status === 'waiting')
    return <p className="truncate text-xs text-foreground-passive">Claude is checking…</p>;
  if ((triage.status !== 'ready' && triage.status !== 'drafted') || !triage.result) return null;
  const { type, next } = triage.result;
  return (
    <p className="truncate text-xs text-foreground" title={next}>
      {triage.status === 'drafted' ? 'Draft ready' : 'Claude'}: {triageTypeLabel(type)}
      {next ? ` · ${next}` : ''}
    </p>
  );
}

/** One line of what Claude made of a conversation, when it has looked at it. */
export function TriageHint({ conversationId }: { conversationId: string }) {
  return (
    <SubjectProvider subject={clientThreadSubject({ conversationId })} fallback={null}>
      <Hint />
    </SubjectProvider>
  );
}
