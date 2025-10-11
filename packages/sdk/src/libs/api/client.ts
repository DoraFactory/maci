import { HttpError } from '../errors';
import type { paths, operations } from './types';

/**
 * MACI API Client configuration
 */
export interface MaciApiClientConfig {
  /** API base URL */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Custom fetch function (optional) */
  customFetch?: typeof fetch;
  /** Default request timeout in milliseconds */
  timeout?: number;
  /**
   * API key header type
   * - 'x-api-key': Use x-api-key header (default)
   * - 'bearer': Use Authorization: Bearer header
   */
  apiKeyHeader?: 'x-api-key' | 'bearer';
}

/**
 * Extract request body type from operation
 */
type RequestBody<T> = T extends {
  requestBody: { content: { 'application/json': infer U } };
}
  ? U
  : T extends {
        requestBody?: { content: { 'application/json': infer U } };
      }
    ? U
    : never;

/**
 * Extract response type from operation
 */
type ResponseBody<T, Status extends number = 200> = T extends {
  responses: {
    [K in Status]: {
      content: { 'application/json': infer U };
    };
  };
}
  ? U
  : never;

/**
 * Extract query parameters from operation
 */
type QueryParams<T> = T extends {
  parameters: { query?: infer U };
}
  ? U
  : never;

/**
 * Extract path parameters from operation
 */
type PathParams<T> = T extends {
  parameters: { path: infer U };
}
  ? U
  : never;

/**
 * MACI API Client
 * Provides type-safe MACI API call wrapper
 */
export class MaciApiClient {
  private baseUrl: string;
  private apiKey?: string;
  private customFetch: typeof fetch;
  private timeout: number;
  private apiKeyHeader: 'x-api-key' | 'bearer';

  constructor(config: MaciApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.customFetch = config.customFetch || fetch;
    this.timeout = config.timeout || 120000;
    this.apiKeyHeader = config.apiKeyHeader || 'x-api-key';
  }

  /**
   * Update API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Update base URL
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Internal fetch method with timeout and error handling
   */
  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (options?.headers) {
        Object.assign(headers, options.headers);
      }

      if (this.apiKey) {
        if (this.apiKeyHeader === 'x-api-key') {
          headers['x-api-key'] = this.apiKey;
        } else {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
      }

      const response = await this.customFetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new HttpError(
          errorData.error || `HTTP error! status: ${response.status}`,
          response.status
        );
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return null as T;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof HttpError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new HttpError('Request timeout', 408);
      }
      throw new HttpError(`Failed to fetch: ${(error as Error).message}`, 500);
    }
  }

  /**
   * Health check
   */
  async health(): Promise<ResponseBody<paths['/health']['get'], 200>> {
    return this.fetch('/health', { method: 'GET' });
  }

  // ==================== Admin APIs ====================

  /**
   * Create API key (Admin)
   */
  async createApiKey(
    data: RequestBody<paths['/admin/keys']['post']>
  ): Promise<ResponseBody<paths['/admin/keys']['post'], 200>> {
    return this.fetch('/admin/keys', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Create tenant (Admin)
   */
  async createTenant(
    data: RequestBody<paths['/admin/tenants']['post']>
  ): Promise<ResponseBody<paths['/admin/tenants']['post'], 201>> {
    return this.fetch('/admin/tenants', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // ==================== Usage API ====================

  /**
   * Get usage for current API key
   */
  async getUsage(
    params?: QueryParams<paths['/v1/usage']['get']>
  ): Promise<ResponseBody<paths['/v1/usage']['get'], 200>> {
    const queryString = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.fetch(`/v1/usage${queryString}`, { method: 'GET' });
  }

  // ==================== Core MACI APIs ====================

  /**
   * Signup
   */
  async signup(
    data: RequestBody<operations['signup']>
  ): Promise<ResponseBody<operations['signup'], 202>> {
    return this.fetch('/v1/signup', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Vote
   */
  async vote(
    data: RequestBody<operations['vote']>
  ): Promise<ResponseBody<operations['vote'], 202>> {
    return this.fetch('/v1/vote', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Create Round
   */
  async createRound(
    data: RequestBody<operations['createRound']>
  ): Promise<ResponseBody<operations['createRound'], 202>> {
    return this.fetch('/v1/create-round', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Create AMaci Round
   */
  async createAmaciRound(
    data: RequestBody<operations['createAmaciRound']>
  ): Promise<ResponseBody<operations['createAmaciRound'], 202>> {
    return this.fetch('/v1/create-amaci-round', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Set Round Info
   */
  async setRoundInfo(
    data: RequestBody<operations['setRoundInfo']>
  ): Promise<ResponseBody<operations['setRoundInfo'], 202>> {
    return this.fetch('/v1/set-round-info', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Set Vote Options
   */
  async setVoteOptions(
    data: RequestBody<operations['setVoteOptions']>
  ): Promise<ResponseBody<operations['setVoteOptions'], 202>> {
    return this.fetch('/v1/set-vote-options', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Deactivate
   */
  async deactivate(
    data: RequestBody<operations['deactivate']>
  ): Promise<ResponseBody<operations['deactivate'], 202>> {
    return this.fetch('/v1/deactivate', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Add New Key
   */
  async addNewKey(
    data: RequestBody<operations['addNewKey']>
  ): Promise<ResponseBody<operations['addNewKey'], 202>> {
    return this.fetch('/v1/add-new-key', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Pre Add New Key
   */
  async preAddNewKey(
    data: RequestBody<operations['preAddNewKey']>
  ): Promise<ResponseBody<operations['preAddNewKey'], 202>> {
    return this.fetch('/v1/pre-add-new-key', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // ==================== Allowlist APIs ====================

  /**
   * Get allowlist list
   */
  async getAllowlists(
    params?: QueryParams<operations['getAllowlists']>
  ): Promise<ResponseBody<operations['getAllowlists'], 200>> {
    const queryString = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.fetch(`/v1/allowlists/${queryString}`, { method: 'GET' });
  }

  /**
   * Create allowlist
   */
  async createAllowlist(
    data: RequestBody<operations['createAllowlist']>
  ): Promise<ResponseBody<operations['createAllowlist'], 201>> {
    return this.fetch('/v1/allowlists/', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Get allowlist details
   */
  async getAllowlistDetail(
    params: PathParams<operations['getAllowlistDetail']>
  ): Promise<ResponseBody<operations['getAllowlistDetail'], 200>> {
    return this.fetch(`/v1/allowlists/${params.id}`, { method: 'GET' });
  }

  /**
   * Update allowlist
   */
  async updateAllowlist(
    params: PathParams<operations['updateAllowlist']>,
    data: RequestBody<operations['updateAllowlist']>
  ): Promise<ResponseBody<operations['updateAllowlist'], 200>> {
    return this.fetch(`/v1/allowlists/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Delete allowlist
   */
  async deleteAllowlist(
    params: PathParams<operations['deleteAllowlist']>
  ): Promise<ResponseBody<operations['deleteAllowlist'], 204>> {
    return this.fetch(`/v1/allowlists/${params.id}`, { method: 'DELETE' });
  }

  /**
   * Get round allowlist snapshot
   */
  async getRoundAllowlistSnapshot(
    params: PathParams<operations['getRoundAllowlistSnapshot']>
  ): Promise<ResponseBody<operations['getRoundAllowlistSnapshot'], 200>> {
    return this.fetch(`/v1/allowlists/snapshots/${params.contractAddress}`, {
      method: 'GET'
    });
  }

  // ==================== Certificate APIs ====================

  /**
   * Request certificate
   */
  async requestCertificate(
    data: RequestBody<paths['/v1/certificates/request']['post']>
  ): Promise<ResponseBody<paths['/v1/certificates/request']['post'], 200>> {
    return this.fetch('/v1/certificates/request', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // ==================== Pre-deactivate APIs ====================

  /**
   * Get pre-deactivate data by contract address
   */
  async getPreDeactivate(
    params: PathParams<paths['/v1/pre-deactivate/{contractAddress}']['get']>
  ): Promise<ResponseBody<paths['/v1/pre-deactivate/{contractAddress}']['get'], 200>> {
    return this.fetch(`/v1/pre-deactivate/${params.contractAddress}`, {
      method: 'GET'
    });
  }
}
