import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class CollabinWebhookApi implements ICredentialType {
	name = 'collabinWebhookApi';

	displayName = 'Collabin Webhook API';

	documentationUrl =
		'https://github.com/collabin-eu/n8n-nodes-collabin#upgrading-existing-triggers';

	properties: INodeProperties[] = [
		{
			displayName: 'Signing Secret',
			name: 'signingSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'The whsec_ signing secret shown when a webhook is created in Collabin. Stored encrypted by n8n and used only to verify incoming events.',
		},
	];
}
