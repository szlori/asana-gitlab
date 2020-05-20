import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, Logger } from '@nestjs/common';
import * as _ from 'lodash';
import { program } from 'commander';
import { AsanaService } from './asana.service';
import { AppModule } from './app.module';

const logger = new Logger('AsanaTools');

async function createAsanaHook(asanaService: AsanaService) {
	try {
		logger.log('Creating hook...');
		const webhookID = await asanaService.createHook();
		logger.log(`Asana Webhook created: ID ${webhookID}`);
	} catch (reason) {
		logger.error(`${reason}`);
	}
}

async function showAsanaHooks(asanaService: AsanaService) {
	try {
		logger.log('Getting hooks...');
		const hooks = await asanaService.getHooks();

		logger.log('--- Hooks ---');
		_.forEach(hooks.data, ({ gid, active, resource, target }) => {
			const { name } = resource;
			logger.log(`gid    : ${gid}`);
			logger.log(`active : ${active}`);
			logger.log(`resrce : ${name}`);
			logger.log(`target : ${target}`);
			logger.log('---');
		});
	} catch (reason) {
		logger.error(`${reason}`);
	}
}

async function deleteAsanaHook(asanaService: AsanaService) {
	try {
		logger.log('Deleting hook...');
		const webhookID = await asanaService.deleteHook();
		logger.log(`Asana Webhook with ID ${webhookID} deleted`);
	} catch (reason) {
		logger.error(`${reason}`);
	}
}

async function bootstrap() {
	let appContext: INestApplicationContext;
	try {
		appContext = await NestFactory.createApplicationContext(AppModule);
		const asanaService: AsanaService = appContext.get(AsanaService);

		program.exitOverride();
		program.usage('[Option: only one of below]');
		program
			.option('-c, --create', '[default] Create Asana hook')
			.option('-s, --show', 'Show installed Asana hooks')
			.option('-d, --delete', 'Delete installed Asana hook');
		program.parse(process.argv);

		if (program.show) {
			await showAsanaHooks(asanaService);
		} else if (program.delete) {
			await deleteAsanaHook(asanaService);
		} else {
			// create
			await createAsanaHook(asanaService);
		}
	} catch (err) {
		console.error(`${err}`);
	} finally {
		appContext && (await appContext.close());
	}
}

bootstrap();
