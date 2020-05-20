import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AsanaService } from './asana.service';
import { GitlabService } from './gitlab.service';
import { StorageService } from './storage.service';

@Module({
	imports: [],
	controllers: [AppController],
	providers: [AsanaService, GitlabService, StorageService],
})
export class AppModule {}
