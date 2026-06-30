interface MockRequestUrlOptions {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	throw?: boolean;
}

interface MockRequestUrlResponse {
	text: string;
	status?: number;
}

type MockRequestUrlHandler = (options: MockRequestUrlOptions) => MockRequestUrlResponse | Promise<MockRequestUrlResponse>;

let requestUrlHandler: MockRequestUrlHandler | null = null;

export const requestUrlCalls: MockRequestUrlOptions[] = [];

export function setRequestUrlMock(handler: MockRequestUrlHandler): void {
	requestUrlHandler = handler;
	requestUrlCalls.length = 0;
}

export function resetRequestUrlMock(): void {
	requestUrlHandler = null;
	requestUrlCalls.length = 0;
}

export async function requestUrl(options: MockRequestUrlOptions): Promise<MockRequestUrlResponse> {
	requestUrlCalls.push(options);
	if (!requestUrlHandler) {
		throw new Error("requestUrl is not available in unit tests.");
	}

	return requestUrlHandler(options);
}

export function getLanguage(): string {
	return "en";
}

export class Notice {
	message: string;

	constructor(message: string) {
		this.message = message;
	}
}
