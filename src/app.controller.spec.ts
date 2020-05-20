import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AsanaService } from './asana.service';
import { GitlabService } from './gitlab.service';
import { StorageService } from './storage.service';

describe('AppController', () => {
	let appController: AppController;

	beforeEach(async () => {
		const app: TestingModule = await Test.createTestingModule({
			controllers: [AppController],
			providers: [AsanaService, GitlabService, StorageService],
		}).compile();

		appController = app.get<AppController>(AppController);
	});

	describe('root', () => {
		it('should return the info string', () => {
			expect(appController.getRoot()).toBe(
				'Asana-GitLab integration: hooks on webhooks/asana and webhooks/gitlab',
			);
		});
	});
});
