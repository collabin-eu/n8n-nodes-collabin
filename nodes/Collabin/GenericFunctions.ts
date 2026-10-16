import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/**
 * Maximum page size accepted by the Collabin /v1 API.
 */
export const MAX_PAGE_SIZE = 500;

/**
 * Make an authenticated request against the Collabin /v1 REST API.
 *
 * The `X-API-Key` header is attached automatically via the `collabinApi`
 * credential's `authenticate` definition.
 */
export async function collabinApiRequest(
	this: IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials('collabinApi');
	const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}/v1${endpoint}`,
		json: true,
	};

	if (Object.keys(body).length > 0) {
		options.body = body;
	}

	if (Object.keys(qs).length > 0) {
		options.qs = qs;
	}

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'collabinApi',
			options,
		)) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/**
 * Fetch every page of a paginated Collabin list endpoint and return the
 * combined `data` array.
 *
 * The Collabin API returns `{ data, total, limit, offset }`. This helper
 * walks `offset` forward by `MAX_PAGE_SIZE` until all `total` items have
 * been collected or a page comes back empty.
 */
export async function collabinApiRequestAllItems(
	this: IExecuteFunctions,
	endpoint: string,
	qs: IDataObject = {},
): Promise<IDataObject[]> {
	const returnData: IDataObject[] = [];

	const query: IDataObject = { ...qs, limit: MAX_PAGE_SIZE, offset: 0 };

	let responseData: IDataObject;
	do {
		responseData = await collabinApiRequest.call(this, 'GET', endpoint, {}, query);
		const page = (responseData.data as IDataObject[]) ?? [];
		returnData.push(...page);
		query.offset = (query.offset as number) + (query.limit as number);
		// Items deleted while paging shrink the list below the reported total;
		// an empty page means there is nothing left to fetch.
		if (page.length === 0) break;
	} while (returnData.length < ((responseData.total as number) ?? 0));

	return returnData;
}

/**
 * Read an n8n `dateTime` parameter value as text. The date picker yields a
 * zone-less string (e.g. `2026-04-06T00:00:00`), expressions may yield an ISO
 * string with an offset, a Date or a Luxon DateTime.
 */
function dateTimeToString(value: unknown): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	const withToISO = value as { toISO?: () => string } | null | undefined;
	if (withToISO && typeof withToISO.toISO === 'function') {
		return String(withToISO.toISO());
	}
	return String(value ?? '').trim();
}

/**
 * Convert an n8n `dateTime` parameter value into the `YYYY-MM-DD` calendar
 * date, as written, that the date filters of the Collabin /v1 API expect.
 */
export function toDateOnly(value: unknown): string {
	return dateTimeToString(value).split('T')[0];
}

/**
 * Convert an n8n `dateTime` parameter value into a leave day for
 * `POST /v1/leaves`: the calendar date at 12:00 UTC, which is how the Collabin
 * dashboard stores leave days and what every /v1 version accepts.
 */
export function toLeaveDay(value: unknown): string {
	return `${toDateOnly(value)}T12:00:00Z`;
}

/**
 * The offset (in milliseconds) of a timezone from UTC at the given instant.
 */
function timeZoneOffset(instant: number, timeZone: string): number {
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		}).formatToParts(new Date(instant));
		const part = (type: string) =>
			Number(parts.find((candidate) => candidate.type === type)?.value);
		const wallClock = Date.UTC(
			part('year'),
			part('month') - 1,
			part('day'),
			part('hour'),
			part('minute'),
			part('second'),
		);
		return wallClock - instant;
	} catch {
		// An unknown timezone falls back to UTC.
		return 0;
	}
}

/**
 * Convert an n8n `dateTime` parameter value into the RFC 3339 timestamp that
 * `updated_since` requires. A value without a zone, as the n8n date picker
 * produces it, is a wall-clock time in the workflow's timezone.
 */
export function toRfc3339(value: unknown, timeZone: string): string {
	const text = dateTimeToString(value);
	if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
		const parsed = new Date(text);
		return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/.exec(
		text,
	);
	if (!match) {
		// Let the API report the invalid value.
		return text;
	}
	const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
	const wallClock = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
	// The offset is looked up again at the result so DST changes are respected.
	const firstGuess = wallClock - timeZoneOffset(wallClock, timeZone);
	return new Date(wallClock - timeZoneOffset(firstGuess, timeZone)).toISOString();
}
