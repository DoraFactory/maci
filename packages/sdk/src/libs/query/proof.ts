import { Http } from '../../libs';
import { isValidAddress } from '../../utils';
import { ProofResponse, ProofGraphqlResponse } from '../../types';
import { handleError, ErrorType } from '../errors';
import { ERROR } from '../errors/types';

export class Proof {
  public http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  async getProofByContractAddress(address: string): Promise<ProofResponse> {
    try {
      if (!isValidAddress(address)) {
        return {
          code: 400,
          error: {
            message: 'Invalid round address format',
            type: ERROR.ERROR_ROUND_INVALID_ADDRESS,
          },
        };
      }

      const PROOF_QUERY = `query HomePage {
              proofData(first: 100, filter:{
                contractAddress:{
                  equalTo: "${address}"
                }
                } ,orderBy: [TIMESTAMP_DESC]
              ){
                nodes {
                  id
                  blockHeight
                  txHash
                  contractAddress
                  timestamp
                  actionType
                  commitment
                  proof
                }
              }
            }
            `;

      const response = await this.http.fetchGraphql<ProofGraphqlResponse>(
        PROOF_QUERY,
        ''
      );

      if (
        !response ||
        !response.data ||
        !response.data.proofData ||
        !response.data.proofData.nodes ||
        response.data.proofData.nodes.length === 0
      ) {
        return {
          code: 404,
          error: {
            message: `No proof found for round address ${address}`,
            type: ERROR.ERROR_PROOF_NOT_FOUND,
          },
        };
      }

      return {
        code: 200,
        data: response.data,
      };
    } catch (error) {
      return handleError(error as ErrorType);
    }
  }
}
