// Runs against the compiled node: `npm test` builds first.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toDateOnly, toLeaveDay, toRfc3339 } = require('../dist/nodes/Collabin/GenericFunctions');

// A Luxon DateTime, as an expression such as {{ $now }} can produce it.
const luxonLike = (iso) => ({ toISO: () => iso });

test('toDateOnly keeps the calendar date as written', () => {
	assert.equal(toDateOnly('2026-04-06T00:00:00'), '2026-04-06', 'n8n date picker value');
	assert.equal(toDateOnly('2026-04-06T00:00:00.000Z'), '2026-04-06');
	assert.equal(toDateOnly('2026-04-06T23:30:00-05:00'), '2026-04-06');
	assert.equal(toDateOnly('2026-04-06'), '2026-04-06', 'plain date, e.g. from an AI agent');
	assert.equal(toDateOnly(' 2026-04-06 '), '2026-04-06');
	assert.equal(toDateOnly(new Date('2026-04-06T10:00:00Z')), '2026-04-06');
	assert.equal(toDateOnly(luxonLike('2026-04-06T00:00:00.000+02:00')), '2026-04-06');
});

test('toLeaveDay sends the date at 12:00 UTC like the Collabin dashboard', () => {
	assert.equal(toLeaveDay('2026-04-06T00:00:00'), '2026-04-06T12:00:00Z');
	assert.equal(toLeaveDay('2026-04-06'), '2026-04-06T12:00:00Z');
	assert.equal(toLeaveDay(luxonLike('2026-04-06T00:00:00.000+02:00')), '2026-04-06T12:00:00Z');
});

test('toRfc3339 reads zone-less values in the workflow timezone', () => {
	assert.equal(
		toRfc3339('2026-04-06T00:00:00', 'Europe/Budapest'),
		'2026-04-05T22:00:00.000Z',
		'summer time (+02:00)',
	);
	assert.equal(
		toRfc3339('2026-01-15T08:30:00', 'Europe/Budapest'),
		'2026-01-15T07:30:00.000Z',
		'winter time (+01:00)',
	);
	assert.equal(
		toRfc3339('2026-03-29T03:30:00', 'Europe/Budapest'),
		'2026-03-29T01:30:00.000Z',
		'right after the DST change',
	);
	assert.equal(
		toRfc3339('2026-10-15', 'Europe/Budapest'),
		'2026-10-14T22:00:00.000Z',
		'a plain date is local midnight',
	);
	assert.equal(toRfc3339('2026-10-15T09:00:00', 'UTC'), '2026-10-15T09:00:00.000Z');
	assert.equal(
		toRfc3339('2026-04-06T00:00:00', 'Not/A_Zone'),
		'2026-04-06T00:00:00.000Z',
		'unknown timezones fall back to UTC',
	);
});

test('toRfc3339 keeps explicit offsets', () => {
	assert.equal(
		toRfc3339('2026-10-15T09:00:00.000+02:00', 'America/New_York'),
		'2026-10-15T07:00:00.000Z',
	);
	assert.equal(toRfc3339('2026-10-15T09:00:00Z', 'Europe/Budapest'), '2026-10-15T09:00:00.000Z');
	assert.equal(
		toRfc3339(luxonLike('2026-10-15T09:00:00.000+02:00'), 'UTC'),
		'2026-10-15T07:00:00.000Z',
	);
	assert.equal(
		toRfc3339(new Date('2026-10-15T09:00:00Z'), 'Europe/Budapest'),
		'2026-10-15T09:00:00.000Z',
	);
});

test('toRfc3339 passes unparseable values through for the API to reject', () => {
	assert.equal(toRfc3339('last tuesday', 'UTC'), 'last tuesday');
});
