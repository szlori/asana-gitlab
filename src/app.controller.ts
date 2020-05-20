import {
	Controller,
	Get,
	Post,
	Headers,
	Res,
	HttpStatus,
	Body,
	UnauthorizedException,
	InternalServerErrorException,
} from '@nestjs/common';
import { AsanaService, AsanaPostBody } from './asana.service';
import { GitlabService } from './gitlab.service';
import { Request, Response } from 'express';
import { Logger } from '@nestjs/common';

interface RequestWithRawbody extends Request {
	rawBody: string;
}

@Controller()
export class AppController {
	private logger = new Logger('AppController');

	constructor(
		private readonly asanaService: AsanaService,
		private readonly gitlabService: GitlabService,
	) {}

	@Get()
	getRoot(): string {
		return this.getInfo();
	}

	// Asana webhook endpoint
	@Post('webhooks/asana')
	async asanaWebhook(
		@Headers('x-hook-secret') secret: string,
		@Headers('x-hook-signature') signature: string,
		@Body() data: AsanaPostBody,
		@Res() res: Response,
	) {
		try {
			// Handshake
			if (secret) {
				this.asanaService.handleHandshake(secret);

				res.set({ 'x-hook-secret': secret });
				res.status(HttpStatus.OK).send();
			} else {
				if (!data) {
					res.status(HttpStatus.OK).send();
				}
				// Verify signature for normal posts
				else if (!(await this.asanaService.verifyPost(signature, data))) {
					res.status(HttpStatus.UNAUTHORIZED).send();
				} else {
					await this.asanaService.handleHooks(data);
					res.status(HttpStatus.OK).send();
				}
			}
		} catch (error) {
			this.logger.error(error.message, error.trace);
			res.status(HttpStatus.OK).send();
		}
	}

	// GitLab webhook endpoint
	@Post('webhooks/gitlab')
	async gitlabWebhook(
		@Headers('x-gitlab-token') secret: string,
		@Headers('x-gitlab-event') type: string,
		@Body() data,
	): Promise<void> {
		// Verify secret sent in messages
		if (!this.gitlabService.verifyPost(secret)) {
			throw new UnauthorizedException();
		}

		if (data) {
			try {
				await this.gitlabService.handleHooks(type, data);
			} catch (error) {
				this.logger.error(error.message, error.trace);
				throw new InternalServerErrorException();
			}
		}
	}

	private getInfo(): string {
		return 'Asana-GitLab integration: hooks on webhooks/asana and webhooks/gitlab';
	}
}
