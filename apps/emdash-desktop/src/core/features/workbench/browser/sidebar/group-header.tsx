import { Badge, MicroLabel } from '@emdash/ui/react/primitives';

/** A non-interactive label above a run of projects, such as one client's projects. */
export function SidebarGroupHeader({
  label,
  activeCount,
}: {
  label: string;
  activeCount?: number;
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-2 pr-1 pl-2" role="presentation">
      <MicroLabel className="truncate font-medium text-foreground-tertiary-passive">
        {label}
      </MicroLabel>
      {activeCount ? (
        <Badge
          tone="success"
          className="shrink-0"
          title={`${activeCount} active in the last 5 minutes`}
        >
          {activeCount} live
        </Badge>
      ) : null}
    </div>
  );
}
