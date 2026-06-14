import type { INodeProperties } from 'n8n-workflow';

export const leaveOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['leave'],
			},
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a leave request by ID',
				action: 'Get a leave',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many leave requests',
				action: 'Get many leaves',
			},
			{
				name: 'Create',
				value: 'create',
				description:
					'Create a new leave request (status PENDING). Requires a write-permission API key.',
				action: 'Create a leave',
			},
			{
				name: 'Update Status',
				value: 'updateStatus',
				description:
					'Approve or reject a pending leave request. Requires a write-permission API key.',
				action: 'Update a leave status',
			},
		],
		default: 'getAll',
	},
];

export const leaveFields: INodeProperties[] = [
	// ----------------------------------------
	//          leave: get / updateStatus
	// ----------------------------------------
	{
		displayName: 'Leave ID',
		name: 'leaveId',
		type: 'number',
		default: 0,
		required: true,
		displayOptions: {
			show: {
				resource: ['leave'],
				operation: ['get', 'updateStatus'],
			},
		},
		description: 'Numeric ID of the leave request',
	},

	// ----------------------------------------
	//                leave: getAll
	// ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['leave'],
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
				resource: ['leave'],
				operation: ['getAll'],
				returnAll: [false],
			},
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: {
			show: {
				resource: ['leave'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'End Date',
				name: 'end',
				type: 'dateTime',
				default: '',
				description: 'Only return leave requests overlapping until this date (inclusive)',
			},
			{
				displayName: 'Start Date',
				name: 'start',
				type: 'dateTime',
				default: '',
				description: 'Only return leave requests overlapping from this date (inclusive)',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'PENDING',
				options: [
					{ name: 'Pending', value: 'PENDING' },
					{ name: 'Approved', value: 'APPROVED' },
					{ name: 'Rejected', value: 'REJECTED' },
				],
				description: 'Only return leave requests with this status',
			},
			{
				displayName: 'Updated Since',
				name: 'updated_since',
				type: 'dateTime',
				default: '',
				description:
					'Only return leave requests updated after this timestamp. Useful for incremental sync.',
			},
			{
				displayName: 'User ID',
				name: 'user_id',
				type: 'number',
				default: 0,
				description: 'Only return leave requests for this user',
			},
		],
	},

	// ----------------------------------------
	//                leave: create
	// ----------------------------------------
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'number',
		default: 0,
		required: true,
		displayOptions: {
			show: {
				resource: ['leave'],
				operation: ['create'],
			},
		},
		description: 'ID of the employee the leave request is for',
	},
	{
		displayName: 'Leave Type ID',
		name: 'leaveTypeId',
		type: 'number',
		default: 0,
		required: true,
		displayOptions: {
			show: {
				resource: ['leave'],
				operation: ['create'],
			},
		},
		description: 'ID of the leave type (see Leave Type → Get Many)',
	},
	{
		displayName: 'Start Date',
		name: 'startDate',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['leave'],
				operation: ['create'],
			},
		},
		description: 'First day of the leave request',
	},
	{
		displayName: 'End Date',
		name: 'endDate',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['leave'],
				operation: ['create'],
			},
		},
		description: 'Last day of the leave request',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['leave'],
				operation: ['create'],
			},
		},
		options: [
			{
				displayName: 'Half Day',
				name: 'isHalfDay',
				type: 'boolean',
				default: false,
				description: 'Whether this is a half-day (AM/PM) request',
			},
			{
				displayName: 'Reason',
				name: 'reason',
				type: 'string',
				default: '',
				description: 'Optional note explaining the leave request',
			},
		],
	},

	// ----------------------------------------
	//            leave: updateStatus
	// ----------------------------------------
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		default: 'APPROVED',
		required: true,
		displayOptions: {
			show: {
				resource: ['leave'],
				operation: ['updateStatus'],
			},
		},
		options: [
			{ name: 'Approved', value: 'APPROVED' },
			{ name: 'Rejected', value: 'REJECTED' },
		],
		description:
			'The new status for the leave request. Only PENDING leave requests can be updated.',
	},
	{
		displayName: 'Rejection Reason',
		name: 'rejectionReason',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['leave'],
				operation: ['updateStatus'],
				status: ['REJECTED'],
			},
		},
		description: 'Reason shown to the employee when rejecting the leave request',
	},
];
