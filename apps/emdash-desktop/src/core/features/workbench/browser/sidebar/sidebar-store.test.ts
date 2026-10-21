import { observable, runInAction } from 'mobx';
import { describe, expect, it, vi } from 'vitest';
import { taskManagerStoreToken } from '@core/features/tasks/contributions/browser/project-store-tokens';
import type { WorkbenchSidebarState } from '@core/features/workbench/contributions/mementos';
import type { MementoHandle } from '@core/primitives/mementos/browser';
import { SidebarStore, type SidebarProjectGrouping } from './sidebar-store';

type SidebarProjectManager = ConstructorParameters<typeof SidebarStore>[0];

vi.mock('@core/features/conversations/browser/acp/acp-chat-store', () => ({
  AcpChatStore: class {
    conversationId = '';
    dispose() {}
    bootstrap() {}
  },
}));

vi.mock('@core/features/conversations/browser/acp/acp-chat-panel', () => ({
  AcpChatPanel: () => null,
}));

function projectManager(projects: { id: string; createdAt: string }[]): SidebarProjectManager {
  return {
    projects: new Map(projects.map((p) => [p.id, { ...p, context: null }])),
  } as unknown as SidebarProjectManager;
}

function task(id: string, createdAt: string) {
  return {
    state: 'provisioned',
    data: {
      id,
      type: 'coding-agent',
      isPinned: false,
      createdAt,
      updatedAt: createdAt,
    },
  };
}

function projectManagerWithTasks(
  projects: { id: string; createdAt: string; taskIds: string[] }[]
): SidebarProjectManager {
  return {
    projects: new Map(
      projects.map((project) => {
        const taskManager = {
          tasks: new Map(
            project.taskIds.map((taskId, index) => [
              taskId,
              task(taskId, `2026-01-01T00:00:0${index}.000Z`),
            ])
          ),
        };
        return [
          project.id,
          {
            id: project.id,
            createdAt: project.createdAt,
            context: {
              kind: 'available',
              context: {
                get: (token: unknown) =>
                  token === taskManagerStoreToken ? taskManager : undefined,
              },
            },
          },
        ];
      })
    ),
  } as unknown as SidebarProjectManager;
}

function mementoHandle(initial: WorkbenchSidebarState): MementoHandle<WorkbenchSidebarState> {
  let value = initial;
  return {
    get value() {
      return value;
    },
    ready: Promise.resolve(),
    isPending: false,
    hasStoredValue: true,
    read: () => value,
    update: (next) => {
      value = typeof next === 'function' ? next(value) : next;
    },
    reset: async () => {},
    flush: async () => {},
    autoPersist: () =>
      (() => {}) as ReturnType<MementoHandle<WorkbenchSidebarState>['autoPersist']>,
    dispose: async () => {},
  };
}

describe('SidebarStore project ordering', () => {
  it('keeps a restored collapsed project collapsed during initial task hydration', () => {
    const tasks = observable.map<string, ReturnType<typeof task>>();
    const project = observable({
      id: 'project-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      context: null as null | {
        kind: 'available';
        context: { get: () => { tasks: typeof tasks } };
      },
    });
    const manager = {
      projects: observable.map([['project-1', project]]),
    } as unknown as SidebarProjectManager;
    const handle = mementoHandle({
      version: '1',
      expandedProjectIds: [],
      projectOrder: [],
      taskOrderByProject: {},
      taskSortBy: 'created-at',
    });
    const store = new SidebarStore(manager);
    store.attachMemento(handle);

    runInAction(() => {
      project.context = {
        kind: 'available',
        context: { get: () => ({ tasks }) },
      };
    });
    runInAction(() => {
      tasks.set('task-1', task('task-1', '2026-01-01T00:00:00.000Z'));
    });

    expect([...store.expandedProjectIds]).toEqual([]);
    expect(handle.value.expandedProjectIds).toEqual([]);
  });

  it('reads and writes through an attached memento', () => {
    const store = new SidebarStore(projectManager([]));
    const handle = mementoHandle({
      version: '1',
      expandedProjectIds: ['project-1'],
      projectOrder: ['project-1'],
      taskOrderByProject: {},
      taskSortBy: 'updated-at',
    });

    store.attachMemento(handle);
    expect([...store.expandedProjectIds]).toEqual(['project-1']);
    expect(store.taskSortBy).toBe('updated-at');

    store.setTaskSortBy('created-at');
    expect(handle.value.taskSortBy).toBe('created-at');
  });

  it('reveals a project without changing its persisted expansion preference', () => {
    const store = new SidebarStore(projectManager([{ id: 'project-1', createdAt: '2026-01-01' }]));
    const handle = mementoHandle({
      version: '1',
      expandedProjectIds: [],
      projectOrder: [],
      taskOrderByProject: {},
      taskSortBy: 'created-at',
    });
    store.attachMemento(handle);

    store.revealProject('project-1');
    expect([...store.expandedProjectIds]).toEqual(['project-1']);
    expect(handle.value.expandedProjectIds).toEqual([]);

    store.toggleProjectExpanded('project-1');
    expect([...store.expandedProjectIds]).toEqual([]);
    expect(handle.value.expandedProjectIds).toEqual([]);
  });

  it('sorts projects newest first by default', () => {
    const store = new SidebarStore(
      projectManager([
        { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'new', createdAt: '2026-01-02T00:00:00.000Z' },
      ])
    );

    expect(store.orderedProjects.map((project) => project.id)).toEqual(['new', 'old']);
  });

  it('places projects missing from a saved manual order first', () => {
    const store = new SidebarStore(
      projectManager([
        { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'manual', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 'new', createdAt: '2026-01-03T00:00:00.000Z' },
      ])
    );

    store.setProjectOrder(['manual', 'old']);

    expect(store.orderedProjects.map((project) => project.id)).toEqual(['new', 'manual', 'old']);
  });

  it('returns visible task entries in rendered project-tree order', () => {
    const store = new SidebarStore(
      projectManagerWithTasks([
        {
          id: 'project-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          taskIds: ['task-1a', 'task-1b'],
        },
        {
          id: 'project-2',
          createdAt: '2026-01-02T00:00:00.000Z',
          taskIds: ['task-2a'],
        },
      ])
    );

    store.setProjectOrder(['project-1', 'project-2']);
    store.toggleProjectExpanded('project-1');
    store.toggleProjectExpanded('project-2');
    store.setTaskOrder('project-1', ['task-1a', 'task-1b']);

    expect(store.visibleTaskEntries).toEqual([
      { projectId: 'project-1', taskId: 'task-1a' },
      { projectId: 'project-1', taskId: 'task-1b' },
      { projectId: 'project-2', taskId: 'task-2a' },
    ]);
  });

  it('excludes pinned automation runs from every sidebar selector', () => {
    const manager = projectManagerWithTasks([
      {
        id: 'project-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        taskIds: ['regular-task', 'automation-task'],
      },
    ]);
    const project = manager.projects.get('project-1')!;
    const context = project.context?.kind === 'available' ? project.context.context : undefined;
    const tasks = context!.get(taskManagerStoreToken).tasks;
    tasks.get('regular-task')!.data.isPinned = true;
    tasks.get('automation-task')!.data.isPinned = true;
    tasks.get('automation-task')!.data.type = 'automation-run';

    const store = new SidebarStore(manager);
    store.toggleProjectExpanded('project-1');

    expect(store.pinnedSidebarEntries).toEqual([
      { projectId: 'project-1', taskId: 'regular-task' },
    ]);
    expect(store.visibleTaskIdsForProject('project-1')).toEqual([]);
    expect(store.sidebarRows).toEqual([{ kind: 'project', projectId: 'project-1' }]);
  });

  describe('project grouping', () => {
    const three = () =>
      projectManager([
        { id: 'a', createdAt: '2026-01-03T00:00:00.000Z' },
        { id: 'b', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 'c', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);

    it('keeps the plain project list when the grouping offers no groups', () => {
      const grouping: SidebarProjectGrouping = { groupProjects: () => undefined };
      expect(new SidebarStore(three(), grouping).sidebarRows).toEqual(
        new SidebarStore(three()).sidebarRows
      );
    });

    it('puts a header row above each group and orders projects group by group', () => {
      const groupProjects = vi.fn((ids: readonly string[]) => [
        { key: 'client:acme', label: 'Acme', projectIds: ['c', 'a'], activeCount: 2 },
        { key: 'own', label: 'Your projects', projectIds: ids.filter((id) => id === 'b') },
      ]);
      const store = new SidebarStore(three(), { groupProjects });

      expect(store.sidebarRows).toEqual([
        { kind: 'group', key: 'client:acme', label: 'Acme', activeCount: 2 },
        { kind: 'project', projectId: 'c' },
        { kind: 'project', projectId: 'a' },
        { kind: 'group', key: 'own', label: 'Your projects' },
        { kind: 'project', projectId: 'b' },
      ]);
      // The grouping sees the projects in their saved order, newest first by default.
      expect(groupProjects).toHaveBeenCalledWith(['a', 'b', 'c']);
    });

    it('never hides a project the grouping forgot, and skips groups that end up empty', () => {
      const store = new SidebarStore(three(), {
        groupProjects: () => [
          { key: 'empty', label: 'Nobody', projectIds: ['gone'] },
          { key: 'client:acme', label: 'Acme', projectIds: ['a'] },
        ],
      });

      expect(store.sidebarRows).toEqual([
        { kind: 'group', key: 'client:acme', label: 'Acme' },
        { kind: 'project', projectId: 'a' },
        { kind: 'project', projectId: 'b' },
        { kind: 'project', projectId: 'c' },
      ]);
    });

    it('lists each project once even if two groups claim it', () => {
      const store = new SidebarStore(three(), {
        groupProjects: () => [
          { key: 'one', label: 'One', projectIds: ['a', 'b'] },
          { key: 'two', label: 'Two', projectIds: ['b', 'c'] },
        ],
      });

      expect(
        store.sidebarRows.filter((row) => row.kind === 'project').map((row) => row.projectId)
      ).toEqual(['a', 'b', 'c']);
    });

    it('does not change task entries or pinned entries', () => {
      const store = new SidebarStore(
        projectManagerWithTasks([
          { id: 'a', createdAt: '2026-01-02T00:00:00.000Z', taskIds: ['a1'] },
          { id: 'b', createdAt: '2026-01-01T00:00:00.000Z', taskIds: ['b1'] },
        ]),
        { groupProjects: () => [{ key: 'g', label: 'G', projectIds: ['b', 'a'] }] }
      );
      store.toggleProjectExpanded('a');
      store.toggleProjectExpanded('b');

      expect(store.visibleTaskEntries).toEqual([
        { projectId: 'b', taskId: 'b1' },
        { projectId: 'a', taskId: 'a1' },
      ]);
    });
  });
});
