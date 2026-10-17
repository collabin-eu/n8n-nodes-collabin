// Runs against the compiled node: `npm test` builds first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const { Collabin } = require('../dist/nodes/Collabin/Collabin.node');
const { CollabinTrigger } = require('../dist/nodes/Collabin/CollabinTrigger.node');
const { CollabinApi } = require('../dist/credentials/CollabinApi.credentials');
const { MAX_PAGE_SIZE } = require('../dist/nodes/Collabin/GenericFunctions');

const node = { name: 'Collabin', type: 'n8n-nodes-collabin.collabin', typeVersion: 1, position: [0, 0], parameters: {} };

/** A minimal IExecuteFunctions double that records every HTTP request. */
function executeContext(params, { respond = () => ({}), items = [{ json: {} }], continueOnFail = false } = {}) {
	const requests = [];
	return {
		requests,
		getInputData: () => items,
		getNodeParameter: (name, itemIndex, fallback) => {
			const value = typeof params === 'function' ? params(name, itemIndex) : params[name];
			return value === undefined ? fallback : value;
		},
		getCredentials: async () => ({ apiKey: 'clb_test', baseUrl: 'https://api.collabin.test//' }),
		getNode: () => node,
		getTimezone: () => 'Europe/Budapest',
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (credentialName, options) => {
				// The pager reuses and advances one query object, so record a snapshot.
				requests.push({ credentialName, ...options, ...(options.qs ? { qs: { ...options.qs } } : {}) });
				if (requests.length > 50) throw new Error('too many requests');
				return respond(options);
			},
			returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			constructExecutionMetaData: (data, { itemData }) => data.map((item) => ({ ...item, pairedItem: itemData })),
		},
	};
}

async function run(params, options) {
	const context = executeContext(params, options);
	const [output] = await new Collabin().execute.call(context);
	return { output, requests: context.requests };
}

const page = (count, start = 0) => Array.from({ length: count }, (_, index) => ({ id: start + index + 1 }));

test('reads single records from the /v1 API with the API key credential', async () => {
	const cases = [
		[{ resource: 'user', operation: 'get', userId: 5 }, '/users/5'],
		[{ resource: 'team', operation: 'get', teamId: 3 }, '/teams/3'],
		[{ resource: 'leave', operation: 'get', leaveId: 9 }, '/leaves/9'],
	];
	for (const [params, path] of cases) {
		const { output, requests } = await run(params, { respond: () => ({ id: 1 }) });
		assert.deepEqual(requests, [{ credentialName: 'collabinApi', method: 'GET', url: `https://api.collabin.test/v1${path}`, json: true }]);
		assert.deepEqual(output, [{ json: { id: 1 }, pairedItem: { item: 0 } }]);
	}
});

test('lists a limited page with the filters', async () => {
	const cases = [
		[{ resource: 'user', operation: 'getAll', returnAll: false, limit: 2, filters: { status: 'ACTIVE' } }, '/users', { status: 'ACTIVE', limit: 2 }],
		[{ resource: 'user', operation: 'getLeaves', userId: 4, returnAll: false, limit: 3, filters: { status: 'APPROVED' } }, '/users/4/leaves', { status: 'APPROVED', limit: 3 }],
		[{ resource: 'team', operation: 'getAll', returnAll: false, limit: 4 }, '/teams', { limit: 4 }],
		[{ resource: 'leaveType', operation: 'getAll', returnAll: false, limit: 5 }, '/leave-types', { limit: 5 }],
	];
	for (const [params, path, qs] of cases) {
		const { output, requests } = await run(params, { respond: () => ({ data: page(2), total: 10 }) });
		assert.equal(requests.length, 1);
		assert.equal(requests[0].url, `https://api.collabin.test/v1${path}`);
		assert.deepEqual(requests[0].qs, qs);
		assert.deepEqual(output.map((item) => item.json.id), [1, 2]);
	}
});

test('returns every page when "Return All" is on', async () => {
	const cases = [
		[{ resource: 'user', operation: 'getAll', returnAll: true, filters: { role: 'EMPLOYEE' } }, '/users', { role: 'EMPLOYEE' }],
		[{ resource: 'user', operation: 'getLeaves', userId: 4, returnAll: true, filters: {} }, '/users/4/leaves', {}],
		[{ resource: 'team', operation: 'getAll', returnAll: true }, '/teams', {}],
		[{ resource: 'leaveType', operation: 'getAll', returnAll: true }, '/leave-types', {}],
	];
	for (const [params, path, filters] of cases) {
		const { output, requests } = await run(params, {
			respond: ({ qs }) => ({ data: page(qs.offset === 0 ? MAX_PAGE_SIZE : 3, qs.offset), total: MAX_PAGE_SIZE + 3 }),
		});
		assert.deepEqual(requests.map((request) => [request.url, request.qs]), [
			[`https://api.collabin.test/v1${path}`, { ...filters, limit: MAX_PAGE_SIZE, offset: 0 }],
			[`https://api.collabin.test/v1${path}`, { ...filters, limit: MAX_PAGE_SIZE, offset: MAX_PAGE_SIZE }],
		]);
		assert.equal(output.length, MAX_PAGE_SIZE + 3);
	}
});

test('stops paging when records disappear while paging', async () => {
	const { output, requests } = await run({ resource: 'team', operation: 'getAll', returnAll: true }, {
		respond: ({ qs }) => ({ data: qs.offset === 0 ? page(MAX_PAGE_SIZE) : [], total: MAX_PAGE_SIZE + 20 }),
	});
	assert.equal(requests.length, 2);
	assert.equal(output.length, MAX_PAGE_SIZE);
});

test('stops after one page when the response has no total', async () => {
	const { requests } = await run({ resource: 'team', operation: 'getAll', returnAll: true }, { respond: () => ({ data: page(1) }) });
	assert.equal(requests.length, 1);
});

test('sends leave filters as calendar dates and updated_since as RFC 3339', async () => {
	const { requests } = await run({
		resource: 'leave',
		operation: 'getAll',
		returnAll: false,
		limit: 50,
		filters: { start: '2026-04-06T00:00:00', end: '2026-04-30T00:00:00', updated_since: '2026-04-01T08:00:00', status: 'PENDING' },
	}, { respond: () => ({ data: [] }) });
	assert.deepEqual(requests[0].qs, { start: '2026-04-06', end: '2026-04-30', updated_since: '2026-04-01T06:00:00.000Z', status: 'PENDING', limit: 50 });

	const all = await run({ resource: 'leave', operation: 'getAll', returnAll: true, filters: {} }, { respond: () => ({ data: [], total: 0 }) });
	assert.deepEqual(all.requests[0].qs, { limit: MAX_PAGE_SIZE, offset: 0 });
});

test('creates a leave at noon UTC so the day never shifts', async () => {
	const { requests } = await run({
		resource: 'leave',
		operation: 'create',
		userId: 7,
		leaveTypeId: 2,
		startDate: '2026-04-06T00:00:00',
		endDate: '2026-04-08T00:00:00',
		additionalFields: { reason: 'Family trip' },
	}, { respond: () => ({ id: 30 }) });
	assert.equal(requests[0].method, 'POST');
	assert.equal(requests[0].url, 'https://api.collabin.test/v1/leaves');
	assert.deepEqual(requests[0].body, {
		user_id: 7,
		leave_type_id: 2,
		start_date: '2026-04-06T12:00:00Z',
		end_date: '2026-04-08T12:00:00Z',
		is_half_day: false,
		reason: 'Family trip',
	});

	const halfDay = await run({ resource: 'leave', operation: 'create', userId: 7, leaveTypeId: 2, startDate: '2026-04-06', endDate: '2026-04-06', additionalFields: { isHalfDay: true } });
	assert.deepEqual(halfDay.requests[0].body, { user_id: 7, leave_type_id: 2, start_date: '2026-04-06T12:00:00Z', end_date: '2026-04-06T12:00:00Z', is_half_day: true });
});

test('approves or rejects a leave, sending a reason only for rejections', async () => {
	const approve = await run({ resource: 'leave', operation: 'updateStatus', leaveId: 9, status: 'APPROVED', rejectionReason: 'ignored' });
	assert.equal(approve.requests[0].method, 'PUT');
	assert.equal(approve.requests[0].url, 'https://api.collabin.test/v1/leaves/9/status');
	assert.deepEqual(approve.requests[0].body, { status: 'APPROVED' });

	const reject = await run({ resource: 'leave', operation: 'updateStatus', leaveId: 9, status: 'REJECTED', rejectionReason: 'Peak season' });
	assert.deepEqual(reject.requests[0].body, { status: 'REJECTED', rejection_reason: 'Peak season' });
});

test('turns notifications off only when Send Notifications is off', async () => {
	const base = { resource: 'leave', operation: 'create', userId: 7, leaveTypeId: 2, startDate: '2026-04-06', endDate: '2026-04-06', additionalFields: {} };
	const defaulted = await run(base);
	assert.ok(!('notify' in defaulted.requests[0].body), 'the API notifies by default; older versions do not know the field');
	const explicitOn = await run({ ...base, notify: true });
	assert.ok(!('notify' in explicitOn.requests[0].body));
	const silentCreate = await run({ ...base, notify: false });
	assert.equal(silentCreate.requests[0].body.notify, false);

	const silentDecision = await run({ resource: 'leave', operation: 'updateStatus', leaveId: 9, status: 'APPROVED', notify: false });
	assert.deepEqual(silentDecision.requests[0].body, { status: 'APPROVED', notify: false });
	const silentRejection = await run({ resource: 'leave', operation: 'updateStatus', leaveId: 9, status: 'REJECTED', rejectionReason: 'Peak season', notify: false });
	assert.deepEqual(silentRejection.requests[0].body, { status: 'REJECTED', rejection_reason: 'Peak season', notify: false });

	const notify = new Collabin().description.properties.find((property) => property.name === 'notify');
	assert.equal(notify.type, 'boolean');
	assert.equal(notify.default, true);
	assert.deepEqual(notify.displayOptions.show, { resource: ['leave'], operation: ['create', 'updateStatus'] });
});

test('reads the team calendar for a date range', async () => {
	const { output, requests } = await run(
		{ resource: 'calendar', operation: 'get', startDate: '2026-04-01T00:00:00', endDate: '2026-04-30T00:00:00' },
		{ respond: () => ({ data: [{ id: 1, name: 'Core' }] }) },
	);
	assert.deepEqual(requests[0].qs, { start: '2026-04-01', end: '2026-04-30' });
	assert.deepEqual(output.map((item) => item.json), [{ id: 1, name: 'Core' }]);
});

test('routes every operation offered in the node description', async () => {
	const { properties } = new Collabin().description;
	const pairs = properties
		.filter((property) => property.name === 'operation')
		.flatMap((property) => property.displayOptions.show.resource.flatMap((resource) => property.options.map((option) => [resource, option.value])));
	assert.ok(pairs.length >= 10);
	for (const [resource, operation] of pairs) {
		const params = { resource, operation, returnAll: false, limit: 1, filters: {}, additionalFields: {}, userId: 1, teamId: 1, leaveId: 1, leaveTypeId: 1, status: 'APPROVED', startDate: '2026-04-06', endDate: '2026-04-06' };
		const { requests } = await run(params, { respond: () => ({ data: [] }) });
		assert.equal(requests.length, 1, `${resource}.${operation}`);
	}
});

test('rejects unknown resources and operations', async () => {
	for (const resource of ['user', 'team', 'leaveType', 'leave', 'calendar']) {
		await assert.rejects(run({ resource, operation: 'explode' }), new RegExp(`Unknown operation "explode" for resource "${resource}"`));
	}
	await assert.rejects(run({ resource: 'invoice', operation: 'get' }), /Unknown resource "invoice"/);
});

test('wraps API failures and can continue per item', async () => {
	const failing = { respond: () => { throw Object.assign(new Error('Request failed with status code 404'), { httpCode: '404' }); } };
	await assert.rejects(run({ resource: 'user', operation: 'get', userId: 99 }, failing), (error) => {
		assert.equal(error.constructor.name, 'NodeApiError');
		return true;
	});

	const items = [{ json: {} }, { json: {} }];
	const { output } = await run((name, itemIndex) => ({ resource: 'user', operation: 'get', userId: itemIndex === 0 ? 1 : 99 })[name], {
		items,
		continueOnFail: true,
		respond: ({ url }) => {
			if (url.endsWith('/99')) throw new Error('not found');
			return { id: 1 };
		},
	});
	assert.equal(output.length, 2);
	assert.deepEqual(output[0], { json: { id: 1 }, pairedItem: { item: 0 } });
	assert.equal(output[1].pairedItem.item, 1);
	assert.equal(typeof output[1].json.error, 'string');
});

test('authenticates with the X-API-Key header and tests against /v1/leave-types', () => {
	const credential = new CollabinApi();
	assert.deepEqual(credential.authenticate, { type: 'generic', properties: { headers: { 'X-API-Key': '={{$credentials.apiKey}}' } } });
	assert.equal(credential.test.request.url, '/leave-types');
	assert.equal(credential.test.request.method, 'GET');

	const expression = credential.test.request.baseURL.match(/^=\{\{(.*)\}\}\/v1$/)[1];
	const evaluate = new Function('$credentials', `return ${expression}`);
	assert.equal(evaluate({ baseUrl: 'https://api.collabin.eu///' }), 'https://api.collabin.eu');
	assert.equal(evaluate({ baseUrl: 'https://api.collabin.eu' }), 'https://api.collabin.eu');
	assert.equal(credential.properties.find((property) => property.name === 'baseUrl').default, 'https://api.collabin.eu');
});

/** A minimal IWebhookFunctions double. */
function webhookContext({ secret = 'whsec_test', events = ['leave.created', 'leave.status_changed'], body, rawBody, signature }) {
	const response = { statusCode: undefined, payload: undefined };
	const raw = rawBody === undefined ? Buffer.from(JSON.stringify(body)) : rawBody;
	return {
		response,
		context: {
			getRequestObject: () => ({ rawBody: raw }),
			getHeaderData: () => (signature === undefined ? {} : { 'x-collabin-signature': signature }),
			getResponseObject: () => ({
				status(code) {
					response.statusCode = code;
					return this;
				},
				json(payload) {
					response.payload = payload;
					return this;
				},
			}),
			getNodeParameter: (name) => ({ signingSecret: secret, events })[name],
			getBodyData: () => body,
			helpers: { returnJsonArray: (data) => [{ json: data }] },
		},
	};
}

const sign = (secret, raw) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

test('accepts a correctly signed event the workflow listens to', async () => {
	const body = { event: 'leave.created', data: { id: 5 } };
	const raw = Buffer.from('{"event": "leave.created", "data": {"id": 5}}');
	const { context, response } = webhookContext({ body, rawBody: raw, signature: sign('whsec_test', raw) });
	const result = await new CollabinTrigger().webhook.call(context);
	assert.deepEqual(result, { workflowData: [[{ json: body }]] });
	assert.equal(response.statusCode, undefined);
});

test('verifies the signature over the raw body, not re-serialised JSON', async () => {
	const body = { event: 'leave.created' };
	const raw = Buffer.from('{"event": "leave.created"}');
	const { context, response } = webhookContext({ body, rawBody: raw, signature: sign('whsec_test', JSON.stringify(body)) });
	assert.deepEqual(await new CollabinTrigger().webhook.call(context), { noWebhookResponse: true });
	assert.equal(response.statusCode, 401);
});

test('rejects unsigned, unconfigured or forged requests', async () => {
	const body = { event: 'leave.created' };
	const raw = Buffer.from(JSON.stringify(body));
	const cases = [
		[{ body, signature: undefined }, 'Missing or unconfigured webhook signature'],
		[{ body, secret: '', signature: sign('whsec_test', raw) }, 'Missing or unconfigured webhook signature'],
		[{ body, rawBody: null, signature: sign('whsec_test', raw) }, 'Missing or unconfigured webhook signature'],
		[{ body, signature: 'sha256=short' }, 'Invalid webhook signature'],
		[{ body, signature: sign('another_secret', raw) }, 'Invalid webhook signature'],
	];
	for (const [options, message] of cases) {
		const { context, response } = webhookContext(options);
		assert.deepEqual(await new CollabinTrigger().webhook.call(context), { noWebhookResponse: true });
		assert.equal(response.statusCode, 401);
		assert.deepEqual(response.payload, { message });
	}
});

test('skips events the workflow did not subscribe to', async () => {
	const statusChanged = { event: 'leave.status_changed', data: { status: 'APPROVED' } };
	const raw = Buffer.from(JSON.stringify(statusChanged));
	const filtered = webhookContext({ body: statusChanged, events: ['leave.created'], signature: sign('whsec_test', raw) });
	assert.deepEqual(await new CollabinTrigger().webhook.call(filtered.context), {});

	const everything = webhookContext({ body: statusChanged, events: [], signature: sign('whsec_test', raw) });
	assert.deepEqual(await new CollabinTrigger().webhook.call(everything.context), { workflowData: [[{ json: statusChanged }]] });

	const unnamed = { data: { id: 1 } };
	const unnamedRaw = Buffer.from(JSON.stringify(unnamed));
	const withoutEvent = webhookContext({ body: unnamed, events: ['leave.created'], signature: sign('whsec_test', unnamedRaw) });
	assert.deepEqual(await new CollabinTrigger().webhook.call(withoutEvent.context), { workflowData: [[{ json: unnamed }]] });
});

test('offers exactly the webhook events Collabin sends', () => {
	const events = new CollabinTrigger().description.properties.find((property) => property.name === 'events');
	assert.deepEqual(events.options.map((option) => option.value), ['leave.created', 'leave.status_changed']);
	assert.deepEqual(events.default, ['leave.created', 'leave.status_changed']);
});
