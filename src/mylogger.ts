import { Logger, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class MyLogger extends Logger {
	log(message: string) {
		if (process.env.ENV !== 'prod') {
			super.log(message);
		}
	}

	debug(message: string) {
		if (process.env.ENV !== 'prod') {
			super.debug(message);
		}
	}

	verbose(message: string) {
		if (process.env.ENV !== 'prod') {
			super.verbose(message);
		}
	}
}
