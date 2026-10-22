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
        description={`When a new message needs you and the client has a project open on this Mac, Claude Code reads the conversation and the project in the background and works out what it needs. It never sends anything to a client, only runs for messages that arrive after this was first on, and runs while the app is open. At most ${AUTO_TRIAGE_DAILY_CAP} a day; ${started} today.`}
        control={
          <Switch
            checked={state.enabled}
            onCheckedChange={(enabled) => setState((current) => ({ ...current, enabled }))}
            aria-label="Triage new client messages automatically"
          />
        }
      />
      <SettingsRow
        label="Save Claude's reply as a draft"
        description="Claude works in the background, read-only, with no task created. Its reply is saved as a draft in Need you; nothing is sent until you approve it with Touch ID."
        control={
          <Switch
            checked={state.autoDraft}
            disabled={!state.enabled}
            onCheckedChange={(autoDraft) => setState((current) => ({ ...current, autoDraft }))}
            aria-label="Save Claude's reply as a draft automatically"
          />
        }
      />
    </SettingsSection>
  );
}
