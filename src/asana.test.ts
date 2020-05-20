import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, Logger } from '@nestjs/common';
import * as _ from 'lodash';
import * as Asana from 'asana';
import { program, CommanderError } from 'commander';
import { AppModule } from './app.module';
import { AsanaService } from './asana.service';

const logger = new Logger('AsanaTest');
const gid = '1173386343216480';

async function searchAsanaTask(asanaService: AsanaService, text: string) {
	try {
		logger.log(`Searching task with '${text}'...`);
		const tasks: Asana.resources.Tasks.Type[] = (
			await asanaService.searchTask(text)
		).data;

		_.forEach(tasks, (task) => {
			logger.log(`${task.gid}: ${task.name}`);
		});
	} catch (reason) {
		logger.error(`${reason}`);
	}
}

async function addToAsanaTaskTitle(asanaService: AsanaService, taskId: string) {
	try {
		logger.log(`Adding '${taskId}' to task '${gid}'...`);
		await asanaService.addToTaskTitle(gid, taskId);
		logger.log('Done, check Asana');
	} catch (reason) {
		logger.error(`${reason}`);
	}
}

async function changeAsanaTaskProgress(
	asanaService: AsanaService,
	progr: string,
) {
	try {
		logger.log(`Changing '${gid}' task's progress to '${progr}'...`);
		await asanaService.changeTaskProgress(gid, progr);

		logger.log('Done, check Asana');
	} catch (reason) {
		logger.error(`${reason}`);
	}
}

async function addAsanaTaskNote(asanaService: AsanaService) {
	try {
		logger.log('Adding HTML note...');
		const name = 'Lori';
		const aUtl = '1169570228258098';
		const url =
			'https://gitlab.com/lorant.szakacs/asana-integ-test/-/merge_requests/2';
		const iidUrl = '#2'.link(url);
		const projNameUrl = 'Asana Integ Test'.link(
			'https://gitlab.com/lorant.szakacs/asana-integ-test',
		);

		let note = `<body><strong>GitLab MR ${iidUrl} ⚔ Opened </strong> by <em>${name}</em>: ${projNameUrl} (develop ➡️ master)<ul><li>Test title message text</li>`;
		note += '<li> Assignee: ';
		note += 'zzz'.link(`https://app.asana.com/0/${aUtl}/list`);
		note += '</li></ul></body>';

		await asanaService.addNoteToTask(gid, note);
		logger.log('Done, check Asana');
	} catch (reason) {
		logger.error(`${reason}`);
	}
}

async function bootstrap() {
	let appContext: INestApplicationContext;
	try {
		appContext = await NestFactory.createApplicationContext(AppModule);
		const asanaService = appContext.get(AsanaService);

		program.exitOverride();
		program.usage('[Option: only one of below]');
		program
			.option('-s, --search <text>', 'Search a task by text')
			.option('-t, --title <taskId>', 'Add a taskID to title')
			.option('-p, --progress <progr>', "Change a task's Progress")
			.option('-n, --note', 'Add a Note to task');
		program.parse(process.argv);

		logger.log('---');
		if (program.search) {
			await searchAsanaTask(asanaService, program.search);
		} else if (program.title) {
			await addToAsanaTaskTitle(asanaService, program.title);
		} else if (program.progress) {
			await changeAsanaTaskProgress(asanaService, program.progress);
		} else if (program.note) {
			await addAsanaTaskNote(asanaService);
		}

		logger.log('---');
	} catch (err) {
		if (err instanceof CommanderError) {
		} else {
			logger.error(`${err}`);
		}
	} finally {
		appContext && (await appContext.close());
	}
}

bootstrap();
