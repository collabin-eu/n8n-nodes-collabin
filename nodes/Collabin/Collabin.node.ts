import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { calendarFields, calendarOperations } from './descriptions/CalendarDescription';
import { leaveFields, leaveOperations } from './descriptions/LeaveDescription';
import { leaveTypeFields, leaveTypeOperations } from './descriptions/LeaveTypeDescription';
import { teamFields, teamOperations } from './descriptions/TeamDescription';
import { userFields, userOperations } from './descriptions/UserDescription';
import { collabinApiRequest, collabinApiRequestAllItems, toDateOnly } from './GenericFunctions';

export class Collabin implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Collabin',
		name: 'collabin',
		icon: 'file:collabin.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Read and manage leave requests, users, teams and the workday calendar in Collabin',
		defaults: {
			name: 'Collabin',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'collabinApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Calendar', value: 'calendar' },
					{ name: 'Leave', value: 'leave' },
					{ name: 'Leave Type', value: 'leaveType' },
					{ name: 'Team', value: 'team' },
					{ name: 'User', value: 'user' },
				],
				default: 'leave',
			},

			...userOperations,
			...userFields,

			...teamOperations,
			...teamFields,

			...leaveTypeOperations,
			...leaveTypeFields,

			...leaveOperations,
			...leaveFields,

			...calendarOperations,
			...calendarFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject | IDataObject[] = {};

				if (resource === 'user') {
					if (operation === 'get') {
						const userId = this.getNodeParameter('userId', i) as number;
						responseData = await collabinApiRequest.call(this, 'GET', `/users/${userId}`);
					} else if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

						if (returnAll) {
							responseData = await collabinApiRequestAllItems.call(this, '/users', filters);
						} else {
							const limit = this.getNodeParameter('limit', i) as number;
							const response = await collabinApiRequest.call(
								this,
								'GET',
								'/users',
								{},
								{ ...filters, limit },
							);
							responseData = response.data as IDataObject[];
						}
					} else if (operation === 'getLeaves') {
						const userId = this.getNodeParameter('userId', i) as number;
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

						if (returnAll) {
							responseData = await collabinApiRequestAllItems.call(
								this,
								`/users/${userId}/leaves`,
								filters,
							);
						} else {
							const limit = this.getNodeParameter('limit', i) as number;
							const response = await collabinApiRequest.call(
								this,
								'GET',
								`/users/${userId}/leaves`,
								{},
								{ ...filters, limit },
							);
							responseData = response.data as IDataObject[];
						}
					} else {
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation "${operation}" for resource "user"`,
							{
								itemIndex: i,
							},
						);
					}
				} else if (resource === 'team') {
					if (operation === 'get') {
						const teamId = this.getNodeParameter('teamId', i) as number;
						responseData = await collabinApiRequest.call(this, 'GET', `/teams/${teamId}`);
					} else if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;

						if (returnAll) {
							responseData = await collabinApiRequestAllItems.call(this, '/teams');
						} else {
							const limit = this.getNodeParameter('limit', i) as number;
							const response = await collabinApiRequest.call(this, 'GET', '/teams', {}, { limit });
							responseData = response.data as IDataObject[];
						}
					} else {
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation "${operation}" for resource "team"`,
							{
								itemIndex: i,
							},
						);
					}
				} else if (resource === 'leaveType') {
					if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;

						if (returnAll) {
							responseData = await collabinApiRequestAllItems.call(this, '/leave-types');
						} else {
							const limit = this.getNodeParameter('limit', i) as number;
							const response = await collabinApiRequest.call(
								this,
								'GET',
								'/leave-types',
								{},
								{ limit },
							);
							responseData = response.data as IDataObject[];
						}
					} else {
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation "${operation}" for resource "leaveType"`,
							{ itemIndex: i },
						);
					}
				} else if (resource === 'leave') {
					if (operation === 'get') {
						const leaveId = this.getNodeParameter('leaveId', i) as number;
						responseData = await collabinApiRequest.call(this, 'GET', `/leaves/${leaveId}`);
					} else if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
						const qs: IDataObject = { ...filters };

						if (typeof qs.start === 'string' && qs.start) {
							qs.start = toDateOnly(qs.start);
						}
						if (typeof qs.end === 'string' && qs.end) {
							qs.end = toDateOnly(qs.end);
						}

						if (returnAll) {
							responseData = await collabinApiRequestAllItems.call(this, '/leaves', qs);
						} else {
							const limit = this.getNodeParameter('limit', i) as number;
							const response = await collabinApiRequest.call(
								this,
								'GET',
								'/leaves',
								{},
								{ ...qs, limit },
							);
							responseData = response.data as IDataObject[];
						}
					} else if (operation === 'create') {
						const userId = this.getNodeParameter('userId', i) as number;
						const leaveTypeId = this.getNodeParameter('leaveTypeId', i) as number;
						const startDate = this.getNodeParameter('startDate', i) as string;
						const endDate = this.getNodeParameter('endDate', i) as string;
						const additionalFields = this.getNodeParameter(
							'additionalFields',
							i,
							{},
						) as IDataObject;

						const body: IDataObject = {
							user_id: userId,
							leave_type_id: leaveTypeId,
							start_date: startDate,
							end_date: endDate,
							is_half_day: additionalFields.isHalfDay ?? false,
						};

						if (additionalFields.reason) {
							body.reason = additionalFields.reason;
						}

						responseData = await collabinApiRequest.call(this, 'POST', '/leaves', body);
					} else if (operation === 'updateStatus') {
						const leaveId = this.getNodeParameter('leaveId', i) as number;
						const status = this.getNodeParameter('status', i) as string;
						const rejectionReason = this.getNodeParameter('rejectionReason', i, '') as string;

						const body: IDataObject = { status };
						if (status === 'REJECTED') {
							body.rejection_reason = rejectionReason;
						}

						responseData = await collabinApiRequest.call(
							this,
							'PUT',
							`/leaves/${leaveId}/status`,
							body,
						);
					} else {
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation "${operation}" for resource "leave"`,
							{
								itemIndex: i,
							},
						);
					}
				} else if (resource === 'calendar') {
					if (operation === 'get') {
						const startDate = this.getNodeParameter('startDate', i) as string;
						const endDate = this.getNodeParameter('endDate', i) as string;

						const response = await collabinApiRequest.call(
							this,
							'GET',
							'/calendar',
							{},
							{ start: toDateOnly(startDate), end: toDateOnly(endDate) },
						);
						responseData = response.data as IDataObject[];
					} else {
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation "${operation}" for resource "calendar"`,
							{ itemIndex: i },
						);
					}
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource "${resource}"`, {
						itemIndex: i,
					});
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
