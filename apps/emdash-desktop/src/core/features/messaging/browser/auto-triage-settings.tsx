import { SettingsRow, SettingsSection } from '@emdash/ui/react/patterns';
import { Switch } from '@emdash/ui/react/primitives';
import { useMemento } from '@core/primitives/mementos/react';
import { AUTO_TRIAGE_DAILY_CAP } from '../api/auto-triage';
import { autoTriageMemento } from '../contributions/mementos';

/** The switch for starting triage tasks by itself, with how many were started today. */
export function AutoTriageSettings() {
  const [state, setState] = useMemento(autoTriageMemento);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const started = state.day === todayKey ? state.started : 0;
  return (
    <SettingsSection title="Automatic triage">
      <SettingsRow
        label="Triage new client messages by itself"
        description={`When a new message needs you and the client has an open project, Claude Code reads the conversation, checks the project and drafts a reply in a task linked to the conversation. It never sends anything to a client, only starts for messages that arrive after this was first on, and runs while the app is open. At most ${AUTO_TRIAGE_DAILY_CAP} tasks a day; ${started} started today.`}
        control={
          <Switch
            checked={state.enabled}
            onCheckedChange={(enabled) => setState((current) => ({ ...current, enabled }))}
            aria-label="Triage new client messages automatically"
          />
        }
      />
    </SettingsSection>
  );
}
