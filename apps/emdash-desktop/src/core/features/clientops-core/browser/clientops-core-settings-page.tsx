import { PageLayout, SettingsRow, SettingsSection } from '@emdash/ui/react/patterns';
import { Alert, Badge, Button, Input, toast } from '@emdash/ui/react/primitives';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useOpenModal } from '@core/manifests/browser/modal-api';
import { getHostClient } from '@core/primitives/desktop-host/browser/host-client';
import { queryClient } from '@core/primitives/query/browser/query-client';
import { getClientOpsCoreClient } from '../api/browser/client';
import {
  CLIENT_OPS_QUERY_ROOT,
  ENROLLMENT_REQUEST_FILENAME,
  ENROLLMENT_RESULT_FILENAME,
  type CoreLinkStatus,
} from '../api/schemas';
import { describeCoreState } from './core-status-view';

const statusQueryKey = [...CLIENT_OPS_QUERY_ROOT, 'status'] as const;

/** Everything that depends on the connection (status, clients, live badges) reloads together. */
function refreshConnectionQueries(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: CLIENT_OPS_QUERY_ROOT });
}

type Notice = { status: 'info' | 'success'; text: string };

export function ClientOpsCoreSettingsPage() {
  const openConfirm = useOpenModal('confirmActionModal');
  const [notice, setNotice] = useState<Notice>();
  const [coreUrl, setCoreUrl] = useState('');
  const statusQuery = useQuery<CoreLinkStatus>({
    queryKey: statusQueryKey,
    queryFn: async () => (await getClientOpsCoreClient()).getStatus(),
    staleTime: 0,
  });
  const status = statusQuery.data;
  const savedUrl = status?.coreUrl;

  useEffect(() => {
    if (savedUrl !== undefined) setCoreUrl(savedUrl);
  }, [savedUrl]);

  const saveUrl = useMutation({
    mutationFn: async () => (await getClientOpsCoreClient()).setCoreUrl({ coreUrl }),
    onSuccess: async (result) => {
      if (!result.success)
        return toast.error('Could not save the Core URL', { description: result.error.message });
      setNotice(undefined);
      await refreshConnectionQueries();
    },
  });

  const exportRequest = useMutation({
    mutationFn: async () => {
      const directory = await (
        await getHostClient()
      ).openSelectDirectoryDialog({
        title: 'Export enrollment request',
        message: `Choose where to save ${ENROLLMENT_REQUEST_FILENAME}`,
      });
      if (!directory) return undefined;
      return (await getClientOpsCoreClient()).generateEnrollmentRequest({ directory });
    },
    onSuccess: async (result) => {
      if (!result) return;
      if (!result.success) {
        return toast.error('Could not export the enrollment request', {
          description: result.error.message,
        });
      }
      setNotice({
        status: 'info',
        text: `Saved ${result.data.filePath}. In the Client Ops Mac app choose Enroll device, import this file and approve it with Touch ID. Then import the ${ENROLLMENT_RESULT_FILENAME} it writes.`,
      });
      await refreshConnectionQueries();
    },
  });

  const importResult = useMutation({
    mutationFn: async () => {
      const path = await (
        await getHostClient()
      ).openSelectDirectoryDialog({
        title: 'Import enrollment result',
        message: `Choose the folder that contains ${ENROLLMENT_RESULT_FILENAME}`,
      });
      if (!path) return undefined;
      return (await getClientOpsCoreClient()).importEnrollmentResult({ path });
    },
    onSuccess: async (result) => {
      if (!result) return;
      if (!result.success) {
        return toast.error('Could not import the enrollment result', {
          description: result.error.message,
        });
      }
      setNotice({ status: 'success', text: 'Enrollment imported.' });
      await refreshConnectionQueries();
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const outcome = await openConfirm({
        title: 'Disconnect from Client Ops Core',
        description:
          'This removes the identity key and certificate from this device. You will need to enroll again to reconnect.',
        confirmLabel: 'Disconnect',
        variant: 'destructive',
      });
      if (!outcome.success) return false;
      await (await getClientOpsCoreClient()).disconnect();
      return true;
    },
    onSuccess: async (disconnected) => {
      if (!disconnected) return;
      setNotice(undefined);
      await refreshConnectionQueries();
    },
  });

  const view = status ? describeCoreState(status.state) : undefined;
  const canDisconnect = status !== undefined && status.state.kind !== 'unconfigured';
  const urlChanged = savedUrl !== undefined && coreUrl.trim() !== savedUrl;

  return (
    <div className="space-y-8 pb-10">
      <PageLayout.Header
        sticky
        draggable
        title="Client Ops Core"
        description="Connect this app to your Client Ops Core to group projects under your clients."
      />
      {notice && (
        <Alert.Root status={notice.status} onDismiss={() => setNotice(undefined)}>
          <Alert.Description>{notice.text}</Alert.Description>
        </Alert.Root>
      )}
      <SettingsSection title="Connection">
        <SettingsRow
          label="Status"
          description={view?.detail ?? 'Checking the connection…'}
          control={view && <Badge tone={view.tone}>{view.label}</Badge>}
        />
        <SettingsRow
          label="Core URL"
          description="The address of Client Ops Core on this network."
          control={
            <div className="flex items-center gap-2">
              <Input
                aria-label="Core URL"
                className="w-72"
                value={coreUrl}
                onChange={(event) => setCoreUrl(event.target.value)}
                spellCheck={false}
              />
              <Button
                variant="secondary"
                disabled={!urlChanged || saveUrl.isPending}
                onClick={() => saveUrl.mutate()}
              >
                Save
              </Button>
            </div>
          }
        />
      </SettingsSection>
      <SettingsSection title="Identity">
        <SettingsRow
          label="Export enrollment request"
          description={`Creates this app's keys and saves ${ENROLLMENT_REQUEST_FILENAME} for the Client Ops Mac app.`}
          control={
            <Button
              variant="secondary"
              disabled={exportRequest.isPending}
              onClick={() => exportRequest.mutate()}
            >
              Export…
            </Button>
          }
        />
        <SettingsRow
          label="Import enrollment result"
          description={`Choose the folder with the ${ENROLLMENT_RESULT_FILENAME} the Mac app wrote.`}
          control={
            <Button
              variant="secondary"
              disabled={importResult.isPending}
              onClick={() => importResult.mutate()}
            >
              Import…
            </Button>
          }
        />
        <SettingsRow
          label="Disconnect"
          description="Removes this app's identity from this device."
          control={
            <Button
              variant="destructive"
              disabled={!canDisconnect || disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Disconnect
            </Button>
          }
        />
      </SettingsSection>
    </div>
  );
}
