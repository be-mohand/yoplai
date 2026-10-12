// Shared by sql.ts and the forked sql-worker.ts. Type-only: no runtime imports.
export type DashboardQueryRequest = {
  root: string;
  rootDev: number;
  rootIno: number;
  snapshotParent: string;
  snapshotParentDev: number;
  snapshotParentIno: number;
  snapshotDirectory: string;
  snapshotDev: number;
  snapshotIno: number;
  database: string;
  sql: string;
  bindings: Record<string, string | null>;
  rowLimit: number;
  resultByteLimit: number;
};
