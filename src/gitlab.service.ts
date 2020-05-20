import * as _ from 'lodash';
import { Injectable, Dependencies } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { AsanaService } from './asana.service';
import { ProjectsBundle } from '@gitbeaker/node';
import { StorageService, GitlabUser } from './storage.service';

const excludedRefs = _.map(
	[process.env.PRODUCTION_BRANCH_NAME, process.env.STAGING_BRANCH_NAME],
	(name) => `refs/heads/${name}`,
);

@Injectable()
@Dependencies([AsanaService, StorageService])
export class GitlabService {
	private logger = new Logger('GitlabService');
	private gitlabClt = new ProjectsBundle({
		token: process.env.GITLAB_PATOKEN,
	});

	constructor(
		private readonly asanaService: AsanaService,
		private readonly storageService: StorageService,
	) {}

	// Verify validity of a webhook post by checking secret
	verifyPost(secretFromPost: string): boolean {
		return secretFromPost === process.env.GITLAB_WEBHOOK_SECRET;
	}

	// Handler for GitLab webhooks
	async handleHooks(type: string, data): Promise<void> {
		switch (type) {
			case 'Push Hook':
				await this.handlePush(data);
				break;
			case 'Merge Request Hook':
				await this.handleMergeRequest(data);
				break;
			default:
				this.logger.warn('Unhandled event');
		}
	}

	// Handler for Push event hook
	private async handlePush(data) {
		const {
			ref,
			user_id: uId,
			user_name: uName,
			project: { name: projName, web_url: webUrl },
			commits,
			total_commits_count: totCommitCnt,
		} = data;

		// Dont handle direct commits / merges to some branches (ex. production)
		if (_.includes(excludedRefs, ref)) {
			this.logger.warn('Push hook ignored');
			return;
		}

		this.logger.debug(`Push hook, commits: ${totCommitCnt}`);

		// Name from map
		const gUser: GitlabUser = this.storageService.gitlabUserMap.get(uId);
		const userName = gUser ? gUser.name : uName;

		// Branch
		const branch = ref.slice(ref.lastIndexOf('/') + 1);
		const branchUrl = webUrl + '/-/commits/' + branch;

		const taskCommitDict = {};
		_.forEach(commits, (commit) => {
			const match = this.asanaService.findTaskId({
				str: commit.message,
				atStart: false,
			});
			if (match) {
				if (match[0] in taskCommitDict) {
					taskCommitDict[match[0]].push(commit);
				} else {
					taskCommitDict[match[0]] = [commit];
				}
			}
		});

		// Commits without Asana task Id
		if (_.isEmpty(taskCommitDict)) {
			this.logger.warn('No task Ids found');
			return;
		}

		let asanaNote = `<body><strong>GitLab Push ⚙</strong> by <em>${userName}</em>: ➡️ ${projName.link(
			webUrl,
		)} branch ${branch.link(branchUrl)}`;

		// Update Asana tasks asynchronously
		// GitLab wants us to reply fast
		for (const taskId in taskCommitDict) {
			asanaNote = this.buildCommitsNote(
				asanaNote,
				uName,
				taskCommitDict[taskId],
			);

			this.asanaService.handleGitlabAction({
				taskId,
				note: asanaNote,
				progress: 'In Progress',
			});
		}
	}

	// Handler for Merge Request event hook
	private async handleMergeRequest(data) {
		const {
			user: { name },
			project: { id: projId, name: projName, web_url: webUrl },
			object_attributes: {
				author_id: aId,
				iid,
				merge_commit_sha: mergeCommitId,
				source_branch: source,
				target_branch: target,
				description,
				title,
				url,
				state,
				action,
				work_in_progress: wip,
				assignee_ids: assigneeIds,
			},
			assignees,
		} = data;

		this.logger.debug(`MR hook: ${action} - ${iid}`);
		let asanaNote = '';
		let progress = '';
		let update = false;

		// Name from map
		const gUser: GitlabUser = this.storageService.gitlabUserMap.get(aId);
		const userName = gUser ? gUser.name : name;
		const msg = title ? title : description;

		const iidUrl = ('!' + iid).link(url);

		if ((action === 'open' || action === 'reopen') && !wip) {
			update = true;
			asanaNote = `<body><strong>GitLab MR ${iidUrl} ⚔ Opened</strong>`;
			progress = 'Testing';
		} else if (action === 'update' && state === 'opened' && !wip) {
			// MR updated to not be WIP
			const {
				changes: { title: changeTitle },
			} = data;
			if (changeTitle) {
				update = true;
				asanaNote = `<body><strong>GitLab MR ${iidUrl} ⚔ Opened</strong>`;
				progress = 'Testing';
			}
		} else if (action === 'merge' && state === 'merged') {
			update = true;
			asanaNote = `<body><strong>GitLab MR ${iidUrl} 🏆 Merged</strong>`;
			progress = 'Deploying';
		} else if (action === 'close' && !wip) {
			update = true;
			asanaNote = `<body><strong>GitLab MR ${iidUrl} ⚰ Closed</strong>`;
			progress = 'In Progress';
		}

		if (update) {
			asanaNote += ` by <em>${userName}</em>: ${projName.link(
				webUrl,
			)} (${source} ➡️ ${target})`;

			const commits = await this.gitlabClt.MergeRequests.commits(projId, iid);

			let listNote = '';
			if (msg) {
				listNote += `<li>${msg}</li>`;
			}
			if (action === 'open' || action === 'update') {
				listNote = this.buildAssigneesNote(listNote, {
					assigneeIds,
					assignees,
				});
			} else if (action === 'merge') {
				listNote = await this.buildMergeCommitFromMRNote(
					listNote,
					projId,
					mergeCommitId,
				);
			}

			if (listNote) {
				asanaNote += `<ul>${listNote}</ul>`;
			}
			asanaNote += '</body>';

			// Update Asana tasks asynchronously
			// GitLab wants us to reply fast
			const matches = this.getTaskIdsFromMR(commits);

			for (const match of matches) {
				this.asanaService.handleGitlabAction({
					taskId: match[0],
					note: asanaNote,
					progress,
				});
			}
		}
	}

	// Helper to build part of the note listing the commits
	private buildCommitsNote = (
		note: string,
		pushName: string,
		commits,
	): string => {
		if (!commits || commits.length === 0) {
			note += '</body>';
		} else {
			note += '<ul>';
			_.forEach(commits, (commit) => {
				const {
					id,
					title,
					url,
					author: { name },
				} = commit;

				const commitUrl = id.slice(0, 8).link(url);
				const commitBy = name !== pushName ? ` by <em>${name}</em>` : '';
				note += `<li>Commit ${commitUrl}${commitBy}: ${title}</li>`;
			});
			note += '</ul></body>';
		}
		return note;
	};

	// Helper to build part of the note about the merge commit
	private buildMergeCommitFromMRNote = async (
		note: string,
		projId: number,
		commitId: string,
	): Promise<string> => {
		const { id, title, web_url: url } = await this.gitlabClt.Commits.show(
			projId,
			commitId,
		);

		const commitUrl = id.slice(0, 8).link(url);
		note += `<li>Commit ${commitUrl}: ${title}</li>`;
		return note;
	};

	// Helper to build part of the note with assignees of MR
	private buildAssigneesNote = (
		note: string,
		{ assigneeIds, assignees }: { assigneeIds: number[]; assignees: any[] },
	): string => {
		let assigneeName = '';

		if (assigneeIds) {
			note += assigneeIds.length === 1 ? '<li>Assignee: ' : '<li>Assignees: ';

			_.forEach(assigneeIds, (asg, idx) => {
				if (idx > 0) {
					note += ', ';
				}

				const gUser = this.storageService.gitlabUserMap.get(asg);
				assigneeName = gUser
					? ('@' + gUser.name).link(
							`https://app.asana.com/0/${gUser.aUtl}/list`,
					  )
					: assignees[idx].name;
				note += assigneeName;
			});

			note += '</li>';
		} else {
			note += '<li>Unassigned!</li>';
		}
		return note;
	};

	// Helper to retrieve Asana task Ids from commit messages of an MR
	private getTaskIdsFromMR = (commits): RegExpMatchArray[] => {
		return _.compact(
			_.uniq(
				_.map(commits, ({ title }) =>
					this.asanaService.findTaskId({ str: title, atStart: false }),
				),
			),
		);
	};
}
