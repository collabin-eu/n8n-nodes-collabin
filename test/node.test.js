// Runs against the compiled node: `npm test` builds first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { NodeHelpers } = require('n8n-workflow');

const { Collabin } = require('../dist/nodes/Collabin/Collabin.node');
const { CollabinTrigger } = require('../dist/nodes/Collabin/CollabinTrigger.node');
const { CollabinApi } = require('../dist/credentials/CollabinApi.credentials');
const { CollabinWebhookApi } = require('../dist/credentials/CollabinWebhookApi.credentials');
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
	}, { respond: () => ({ data: [], rules: [] }) });
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
		const params = { resource, operation, ruleId: 7, revision: 2, title: 'Workshop', teamIds: '7', leaveTypeIds: '3', returnAll: false, limit: 1, filters: {}, additionalFields: {}, userId: 1, teamId: 1, leaveId: 1, leaveTypeId: 1, status: 'APPROVED', startDate: '2026-04-06', endDate: '2026-04-06' };
		const { requests } = await run(params, { respond: () => ({ data: [], rules: [] }) });
		assert.equal(requests.length, 1, `${resource}.${operation}`);
	}
});

test('rejects unknown resources and operations', async () => {
	for (const resource of ['user', 'team', 'leaveType', 'leave', 'calendar', 'presence']) {
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
function webhookContext({ secret = 'whsec_test', events = ['leave.created', 'leave.status_changed'], body, rawBody, signature, legacySecret, typeVersion = 2, credentialError }) {
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
			getNode: () => ({ name: 'Collabin Trigger', typeVersion, parameters: { events, ...(legacySecret === undefined ? {} : { signingSecret: legacySecret }) } }),
			getNodeParameter: (name) => {
				assert.equal(name, 'events', 'the trigger must never read a signing key from node parameters');
				return events;
			},
			getCredentials: async (name) => {
				assert.equal(name, 'collabinWebhookApi');
				if (credentialError) throw credentialError;
				return { signingSecret: secret };
			},
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
	assert.deepEqual(events.options.map((option) => option.value).sort(), ['leave.created', 'leave.status_changed', 'presence.created', 'presence.revoked', 'presence.updated']);
	assert.deepEqual(events.default, ['leave.created', 'leave.status_changed']);
});

test('new trigger workflows export only a credential reference, never the signing key', () => {
	const trigger = new CollabinTrigger();
	const credential = new CollabinWebhookApi();
	assert.deepEqual(trigger.description.version, [1, 2]);
	assert.equal(trigger.description.defaultVersion, 2);
	assert.deepEqual(trigger.description.credentials, [{ name: credential.name, required: true }]);
	assert.ok(require('../package.json').n8n.credentials.includes('dist/credentials/CollabinWebhookApi.credentials.js'));
	assert.equal(credential.properties.find((property) => property.name === 'signingSecret').typeOptions.password, true);

	// Use n8n's actual parameter resolver: version 2 has no secret parameter.
	const parameters = NodeHelpers.getNodeParameters(trigger.description.properties, {}, true, false, { typeVersion: 2 }, trigger.description);
	assert.ok(!('signingSecret' in parameters));
	const workflow = {
		nodes: [{ type: 'n8n-nodes-collabin.collabinTrigger', typeVersion: 2, parameters,
			credentials: { collabinWebhookApi: { id: 'credential-7', name: 'Collabin webhook' } } }],
	};
	const serialized = JSON.stringify(workflow);
	assert.ok(!serialized.includes('signingSecret'));
	assert.deepEqual(JSON.parse(serialized).nodes[0].credentials, { collabinWebhookApi: { id: 'credential-7', name: 'Collabin webhook' } });
	assert.equal(NodeHelpers.displayParameter({}, trigger.description.properties.find((property) => property.name === 'signingSecret'), { typeVersion: 1 }, trigger.description), true, 'legacy users can clear the stored value before upgrading');
});

test('legacy plaintext secrets cannot authenticate, even after upgrading or selecting credentials', async () => {
	const body = { event: 'leave.created' };
	const raw = Buffer.from(JSON.stringify(body));
	for (const typeVersion of [1, 2]) {
		const { context, response } = webhookContext({ body, typeVersion, legacySecret: 'whsec_test', signature: sign('whsec_test', raw) });
		assert.deepEqual(await new CollabinTrigger().webhook.call(context), { noWebhookResponse: true });
		assert.equal(response.statusCode, 401);
		assert.match(response.payload.message, /credential migration required/);
		assert.ok(!JSON.stringify(response).includes('whsec_test'));
	}
});

test('credential-only migration keeps both trigger versions and the event payload compatible', async () => {
	const body = { event: 'leave.status_changed', delivery_id: 'delivery-1', data: { id: 42, status: 'APPROVED' } };
	const raw = Buffer.from(JSON.stringify(body));
	for (const typeVersion of [1, 2]) {
		const migrated = webhookContext({ body, typeVersion, legacySecret: '', secret: 'whsec_rotated', signature: sign('whsec_rotated', raw) });
		assert.deepEqual(await new CollabinTrigger().webhook.call(migrated.context), { workflowData: [[{ json: body }]] });
		const oldKey = webhookContext({ body, typeVersion, legacySecret: '', secret: 'whsec_rotated', signature: sign('whsec_test', raw) });
		assert.deepEqual(await new CollabinTrigger().webhook.call(oldKey.context), { noWebhookResponse: true });
		assert.equal(oldKey.response.statusCode, 401);
	}
	assert.equal(new CollabinTrigger().description.webhooks[0].path, 'collabin');
});

test('missing or unavailable credentials fail closed without exposing errors or secrets', async () => {
	const body = { event: 'leave.created' };
	const raw = Buffer.from(JSON.stringify(body));
	for (const options of [{ credentialError: new Error('private credential failure details') }, { secret: null }, { secret: {} }]) {
		const { context, response } = webhookContext({ body, signature: sign('whsec_test', raw), ...options });
		assert.deepEqual(await new CollabinTrigger().webhook.call(context), { noWebhookResponse: true });
		assert.equal(response.statusCode, 401);
		assert.deepEqual(response.payload, { message: 'Missing or unconfigured webhook signature' });
	}
});

test('malformed signature headers always return 401 without throwing', async () => {
	const body = { event: 'leave.created' };
	const raw = Buffer.from(JSON.stringify(body));
	const unicode = 'sha256=' + 'é'.repeat(64);
	assert.equal(unicode.length, sign('whsec_test', raw).length, 'same JS character length');
	assert.notEqual(Buffer.byteLength(unicode), Buffer.byteLength(sign('whsec_test', raw)), 'different byte length must never reach timingSafeEqual');
	for (const signature of [unicode, ['sha256=' + '0'.repeat(64)], 71, {}, 'sha256=' + '0'.repeat(63), 'sha256=' + '0'.repeat(65), 'sha256=' + 'g'.repeat(64), sign('whsec_test', raw) + '\n']) {
		const { context, response } = webhookContext({ body, signature });
		context.getNodeParameter = () => assert.fail('unauthenticated requests must not evaluate event-filter expressions');
		assert.deepEqual(await new CollabinTrigger().webhook.call(context), { noWebhookResponse: true });
		assert.equal(response.statusCode, 401);
	}
});


test('passes the explicitly reviewed presence token and exact optimistic timestamp on approval', async () => {
    const reviewed = { presenceToken: 'reviewed-token', expectedUpdatedAt: '2031-03-01T12:00:00.123456789Z' };
    const { requests } = await run({ resource: 'leave', operation: 'updateStatus', leaveId: 8, status: 'APPROVED', ...reviewed });
    assert.deepEqual(requests[0].body, { status: 'APPROVED', presence_token: reviewed.presenceToken, expected_updated_at: reviewed.expectedUpdatedAt });
    assert.equal(requests.length, 1, 'must never fetch a token and silently approve a conflict');
    const rejected = await run({ resource: 'leave', operation: 'updateStatus', leaveId: 8, status: 'REJECTED', ...reviewed });
    assert.equal(rejected.requests[0].body.presence_token, undefined);
    assert.equal(rejected.requests[0].body.expected_updated_at, reviewed.expectedUpdatedAt);
});

const presenceParams = { resource: 'presence', title: 'Workshop', reason: 'Planning', startDate: '2031-03-03T00:00:00+01:00', endDate: '2031-03-04T00:00:00+01:00', teamIds: '7,8,7', leaveTypeIds: '3,4', requestPolicy: 'BLOCK', ruleId: 9, revision: 2 };

test('reads the non-paginated presence rules envelope without losing policies or revisions', async () => {
    const rules = [{ id: 9, request_policy: 'BLOCK', revision: 3 }, { id: 10, revoked_at: '2031-01-01T12:00:00Z' }];
    const { output, requests } = await run({ resource: 'presence', operation: 'getAll' }, { respond: () => ({ rules, teams: [], timezone: 'Europe/Budapest' }) });
    assert.deepEqual(output.map(item => item.json), rules);
    assert.equal(requests[0].url, 'https://api.collabin.test/v1/presence-rules');
    assert.equal(requests[0].qs, undefined);
    assert.equal(requests.length, 1);
});

test('creates, previews and updates presence rules with explicit scope and policy', async () => {
    for (const operation of ['create', 'preview', 'update']) {
        const { requests } = await run({ ...presenceParams, operation });
        assert.equal(requests.length, 1);
        assert.equal(requests[0].method, operation === 'update' ? 'PUT' : 'POST');
        assert.equal(requests[0].url, 'https://api.collabin.test/v1/presence-rules' + (operation === 'preview' ? '/preview' : operation === 'update' ? '/9' : ''));
        assert.deepEqual(requests[0].body, { title: 'Workshop', reason: 'Planning', start_date: '2031-03-03', end_date: '2031-03-04', team_ids: [7, 8], leave_type_ids: [3, 4], request_policy: 'BLOCK', ...(operation === 'update' ? { revision: 2 } : {}) });
    }
});

test('requires explicit organization scope and accepts numeric ID arrays from expressions', async () => {
    const { requests } = await run({ ...presenceParams, operation: 'create', organization: true, teamIds: 'invalid hidden field', leaveTypeIds: [3, 4], requestPolicy: undefined });
    assert.deepEqual(requests[0].body.team_ids, []);
    assert.deepEqual(requests[0].body.leave_type_ids, [3, 4]);
    assert.equal(requests[0].body.request_policy, 'WARN');
    for (const field of ['teamIds', 'leaveTypeIds']) {
        for (const value of ['', [], '0', '-1', '1.5', '1,', 'NaN', '1e2', '9007199254740992']) {
            const context = executeContext({ ...presenceParams, operation: 'create', [field]: value });
            await assert.rejects(new Collabin().execute.call(context), /positive integer IDs/);
            assert.equal(context.requests.length, 0);
        }
    }
});

test('revokes only the reviewed revision and preserves per-item requests and outputs', async () => {
    const { requests, output } = await run((name, i) => ({ resource: 'presence', operation: 'revoke', ruleId: i + 9, revision: i + 2 })[name], { items: [{ json: {} }, { json: {} }], respond: options => ({ revision: options.body.revision + 1 }) });
    assert.deepEqual(requests.map(r => [r.method, r.url, r.body]), [
        ['POST', 'https://api.collabin.test/v1/presence-rules/9/revoke', { revision: 2 }],
        ['POST', 'https://api.collabin.test/v1/presence-rules/10/revoke', { revision: 3 }],
    ]);
    assert.deepEqual(output.map(item => item.pairedItem), [{ item: 0 }, { item: 1 }]);
});

test('surfaces presence conflicts without automatic retry or approval', async () => {
    for (const code of ['PRESENCE_BLOCKED', 'PRESENCE_CHANGED']) {
        const context = executeContext({ ...presenceParams, operation: 'update' }, { respond: () => { throw Object.assign(new Error(code), { httpCode: code === 'PRESENCE_BLOCKED' ? '422' : '409', message: code }); } });
        await assert.rejects(new Collabin().execute.call(context));
        assert.equal(context.requests.length, 1);
    }
});

test('receives all signed presence events with the complete payload and filters unselected events', async () => {
    for (const event of ['presence.created', 'presence.updated', 'presence.revoked']) {
        const body = { event, organization_id: 1, data: { id: 9, revision: 3, request_policy: 'BLOCK', team_ids: [7], leave_type_ids: [3] } };
        const signature = sign('whsec_test', JSON.stringify(body));
        const subscribed = webhookContext({ body, signature, events: [event] });
        assert.deepEqual(await new CollabinTrigger().webhook.call(subscribed.context), { workflowData: [[{ json: body }]] });
        const filtered = webhookContext({ body, signature, events: ['leave.created'] });
        assert.deepEqual(await new CollabinTrigger().webhook.call(filtered.context), {});
        const forged = webhookContext({ body, signature: sign('wrong', JSON.stringify(body)), events: [event] });
        assert.deepEqual(await new CollabinTrigger().webhook.call(forged.context), { noWebhookResponse: true });
        assert.equal(forged.response.statusCode, 401);
    }
});

test('exposes cancellation lifecycle statuses in both leave list filters', () => {
    const filters = new Collabin().description.properties.filter(p => p.name === 'filters' && p.options.some(o => o.name === 'status'));
    assert.equal(filters.length, 2);
    for (const filter of filters) assert.deepEqual(filter.options.find(o => o.name === 'status').options.map(o => o.value).sort(), ['APPROVED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'PENDING', 'REJECTED', 'WITHDRAWN']);
});
