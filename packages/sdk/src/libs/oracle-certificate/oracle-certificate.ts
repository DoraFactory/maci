import { Http } from '../http';
import {
  OracleCertificateParams,
  SignatureRequest,
  SignatureResponse,
  FeegrantAllowanceResponse,
  EcosystemsResponse,
} from './types';

export class OracleCertificate {
  private certificateApiEndpoint: string;
  private http: Http;

  constructor({ certificateApiEndpoint, http }: OracleCertificateParams) {
    this.certificateApiEndpoint = certificateApiEndpoint;
    this.http = http;
  }

  async sign(data: SignatureRequest): Promise<SignatureResponse> {
    const response = await this.http.fetch(
      `${this.certificateApiEndpoint}/${data.ecosystem}/sign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: data.address,
          height: data.height,
          contractAddress: data.contractAddress,
        }),
      }
    );
    const signatureData = await response.json();

    return signatureData;
  }

  async feegrantAllowance(
    granter: string,
    grantee: string
  ): Promise<FeegrantAllowanceResponse> {
    const response = await this.http.fetchRest(
      `/cosmos/feegrant/v1beta1/allowance/${granter}/${grantee}`
    );

    return {
      granter,
      grantee,
      spend_limit: response.allowance.allowance.allowance.spend_limit,
    };
  }

  async listEcosystems(): Promise<EcosystemsResponse> {
    const response = await this.http.fetch(
      `${this.certificateApiEndpoint}/list`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    const signatureData = await response.json();

    return signatureData;
  }
}
