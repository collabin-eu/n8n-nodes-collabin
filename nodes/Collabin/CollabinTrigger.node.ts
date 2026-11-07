import { createHmac, timingSafeEqual } from 'crypto';

import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';

const EVENT_OPTIONS = [
	{
		name: 'Presence Created',
		value: 'presence.created',
		description: 'Triggered when a mandatory presence rule is created',
	},
	{
		name: 'Presence Updated',
		value: 'presence.updated',
		description: 'Triggered when a mandatory presence rule changes, including its request policy',
	},
	{
		name: 'Presence Revoked',
		value: 'presence.revoked',
		description: 'Triggered when a mandatory presence rule is revoked',
	},
	{
		name: 'Leave Created',
		value: 'leave.created',
		description: 'Triggered when a new leave request is created',
	},
	{
		name: 'Leave Status Changed',
		value: 'leave.status_changed',
		description:
			'Triggered when a leave request is approved, rejected, withdrawn, or its cancellation status changes',
	},
];

export class CollabinTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Collabin Trigger',
		name: 'collabinTrigger',
		icon: 'file:collabin.svg',
		group: ['trigger'],
		version: [1, 2],
		defaultVersion: 2,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when Collabin sends a webhook event',
		defaults: {
			name: 'Collabin Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'collabinWebhookApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'collabin',
				rawBody: true,
			},
		],
		properties: [
			{
				displayName:
					'Create a webhook in your Collabin dashboard under Settings → Webhooks pointing to the URL below, subscribed to the events you want. Save its signing secret in a Collabin Webhook API credential and select that credential above.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName:
					'This older trigger must be migrated before it can receive events. Rotate the webhook in Collabin, save the new secret in a Collabin Webhook API credential, and clear the Legacy Signing Secret below. The webhook URL and workflow output stay the same. See the upgrade guide in the credential documentation.',
				name: 'credentialMigrationNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { '@version': [1] } },
			},
			{
				displayName: 'Legacy Signing Secret',
				name: 'signingSecret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				displayOptions: { show: { '@version': [1] } },
				description:
					'Clear this field after migrating to a Collabin Webhook API credential. A non-empty value blocks the trigger; it is never used for authentication.',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: EVENT_OPTIONS,
				default: ['leave.created', 'leave.status_changed'],
				description:
					'Only trigger the workflow for these event types. Make sure the webhook in Collabin is subscribed to the same events, otherwise they will never be sent here.',
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const headers = this.getHeaderData() as IDataObject;
		const res = this.getResponseObject();

		// Old parameters survive node upgrades and exports. Never silently use
		// or ignore a populated legacy secret, including on an upgraded v2 node.
		const legacySecret = this.getNode().parameters.signingSecret;
		if (legacySecret !== undefined && legacySecret !== '') {
			res.status(401).json({
				message: 'Webhook credential migration required; clear the legacy Signing Secret',
			});
			return { noWebhookResponse: true };
		}

		let signingSecret: unknown;
		try {
			const credentials = await this.getCredentials('collabinWebhookApi');
			signingSecret = credentials.signingSecret;
		} catch {
			// A missing/unavailable credential cannot fall back to workflow data.
			res.status(401).json({ message: 'Missing or unconfigured webhook signature' });
			return { noWebhookResponse: true };
		}

		const signatureHeader = headers['x-collabin-signature'];
		const rawBody = req.rawBody;

		if (typeof signingSecret !== 'string' || !signingSecret || !signatureHeader || !rawBody) {
			res.status(401).json({ message: 'Missing or unconfigured webhook signature' });
			return { noWebhookResponse: true };
		}

		const expectedSignature = `sha256=${createHmac('sha256', signingSecret).update(rawBody).digest('hex')}`;

		// Validate the ASCII wire format before comparing bytes. JS character
		// length alone does not protect timingSafeEqual from unequal byte lengths.
		const signatureIsValid =
			typeof signatureHeader === 'string' &&
			signatureHeader.length === expectedSignature.length &&
			/^sha256=[0-9a-f]{64}$/.test(signatureHeader) &&
			timingSafeEqual(
				Buffer.from(signatureHeader, 'ascii'),
				Buffer.from(expectedSignature, 'ascii'),
			);

		if (!signatureIsValid) {
			res.status(401).json({ message: 'Invalid webhook signature' });
			return { noWebhookResponse: true };
		}

		const events = this.getNodeParameter('events') as string[];
		const bodyData = this.getBodyData() as IDataObject;
		const event = bodyData.event as string | undefined;

		if (event && events.length > 0 && !events.includes(event)) {
			// No `workflowData` and `noWebhookResponse` left unset: n8n sends its default
			// "received" response (onReceived mode) and skips the workflow run.
			return {};
		}

		return {
			workflowData: [this.helpers.returnJsonArray(bodyData)],
		};
	}
}
