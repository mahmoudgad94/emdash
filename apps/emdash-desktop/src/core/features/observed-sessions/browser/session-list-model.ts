import { createListView, createTextMatcher, type ListSource } from '@emdash/ui/react/patterns';
import type { ObservedSession } from '../api/schemas';
import {
  compareByLastActivity,
  compareByStart,
  compareByToolCalls,
  hostLabel,
  sourceLabel,
} from '../api/session-labels';

/**
 * The list-view state layer for one client's sessions: an externally owned source (the component
 * bridges its query via `useQueryListSource`), immediate search over source, machine, branch and
 * commit subjects, and three sorts that all end in the same last-activity tiebreak. Comparators
 * encode the display order directly, so the sort direction stays `asc`.
 */
export function createSessionListView(source: ListSource<ObservedSession>) {
  return createListView({
    getItemId: (session: ObservedSession) => session.id,
    source,
    search: {
      kind: 'sync',
      predicate: createTextMatcher((session: ObservedSession) => [
        sourceLabel(session.source),
        hostLabel(session.host),
        session.branch ?? '',
        ...session.commits.map((commit) => commit.subject),
      ]),
    },
    sort: {
      keys: {
        activity: { label: 'Last activity', compare: compareByLastActivity },
        started: { label: 'Started', compare: compareByStart },
        tools: { label: 'Tool calls', compare: compareByToolCalls },
      },
      initial: { key: 'activity', dir: 'asc' },
    },
  });
}

export type SessionListViewModel = ReturnType<typeof createSessionListView>;
