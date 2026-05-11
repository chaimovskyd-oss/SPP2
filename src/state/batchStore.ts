import { create } from "zustand";
import type { BatchJob } from "@/types/batch";

export interface BatchState {
  jobs: BatchJob[];
  upsertJob: (job: BatchJob) => void;
  removeJob: (jobId: string) => void;
}

export const useBatchStore = create<BatchState>((set) => ({
  jobs: [],
  upsertJob: (job) =>
    set((state) => {
      const exists = state.jobs.some((existing) => existing.id === job.id);
      return {
        jobs: exists
          ? state.jobs.map((existing) => (existing.id === job.id ? job : existing))
          : [...state.jobs, job]
      };
    }),
  removeJob: (jobId) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== jobId) }))
}));
