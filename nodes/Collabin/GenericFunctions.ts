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
 * been collected.
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
	} while (returnData.length < ((responseData.total as number) ?? 0));

	return returnData;
}

/**
 * Convert an n8n `dateTime` parameter value (ISO 8601, e.g.
 * `2026-04-06T00:00:00.000Z`) into the `YYYY-MM-DD` format required by the
 * `/v1/calendar` endpoint.
 */
export function toDateOnly(value: string): string {
	return value.split('T')[0];
}
