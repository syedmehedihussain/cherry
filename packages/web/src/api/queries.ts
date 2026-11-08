import { QueryClient, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { z } from 'zod';
import {
  ConfigSchema,
  HealthSchema,
  PlanUsageSchema,
  type PlanUsage,
  ProjectListSchema,
  type Health,
  type ProjectList,
} from '@cherry/shared';
import { setHome } from '../lib/paths.ts';
import { api } from './client.ts';
import { socket } from './socket.ts';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

export const keys = {
  projects: ['projects'] as const,
  health: ['health'] as const,
  config: ['config'] as const,
  planUsage: ['planUsage'] as const,
};

const ConfigViewSchema = ConfigSchema.extend({
  resolvedProjectsDir: z.string(),
  home: z.string().optional(),
});
export const useConfig = () =>
  useQuery({
    queryKey: keys.config,
    queryFn: () =>
      api('GET', '/api/config', undefined, ConfigViewSchema).then((c) => {
        setHome(c.home);
        return c;
      }),
  });

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => api('GET', '/api/projects', undefined, ProjectListSchema),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: () => api('GET', '/api/health', undefined, HealthSchema),
  });
}

export function recheckHealth(): Promise<Health> {
  return api('POST', '/api/health/recheck', undefined, HealthSchema).then((h) => {
    queryClient.setQueryData(keys.health, h);
    return h;
  });
}

/** claude.ai plan limits (5-hour and weekly), refreshed every minute. */
const LAST_USAGE = 'cherry.planUsage.last';
const LAST_USAGE_MS = 6 * 3_600_000;

/** The last reading that had the limits, if it is recent (finding #43). */
function lastUsage(): PlanUsage | undefined {
  try {
    const v = PlanUsageSchema.safeParse(JSON.parse(localStorage.getItem(LAST_USAGE) ?? 'null'));
    return v.success && Date.now() - v.data.fetchedAt < LAST_USAGE_MS ? v.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The plan's 5-hour and weekly limits. A reload, or a reading that comes back without them,
 * shows the last known one instead of nothing (finding #43).
 */
export function usePlanUsage() {
  return useQuery({
    queryKey: keys.planUsage,
    queryFn: async () => {
      const now = await api('GET', '/api/claude/usage', undefined, PlanUsageSchema);
      if (now.available && (now.fiveHour || now.week)) {
        try {
          localStorage.setItem(LAST_USAGE, JSON.stringify(now));
        } catch {
          // Private window: only this reading is kept.
        }
        return now;
      }
      return lastUsage() ?? now;
    },
    placeholderData: lastUsage,
    refetchInterval: 60_000,
  });
}

/** Keeps project cards and health live from WebSocket events. Mounted once in the shell. */
export function useLiveProjects(): void {
  useEffect(() => {
    const unsub = socket.subscribe('projects');
    const off = socket.on((event) => {
      if (event.type === 'projects.updated') {
        queryClient.setQueryData<ProjectList>(keys.projects, (old) =>
          old ? { ...old, cards: event.cards } : old,
        );
      } else if (event.type === 'health.updated') {
        queryClient.setQueryData(keys.health, HealthSchema.parse(event));
      }
    });
    const offReconnect = socket.onReconnect(() => void queryClient.invalidateQueries());
    return () => {
      unsub();
      off();
      offReconnect();
    };
  }, []);
}
