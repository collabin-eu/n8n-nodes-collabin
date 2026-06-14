import type { INodeProperties } from 'n8n-workflow';

export const teamOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['team'],
			},
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a team by ID',
				action: 'Get a team',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many teams',
				action: 'Get many teams',
			},
		],
		default: 'getAll',
	},
];

export const teamFields: INodeProperties[] = [
	// ----------------------------------------
	//                team: get
	// ----------------------------------------
	{
		displayName: 'Team ID',
		name: 'teamId',
		type: 'number',
		default: 0,
		required: true,
		displayOptions: {
			show: {
				resource: ['team'],
				operation: ['get'],
			},
		},
		description: 'Numeric ID of the team. The response includes its leaders and members.',
	},

	// ----------------------------------------
	//                team: getAll
	// ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['team'],
				operation: ['getAll'],
			},
		},
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: {
			minValue: 1,
		},
		displayOptions: {
			show: {
				resource: ['team'],
				operation: ['getAll'],
				returnAll: [false],
			},
		},
		description: 'Max number of results to return',
	},
];
