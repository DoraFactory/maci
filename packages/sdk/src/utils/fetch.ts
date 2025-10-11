export async function fetchApi<T>(url: string, retryCount = 3): Promise<T> {
	let lastError: Error | null = null;
	let result: T | null = null;

	for (let attempt = 0; attempt < retryCount; attempt++) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			result = (await response.json()) as T;
			break;
		} catch (error) {
			lastError = error as Error;

			if (attempt === retryCount - 1) {
				throw lastError;
			}

			await new Promise(resolve =>
				setTimeout(resolve, Math.pow(2, attempt) * 1000)
			);
		}
	}

	return result as T;
}
