import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AsanaService } from './asana.service';
import { GitlabService } from './gitlab.service';
import { StorageService } from './storage.service';
import { MyLogger } from './mylogger';

@Module({
	imports: [],
	controllers: [AppController],
	providers: [AsanaService, GitlabService, StorageService, MyLogger],
})
export class AppModule {}
