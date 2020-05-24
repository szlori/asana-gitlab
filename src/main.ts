import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
//import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { MyLogger } from './mylogger';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	const logger = await app.resolve(MyLogger);
	logger.setContext('bootstrap');

	const port = process.env.PORT || 8080;
	await app.listen(port);

	logger.log(`Application listening on port ${port}`);
}

bootstrap();
