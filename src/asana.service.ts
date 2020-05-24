import * as _ from 'lodash';
import { Injectable, Dependencies } from '@nestjs/common';
import * as Asana from 'asana';
import * as CryptoJS from 'crypto-js';
import { StorageService } from './storage.service';
import { MyLogger } from './mylogger';
export interface AsanaPostBody {
	events: Asana.resources.Events.EventDataEntity[];
}

export interface GitlabActionData {
	taskId: string;
	note: string;
	progress: string;
}

interface TaskCreatedData {
	gid: string;
	name: string;
	taskId: number;
}

interface LastTask {
	taskId: string;
	gid: string;
}

interface UpdateTaskIdData {
	runningId: number;
	newId: number;
}

@Injectable()
@Dependencies([StorageService, MyLogger])
export class AsanaService {
	private asanaClt: Asana.Client = Asana.Client.create().useAccessToken(
		process.env.ASANA_PATOKEN,
	);
	private project: Asana.resources.Projects.Type = null;
	private lastTask: LastTask = null;

	constructor(
		private readonly storageService: StorageService,
		private readonly logger: MyLogger,
	) {
		logger.setContext('AsanaService');
	}

	// Utiliyy to retrieve the webhooks set up on an Asana project
	async getHooks(): Promise<any> {
		return await this.asanaClt.webhooks.getAll(process.env.ASANA_WORKSPACE_ID, {
			resource: process.env.ASANA_PROJECT_ID,
		});
	}

	// Utility to set up a webhook on Asana project with filter on task creation
	// * Asana will send a handshake that need to be handled and secret saved and returned
	// * Then Asana will approve the request and return the webhook, save the Gid
	async createHook(): Promise<string> {
		const res: Asana.resources.Webhooks.Type = await this.asanaClt.webhooks.create(
			process.env.ASANA_PROJECT_ID,
			`${process.env.BASE_URL}/webhooks/asana`,
			{
				filters: [
					{
						action: 'added',
						resource_type: 'task',
					},
				],
			},
		);

		const gid = res.gid;
		this.storageService.updateWebhook({ webhookID: gid, secret: null });
		return gid;
	}

	// Utility to delete a webhook, ID is save in local JSON
	async deleteHook(): Promise<string> {
		const webhook = this.storageService.getWebhook();
		if (!webhook) {
			throw new Error('No Webhook saved');
		}
		await this.asanaClt.webhooks.deleteById(webhook.webhookID);
		this.storageService.deleteWebhook();

		return webhook.webhookID;
	}

	// FUll-text search of tasks in a project
	async searchTask(
		text: string,
	): Promise<Asana.resources.ResourceList<Asana.resources.Tasks.Type>> {
		const params: Asana.resources.Params = {
			text,
			['projects.all']: process.env.ASANA_PROJECT_ID,
		} as Asana.resources.Params;

		return this.asanaClt.tasks.searchInWorkspace(
			process.env.ASANA_WORKSPACE_ID,
			params,
		);
	}

	//TEST ------------------------
	async addToTaskTitle(gid: string, taskId: string) {
		const task = await this.asanaClt.tasks.findById(gid);
		const updatedName = `${taskId} ${task.name}`;

		await this.asanaClt.tasks.update(gid, {
			name: updatedName,
		});
	}

	async changeTaskProgress(gid: string, progress: string) {
		const task: Asana.resources.Tasks.Type = await this.asanaClt.tasks.findById(
			gid,
		);
		const { custom_fields: customFields } = task;

		// Update progress
		const {
			enum_value: { name: crtProgress },
		} = this.getProgressField(customFields);
		if (crtProgress !== progress) {
			this.logger.debug(`Update task Progress to '${progress}'`);
			await this.setProgress(task, progress);
		}
	}

	async addNoteToTask(gid: string, note: string) {
		await this.asanaClt.tasks.addComment(gid, {
			html_text: note,
		});
	}
	//TEST ------------------------

	// Verify validity of a webhook post by checking signature against hashing body with secret
	async verifyPost(signature: string, body: AsanaPostBody): Promise<boolean> {
		let ok = false;

		// No signature => unathorized
		if (signature) {
			const secret = this.storageService.getWebhookSecret();
			// We don't have the secret... allow
			if (!secret) {
				ok = true;
				this.logger.warn(`Verify ${ok}: no secret found`);
			} else {
				// Check signature is correct
				const encryptedRequestBody = CryptoJS.HmacSHA256(
					JSON.stringify(body),
					secret,
				).toString();
				ok = signature === encryptedRequestBody;

				if (!ok) {
					this.logger.warn(
						`Verify ${ok}: ${signature} - ${encryptedRequestBody}`,
					);
				}
			}
		} else {
			this.logger.warn(`Verify ${ok}: no signature in POST`);
		}

		return ok;
	}

	// Asana handshake handler - webhook creation time
	handleHandshake(secret: string) {
		this.logger.debug('Webhook handshake...');
		this.storageService.saveWebhook({ webhookID: null, secret });
	}

	// Asana Webhook handler
	async handleHooks(body: AsanaPostBody) {
		if (!body || !body.events || body.events.length === 0) {
			return;
		}

		// Retrieve every time, to make sure note is updated
		this.project = await this.asanaClt.projects.findById(
			process.env.ASANA_PROJECT_ID,
		);

		const runningId = this.getRunningTaskId();
		let newId = runningId;

		const newTaskGids = {};
		_.forEach(body.events, (event) => {
			const { action, resource, parent } = event;
			if (resource && parent) {
				const { gid, resource_type: resourceType } = resource;
				const { resource_type: parentResourceType } = parent;

				// Task added to project
				if (
					action === 'added' &&
					resourceType === 'task' &&
					parentResourceType === 'project'
				) {
					newTaskGids[gid] = gid;
				}
			}
		});

		// Update task titles asynchronously
		for (const newGid in newTaskGids) {
			try {
				const task: Asana.resources.Tasks.Type = await this.asanaClt.tasks.findById(
					newGid,
				);
				newId = this.handleTaskCreated({
					gid: task.gid,
					name: task.name,
					taskId: ++newId,
				});
			} catch (err) {
				this.logger.warn('Webhook with wrong gid');
			}
		}

		// Replace new running TaskId in project
		await this.setRunningTaskId({ runningId, newId });
	}

	// Handler for when Asana task is created
	private handleTaskCreated({ gid, name, taskId }: TaskCreatedData): number {
		this.logger.debug(`Task Created hook: ${name}`);

		// Already has taskId...
		if (this.findTaskId({ str: name, atStart: true })) {
			return taskId - 1;
		}

		// const users = process.env.ASANA_ACTIVE_USERS.split(', ');
		// const followerNames = _.map(followers, 'name');
		// const activeFollowers = _.intersection(users, followerNames);

		const taskIdPrefix = `[${process.env.ASANA_PROJECT_PREFIX}-${taskId}]`;
		const updatedName = `${taskIdPrefix} ${name}`;

		this.logger.debug(`Adding taskId: ${taskIdPrefix}`);

		// Call it asynchronously
		this.asanaClt.tasks.update(gid, {
			name: updatedName,
		});

		return taskId;
	}

	// Handler for Asana request on GitLab webhook
	async handleGitlabAction({ taskId, note, progress }: GitlabActionData) {
		const taskGids: string[] = [];

		// Don't search if this is for same task as the one before
		if (this.lastTask && this.lastTask.taskId === taskId) {
			taskGids.push(this.lastTask.gid);
		} else {
			// Make a full search of tasks in the project
			const tasks = (await this.searchTask(taskId)).data;
			_.forEach(tasks, (searchedTask) => {
				// Make sure its name stats with the Id
				if (this.hasTaskId(taskId, searchedTask.name)) {
					taskGids.push(searchedTask.gid);
				}
			});
			if (taskGids.length === 1) {
				this.lastTask = { taskId, gid: taskGids[0] };
			}
		}

		for (const taskGid of taskGids) {
			const task = await this.asanaClt.tasks.findById(taskGid);
			const { gid, custom_fields: customFields } = task;

			// Update progress
			const {
				enum_value: { name: crtProgress },
			} = this.getProgressField(customFields);

			if (crtProgress !== progress) {
				this.logger.debug(`Update task Progress to '${progress}'`);
				await this.setProgress(task, progress);
			}
			// Add note (asynchronously)
			this.logger.debug(`Add note to task ${taskId}`);
			this.asanaClt.tasks.addComment(gid, {
				html_text: note,
			});
		}
	}

	// Extract the task Id from the task title (if any)
	findTaskId({
		str,
		atStart,
	}: {
		str: string;
		atStart: boolean;
	}): RegExpMatchArray {
		const regex = atStart ? /^\[(.+?\-(\d+))\]/ : /\[(.+?\-(\d+))\]/;
		const match = str.match(regex);

		return match;
	}

	// Helper to check that a task has a task Id (title start with task Id)
	private hasTaskId(taskId: string, taskName: string): boolean {
		const match = this.findTaskId({ str: taskName, atStart: true });
		if (match && taskId === match[0]) {
			return true;
		}
		return false;
	}

	// Retrieve the current task Id counter from the project note
	private getRunningTaskId() {
		const regex = /\[currentTaskId:.*?(\d+?)\]/;
		const match = this.project.notes.match(regex);
		if (match) {
			return parseInt(match[1], 10);
		}

		return 0;
	}

	// Update the current task Id counter into the project note
	private async setRunningTaskId({ runningId, newId }: UpdateTaskIdData) {
		const current = `[currentTaskId: ${runningId}]`;
		const updated = `[currentTaskId: ${newId}]`;
		let newNote: string;
		if (runningId) {
			newNote = this.project.notes.replace(current, updated);
		} else {
			newNote = this.project.notes + ' ' + updated;
		}

		await this.asanaClt.projects.update(process.env.ASANA_PROJECT_ID, {
			notes: newNote,
		});
	}

	//Update the Progress custom field value of the task
	private async setProgress(
		task: Asana.resources.Tasks.Type,
		progress: string,
	) {
		const { gid, name, custom_fields: customFields } = task;
		const customField: Asana.resources.CustomField = this.getProgressField(
			customFields,
		);
		const customFieldOption: Asana.resources.EnumValue = this.getProgressFieldOption(
			customField,
			progress,
		);

		await this.asanaClt.tasks.update(gid, {
			name,
			custom_fields: {
				[customField.gid]: customFieldOption.gid,
			},
		});
	}

	// Helper to retrieve the Progress field from Asana reply
	private getProgressField = (customFields) => {
		return _.find(customFields, { name: process.env.ASANA_CUSTOM_FIELD_NAME });
	};

	// Helper to retrieve one specific enum option of Progress field
	private getProgressFieldOption = (
		field: Asana.resources.CustomField,
		name: string,
	) => {
		const { enum_options: enumOptions } = field;
		return _.find(enumOptions, { name });
	};
}
