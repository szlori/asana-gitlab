import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import jsonfile = require('jsonfile');

export interface StoredWebhook {
	webhookID: string;
	secret: string;
}

export interface StoredUser {
	email: string;
	name: string;
	aId: string; // Asana gid
	gId: number; // Gitlab id
	aUtl: string; // Asana user task list id (needed for @mention)
}

export interface AsanaUser {
	name: string;
	gId: number; // Gitlab id
	aUtl: string; // Asana user task list id (needed for @mention)
}

export interface GitlabUser {
	name: string;
	aId: string; // Asana gid
	aUtl: string; // Asana user task list id (needed for @mention)
}

@Injectable()
export class StorageService {
	private logger = new Logger('StorageService');
	private secret = '';

	asanaUserMap: Map<string, AsanaUser> = new Map();
	gitlabUserMap: Map<number, GitlabUser> = new Map();

	constructor() {
		this.createUserMaps();
	}

	// Retrieve webhook info stored in local JSON
	getWebhook(): StoredWebhook {
		let res: StoredWebhook = null;
		try {
			res = jsonfile.readFileSync(process.env.STORAGE_WEBHOOK);
		} catch (err) {
			if (err.code !== 'ENOENT') {
				this.logger.error(`${err}`);
			}
		} finally {
			return res;
		}
	}

	// Retrieve webhook secret stored in local JSON (cached in memory)
	getWebhookSecret(): string {
		if (!this.secret) {
			const webhook = this.getWebhook();
			if (webhook) {
				this.secret = webhook.secret;
			}
		}
		return this.secret;
	}

	// Delete the webhook info stored in local JSON
	deleteWebhook() {
		this.saveWebhook(null);
	}

	// Save webhook info in local JSON
	saveWebhook(webhook: StoredWebhook) {
		try {
			jsonfile.writeFileSync(process.env.STORAGE_WEBHOOK, webhook, {
				spaces: '\t ',
			});

			if (webhook.secret) {
				this.secret = webhook.secret;
			}
		} catch (err) {
			this.logger.error(`${err}`);
		}
	}

	// Updates the info for the stored webhook
	// * specify only the field to update and leave the others null
	updateWebhook(webhook: StoredWebhook) {
		const oldWebhook = this.getWebhook();
		if (oldWebhook) {
			webhook.secret = webhook.secret || oldWebhook.secret;
			webhook.webhookID = webhook.webhookID || oldWebhook.webhookID;
		}
		this.saveWebhook(webhook);
	}

	// Creates the user maps for GitLab-Asana ids from local JSON
	createUserMaps() {
		try {
			const users: StoredUser[] = jsonfile.readFileSync(
				process.env.STORAGE_USERMAP,
			);

			for (const user of users) {
				const { name, aId, gId, aUtl } = user;

				this.asanaUserMap.set(aId, { name, gId, aUtl });
				this.gitlabUserMap.set(gId, { name, aId, aUtl });
			}
		} catch (err) {
			this.logger.error(`${err}`);
		}
	}
}
