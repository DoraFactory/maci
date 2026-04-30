import { BaseError, HttpError, GraphQLError, ParseError } from '../errors';

export type FetchOptions = RequestInit & {
  next?: {
    revalidate?: boolean | number;
  };
};

const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_DELAY = 200;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Http {
  private apiEndpoint: string;
  private restEndpoints: string[];
  private retries: number;
  private retryDelay: number;
  private defaultOptions?: FetchOptions;

  constructor(
    apiEndpoint: string,
    restEndpoints: string | string[],
    private customFetch?: typeof fetch,
    defaultOptions?: FetchOptions,
    retries?: number,
    retryDelay?: number
  ) {
    this.apiEndpoint = apiEndpoint;
    this.restEndpoints = Array.isArray(restEndpoints) ? restEndpoints : [restEndpoints];
    this.defaultOptions = defaultOptions;
    this.retries = retries ?? DEFAULT_RETRIES;
    this.retryDelay = retryDelay ?? DEFAULT_RETRY_DELAY;
  }

  private getFetch() {
    return this.customFetch || fetch;
  }

  async fetch(url: string, options?: any): Promise<Response> {
    try {
      const fetchFn = this.getFetch();
      const response = await fetchFn(url, {
        ...this.defaultOptions,
        ...options
      });

      if (!response.ok) {
        throw new HttpError(`HTTP error! status: ${response.status}`, response.status);
      }

      return response;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(`Failed to fetch: ${(error as Error).message}`, 500);
    }
  }

  async fetchGraphql<T>(query: string, after: string, limit: number | null = 10): Promise<T> {
    try {
      const isFirstPage = after === 'first';
      const fetchFn = this.getFetch();

      const response = await fetchFn(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: { limit, after: isFirstPage ? undefined : after }
        }),
        ...this.defaultOptions
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (errorData.errors?.[0]?.message?.includes('Syntax Error')) {
          throw new GraphQLError(`GraphQL syntax error: ${errorData.errors[0].message}`);
        }

        if (errorData.errors?.length > 0) {
          throw new GraphQLError(errorData.errors[0].message || 'Unknown GraphQL error');
        }

        throw new HttpError(`HTTP error: ${JSON.stringify(errorData)}`, response.status);
      }

      const data = await response.json();

      if (data.errors) {
        throw new GraphQLError(data.errors[0]?.message || 'GraphQL query failed');
      }

      return data;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new ParseError('Failed to parse JSON response');
      }
      throw new HttpError(`Failed to fetch GraphQL: ${(error as Error).message}`, 500);
    }
  }

  async fetchRest(path: string, options?: any): Promise<any> {
    let lastError: unknown;
    let restIndex = 0; // always start from primary on every new call

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const endpoint = this.restEndpoints[restIndex];
      try {
        const fetchFn = this.getFetch();
        const response = await fetchFn(`${endpoint}${path}`, {
          ...this.defaultOptions,
          ...options
        });

        if (!response.ok) {
          throw new HttpError(`HTTP error! status: ${response.status}`, response.status);
        }

        try {
          return await response.json();
        } catch {
          throw new ParseError('Failed to parse JSON response');
        }
      } catch (error) {
        // Don't retry on 4xx — client errors won't be fixed by switching endpoints
        if (error instanceof HttpError && error.code >= 400 && error.code < 500) {
          throw error;
        }
        lastError = error;
        const nextIndex = (restIndex + 1) % this.restEndpoints.length;
        const delay = this.retryDelay;
        console.warn(
          `[Http] REST request failed (attempt ${attempt + 1}/${this.retries + 1}) on ${endpoint}${path}: ${(error as Error)?.message ?? error}` +
            (attempt < this.retries
              ? ` — retrying on ${this.restEndpoints[nextIndex]} in ${delay}ms`
              : ' — all retries exhausted')
        );
        restIndex = nextIndex;
        if (attempt < this.retries) {
          await sleep(delay);
        }
      }
    }

    if (lastError instanceof BaseError) {
      throw lastError;
    }
    throw new HttpError(
      `Failed to fetch REST: ${(lastError as Error)?.message ?? 'unknown error'}`,
      500
    );
  }

  async fetchAllGraphqlPages<T>(query: string, variables: any): Promise<T[]> {
    let hasNextPage = true;
    let offset = 0;
    const limit = 100; // Adjust the limit as needed
    const allData: T[] = [];

    while (hasNextPage) {
      const response = await this.fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: { ...variables, limit, offset }
        })
      }).then((res) => res.json());

      const key = Object.keys(response.data)[0];

      const { nodes, pageInfo } = response.data[key];
      allData.push(...nodes);
      hasNextPage = pageInfo.hasNextPage;
      offset += limit;
    }

    return allData;
  }
}
