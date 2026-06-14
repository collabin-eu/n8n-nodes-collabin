import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CollabinApi implements ICredentialType {
	name = 'collabinApi';

	displayName = 'Collabin API';

	documentationUrl = 'https://github.com/collabin-eu/n8n-nodes-collabin#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Collabin API key (starts with "clb_"). Generate one under Settings → API Keys. Requires the Pro plan and Admin/Superadmin permissions. The key is shown only once at creation time.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.collabin.eu',
			required: true,
			description: 'The base URL of the Collabin API, without a trailing slash or "/v1" suffix',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(new RegExp("/+$"), "")}}/v1',
			url: '/leave-types',
			method: 'GET',
		},
	};
}
