import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { MAX_VERSIONS } from '@/lib/menuPdf/validate';

// Which menu PDF customers get. One row in shop_settings (key 'menu_pdf'), changed only under a row lock:
//   { source: 'auto' | 'custom', activeId, files: [{ id, name, original, size, uploadedAt, uploadedBy }] }
// It never touches products, categories or deals: uploading a PDF and managing the menu are separate things.

const KEY = 'menu_pdf';
const { shopSettings } = schema;

export function normalizeState(value) {
  const files = Array.isArray(value?.files) ? value.files.filter((f) => f && f.id && f.name) : [];
  const custom = value?.source === 'custom' && files.some((f) => f.id === value.activeId);
  return { source: custom ? 'custom' : 'auto', activeId: custom ? value.activeId : null, files };
}

export const activeFile = (state) => (state.source === 'custom' ? state.files.find((f) => f.id === state.activeId) || null : null);

export async function getMenuPdfState() {
  const [row] = await db.select().from(shopSettings).where(eq(shopSettings.key, KEY));
  return normalizeState(row?.value);
}

export class StateError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

/** Runs `change(state)` while holding the row, and saves what it returns. Throwing leaves everything as it was. */
async function update(change) {
  return db.transaction(async (tx) => {
    await tx.insert(shopSettings).values({ key: KEY, value: normalizeState(null) }).onConflictDoNothing();
    const [row] = await tx.select().from(shopSettings).where(eq(shopSettings.key, KEY)).for('update');
    const before = normalizeState(row.value);
    const { state, ...result } = change(before);
    await tx.update(shopSettings).set({ value: state, updatedAt: new Date() }).where(eq(shopSettings.key, KEY));
    return { before, state, ...result };
  });
}

/** Adds an uploaded file. Old versions beyond the limit are dropped (never the active one) and returned. */
export function addMenuVersion(file, { activate }) {
  return update((s) => {
    const files = [file, ...s.files];
    const next = activate ? { source: 'custom', activeId: file.id } : { source: s.source, activeId: s.activeId };
    const kept = files.filter((f, i) => i < MAX_VERSIONS || f.id === next.activeId);
    return { state: { ...next, files: kept }, dropped: files.filter((f) => !kept.includes(f)) };
  });
}

export function activateMenuVersion(id) {
  return update((s) => {
    if (!s.files.some((f) => f.id === id)) throw new StateError('That PDF no longer exists.', 404);
    return { state: { ...s, source: 'custom', activeId: id } };
  });
}

/** Back to the automatically generated menu. The uploaded files stay, ready to be activated again. */
export function switchToAutomaticMenu() {
  return update((s) => ({ state: { ...s, source: 'auto', activeId: null } }));
}

export function deleteMenuVersion(id) {
  return update((s) => {
    const file = s.files.find((f) => f.id === id);
    if (!file) throw new StateError('That PDF no longer exists.', 404);
    if (s.activeId === id) throw new StateError('This PDF is the active menu. Switch to another one first.');
    return { state: { ...s, files: s.files.filter((f) => f.id !== id) }, file };
  });
}
