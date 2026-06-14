import type { INodeProperties } from 'n8n-workflow';

export const calendarOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['calendar'],
			},
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get the workday calendar for a date range',
				action: 'Get the workday calendar',
			},
		],
		default: 'get',
	},
];

export const calendarFields: INodeProperties[] = [
	// ----------------------------------------
	//              calendar: get
	// ----------------------------------------
	{
		displayName: 'Start Date',
		name: 'startDate',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['calendar'],
				operation: ['get'],
			},
		},
		description: 'First day of the range (inclusive)',
	},
	{
		displayName: 'End Date',
		name: 'endDate',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['calendar'],
				operation: ['get'],
			},
		},
		description: 'Last day of the range (inclusive). The range may span at most 366 days.',
	},
];
