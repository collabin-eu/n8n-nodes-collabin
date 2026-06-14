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
		name: 'Leave Created',
		value: 'leave.created',
		description: 'Triggered when a new leave request is created (status PENDING)',
	},
	{
		name: 'Leave Status Changed',
		value: 'leave.status_changed',
		description: 'Triggered when a leave request is approved or rejected',
	},
];

export class CollabinTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Collabin Trigger',
		name: 'collabinTrigger',
		icon: 'file:collabin.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when Collabin sends a webhook event',
		defaults: {
			name: 'Collabin Trigger',
		},
		inputs: [],
		outputs: ['main'],
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
					'Create a webhook in your Collabin dashboard under Settings → Webhooks pointing to the URL below, subscribed to the events you want. Paste the signing secret shown there into "Signing Secret" below.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Signing Secret',
				name: 'signingSecret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				description:
					'The signing secret shown when the webhook was created in the Collabin dashboard. Used to verify the "X-Collabin-Signature" header (HMAC-SHA256) of every incoming request.',
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

		const signingSecret = this.getNodeParameter('signingSecret') as string;
		const events = this.getNodeParameter('events') as string[];

		const signatureHeader = (headers['x-collabin-signature'] as string | undefined) ?? '';
		const rawBody = req.rawBody;

		if (!signingSecret || !signatureHeader || !rawBody) {
			res.status(401).json({ message: 'Missing or unconfigured webhook signature' });
			return { noWebhookResponse: true };
		}

		const expectedSignature = `sha256=${createHmac('sha256', signingSecret).update(rawBody).digest('hex')}`;

		const signatureIsValid =
			signatureHeader.length === expectedSignature.length &&
			timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature));

		if (!signatureIsValid) {
			res.status(401).json({ message: 'Invalid webhook signature' });
			return { noWebhookResponse: true };
		}

		const bodyData = this.getBodyData() as IDataObject;
		const event = bodyData.event as string | undefined;

		if (event && events.length > 0 && !events.includes(event)) {
			// Acknowledge the delivery so Collabin does not retry, but skip the workflow run.
			return { noWebhookResponse: true };
		}

		return {
			workflowData: [this.helpers.returnJsonArray(bodyData)],
		};
	}
}
