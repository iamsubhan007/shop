import 'server-only';
import { db, schema } from '@/db';

/** Record a sensitive admin action. Never throws (auditing must not break the action). */
export async function audit(actor, action, entity, entityId, before = null, after = null, tx = db) {
  try {
    await tx.insert(schema.auditLogs).values({
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      before,
      after,
    });
  } catch (e) {
    console.error('audit failed', e.message);
  }
}
