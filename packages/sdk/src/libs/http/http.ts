import { BaseError, HttpError, GraphQLError, ParseError } from '../errors';

export type FetchOptions = RequestInit & {
  next?: {
    revalidate?: boolean | number;
  };
};

export class Http {
  private apiEndpoint: string;
  private restEndpoint: string;
  private defaultOptions?: FetchOptions;

  constructor(
    apiEndpoint: string,
    restEndpoint: string,
    private customFetch?: typeof fetch,
    defaultOptions?: FetchOptions
  ) {
    this.apiEndpoint = apiEndpoint;
    this.restEndpoint = restEndpoint;
    this.defaultOptions = defaultOptions;
  }

  private getFetch() {
    return this.customFetch || fetch;
  }

  async fetch(url: string, options?: any): Promise<Response> {
    try {
      const fetchFn = this.getFetch();
      const response = await fetchFn(url, {
        ...this.defaultOptions,
        ...options,
      });

      if (!response.ok) {
        throw new HttpError(
          `HTTP error! status: ${response.status}`,
          response.status
        );
      }

      return response;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(`Failed to fetch: ${(error as Error).message}`, 500);
    }
  }

  async fetchGraphql<T>(
    query: string,
    after: string,
    limit: number | null = 10
  ): Promise<T> {
    try {
      const isFirstPage = after === 'first';
      const fetchFn = this.getFetch();

      const response = await fetchFn(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { limit, after: isFirstPage ? undefined : after },
        }),
        ...this.defaultOptions,
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (errorData.errors?.[0]?.message?.includes('Syntax Error')) {
          throw new GraphQLError(
            `GraphQL syntax error: ${errorData.errors[0].message}`
          );
        }

        if (errorData.errors?.length > 0) {
          throw new GraphQLError(
            errorData.errors[0].message || 'Unknown GraphQL error'
          );
        }

        throw new HttpError(
          `HTTP error: ${JSON.stringify(errorData)}`,
          response.status
        );
      }

      const data = await response.json();

      if (data.errors) {
        throw new GraphQLError(
          data.errors[0]?.message || 'GraphQL query failed'
        );
      }

      return data;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new ParseError('Failed to parse JSON response');
      }
      throw new HttpError(
        `Failed to fetch GraphQL: ${(error as Error).message}`,
        500
      );
    }
  }

  async fetchRest(path: string, options?: any): Promise<any> {
    try {
      const fetchFn = this.getFetch();
      const response = await fetchFn(`${this.restEndpoint}${path}`, {
        ...this.defaultOptions,
        ...options,
      });

      if (!response.ok) {
        throw new HttpError(
          `HTTP error! status: ${response.status}`,
          response.status
        );
      }

      try {
        return await response.json();
      } catch (error) {
        throw new ParseError('Failed to parse JSON response');
      }
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw new HttpError(
        `Failed to fetch REST: ${(error as Error).message}`,
        500
      );
    }
  }
}
