import path from "node:path";

// Dependency-free: also imported by the forked canvas SQL worker.
export function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
