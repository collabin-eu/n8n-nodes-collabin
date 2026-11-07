import type { INodeProperties } from 'n8n-workflow';

const writes = { show: { resource: ['presence'], operation: ['create', 'preview', 'update'] } };

export const presenceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['presence'] } },
		default: 'getAll',
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a presence rule',
				description: 'Create a rule and notify affected employees',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many presence rules',
				description: 'Get many rules, including past and revoked rules',
			},
			{
				name: 'Preview',
				value: 'preview',
				action: 'Preview a presence rule',
				description: 'See affected employees without saving or notifying anyone',
			},
			{
				name: 'Revoke',
				value: 'revoke',
				action: 'Revoke a presence rule',
				description: 'Revoke a rule using its reviewed revision',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a presence rule',
				description: 'Replace a rule using its reviewed revision and notify affected employees',
			},
		],
	},
];

export const presenceFields: INodeProperties[] = [
	{
		displayName:
			'Presence requires Advanced or Pro; API access must also be enabled. Approvals can be disabled. Writes require a write-permission API key. Preview before saving: operational e-mails cannot be disabled.',
		name: 'presenceNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['presence'] } },
	},
	{
		displayName: 'Rule ID',
		name: 'ruleId',
		type: 'number',
		default: 0,
		required: true,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['presence'], operation: ['update', 'revoke'] } },
		description: 'ID returned by Presence Rule → Get Many',
	},
	{
		displayName: 'Revision',
		name: 'revision',
		type: 'number',
		default: 1,
		required: true,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['presence'], operation: ['update', 'revoke'] } },
		description:
			'Reviewed revision from Get Many. A stale revision returns 409 PRESENCE_CHANGED; fetch and review again before retrying.',
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		required: true,
		displayOptions: writes,
		description: 'Name of the presence requirement (up to 150 characters)',
	},
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'string',
		default: '',
		typeOptions: { rows: 3 },
		displayOptions: writes,
		description: 'Explanation shown to employees (up to 2000 characters)',
	},
	{
		displayName: 'Start Date',
		name: 'startDate',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: writes,
		description: 'First calendar day, inclusive',
	},
	{
		displayName: 'End Date',
		name: 'endDate',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: writes,
		description: 'Last calendar day, inclusive. Maximum range is 366 days.',
	},
	{
		displayName: 'Request Policy',
		name: 'requestPolicy',
		type: 'options',
		default: 'WARN',
		displayOptions: writes,
		options: [
			{ name: 'Warn', value: 'WARN', description: 'Allow requests and show the presence conflict' },
			{
				name: 'Block',
				value: 'BLOCK',
				description: 'Reject new or edited requests for the selected leave types',
			},
		],
		description:
			'Existing requests stay unchanged. Approving an existing conflict requires an explicitly reviewed presence token.',
	},
	{
		displayName: 'Entire Organization',
		name: 'organization',
		type: 'boolean',
		default: false,
		displayOptions: writes,
		description:
			'Whether the rule applies to everyone in the organization, including future members',
	},
	{
		displayName: 'Team IDs',
		name: 'teamIds',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { ...writes.show, organization: [false] } },
		description: 'Comma-separated team IDs, for example 7,8. Use Team → Get Many to find IDs.',
	},
	{
		displayName: 'Leave Type IDs',
		name: 'leaveTypeIds',
		type: 'string',
		default: '',
		required: true,
		displayOptions: writes,
		description:
			'Comma-separated affected leave type IDs, for example 3. Use Leave Type → Get Many to find IDs.',
	},
];
