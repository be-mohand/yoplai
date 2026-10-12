import { createProactiveDmNoteStore, type ProactiveDmNoteStore } from "./proactive-dm-notes.js";
import {
  createSlackThreadSessionBindingStore,
  type SlackThreadSessionBindingStore,
} from "./thread-session-bindings.js";

/** Open the proactive-DM store, run `fn`, always close. Errors propagate. */
export function withProactiveDmNotes<T>(
  dataDir: string,
  fn: (store: ProactiveDmNoteStore) => T
): T {
  const store = createProactiveDmNoteStore(dataDir);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

/** Open the thread-binding store, run `fn`, always close. Errors propagate. */
export function withThreadBindings<T>(
  dataDir: string,
  fn: (store: SlackThreadSessionBindingStore) => T
): T {
  const store = createSlackThreadSessionBindingStore(dataDir);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}
