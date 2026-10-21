import type { SettingsPageTab } from '@core/features/settings/contributions/views';
import {
  defineSettingsPageContribution,
  type SettingsPageContribution,
} from '@core/primitives/settings/api/page-contribution';
import { ClientOpsCoreSettingsPage } from '../browser/clientops-core-settings-page';

export const clientOpsCoreSettingsPage = defineSettingsPageContribution({
  id: 'clientops-core',
  label: 'Client Ops Core',
  icon: 'users',
  component: ClientOpsCoreSettingsPage,
} satisfies SettingsPageContribution<SettingsPageTab>);
