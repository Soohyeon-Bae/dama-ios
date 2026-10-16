import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const start = source.indexOf('async function saveReminderForCurrent(){');
const end = source.indexOf('async function pickScreenshots(){', start);
assert.ok(start >= 0 && end > start, 'reminder functions must be present in the app');
const reminderCode = source.slice(start, end);

function harness(overrides = {}) {
  const original = {
    id: 'event-1', type: 'event', title: '공연', reminderAt: '2099-01-02T09:00',
    notificationId: 7, updatedAt: '2026-10-16T00:00:00.000Z'
  };
  const calls = [];
  const context = {
    items: [original],
    app: { querySelector: () => ({ value: '2099-01-03T10:00' }) },
    current: () => context.items[0],
    freshNotificationId: () => 42,
    settleSave: async id => calls.push(['settle', id]),
    scheduleReminder: async options => calls.push(['schedule', options.id]),
    cancelReminder: async id => calls.push(['cancel', id]),
    pendingReminderIds: async () => new Set([7]),
    putItem: async item => calls.push(['put', item.notificationId]),
    persist: async item => calls.push(['persist', item.notificationId]),
    isNativeApp: () => true,
    render: () => calls.push(['render']),
    toast: message => calls.push(['toast', message]),
    console: { error: () => {} },
    ...overrides
  };
  createContext(context);
  runInContext(reminderCode, context);
  return { context, calls, original };
}

test('changing an alarm saves the new id before canceling the previous alarm', async () => {
  const { context, calls, original } = harness();
  await context.saveReminderForCurrent();
  assert.deepEqual(calls.slice(0, 4).map(call => call[0]), ['settle', 'schedule', 'persist', 'cancel']);
  assert.equal(context.items[0].notificationId, 42);
  assert.equal(original.notificationId, 7);
});

test('failed storage rolls back a newly scheduled alarm and retains the previous one', async () => {
  const { context, calls } = harness({
    persist: async () => { throw new Error('disk full'); }
  });
  await context.saveReminderForCurrent();
  assert.equal(context.items[0].notificationId, 7);
  assert.deepEqual(calls.filter(call => call[0] === 'cancel').map(call => call[1]), [42]);
});

test('failure to cancel an old alarm leaves the new saved alarm intact and warns about duplicates', async () => {
  const { context, calls } = harness({
    cancelReminder: async id => { calls.push(['cancel', id]); if (id === 7) throw new Error('cancel failed'); }
  });
  await context.saveReminderForCurrent();
  assert.equal(context.items[0].notificationId, 42);
  assert.deepEqual(calls.filter(call => call[0] === 'cancel').map(call => call[1]), [7]);
  assert.match(calls.findLast(call => call[0] === 'toast')[1], /중복 알림/);
});

test('failed storage while removing an alarm restores its previous schedule', async () => {
  const { context, calls } = harness({
    persist: async () => { throw new Error('disk full'); }
  });
  await context.removeReminderForCurrent();
  assert.equal(context.items[0].notificationId, 7);
  assert.deepEqual(calls.filter(call => ['cancel', 'schedule'].includes(call[0])).map(call => call[0]), ['cancel', 'schedule']);
  assert.equal(calls.find(call => call[0] === 'schedule')[1], 7);
});

test('editing a future event replaces the alarm with the same id without canceling it first', async () => {
  const { context, calls, original } = harness();
  await context.syncSavedReminder({ ...original, title: '새 제목' }, original);
  assert.deepEqual(calls.filter(call => ['cancel', 'schedule'].includes(call[0])), [['schedule', 7]]);
});

test('failed edit clears a missing alarm so the detail view does not claim it is scheduled', async () => {
  const { context, calls, original } = harness({
    scheduleReminder: async () => { throw new Error('schedule failed'); },
    pendingReminderIds: async () => new Set()
  });
  const edited = { ...original, title: '새 제목' };
  await context.syncSavedReminder(edited, original);
  assert.equal(edited.notificationId, null);
  assert.equal(edited.reminderAt, '');
  assert.deepEqual(calls.find(call => call[0] === 'put'), ['put', null]);
});

test('failed edit preserves an alarm that is still pending', async () => {
  const { context, calls, original } = harness({
    scheduleReminder: async () => { throw new Error('schedule failed'); }
  });
  const edited = { ...original, title: '새 제목' };
  await context.syncSavedReminder(edited, original);
  assert.equal(edited.notificationId, 7);
  assert.equal(calls.some(call => call[0] === 'put'), false);
});
