import { Http } from '../../libs';
import {
  CircuitResponse,
  CircuitsCountGraphqlResponse,
  CircuitType,
  CircuitsResponse,
} from '../../types';
import { circuits } from '../const';
import { handleError, ErrorType } from '../errors';
import { ERROR } from '../errors/types';

export class Circuit {
  public http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  async getCircuitByName(name: string): Promise<CircuitResponse> {
    try {
      const circuitName = name;
      const circuitData: CircuitType = circuits[circuitName];

      if (circuitData === undefined) {
        return {
          code: 404,
          error: {
            message: `Circuit ${circuitName} not found`,
            type: ERROR.ERROR_CIRCUIT_NOT_FOUND,
          },
        };
      }

      const CIRCUIT_ROUNDS_COUNT_QUERY = `
    query {
      rounds(filter: { circuitName: { equalTo: "${circuitData.displayName}" } }) {
        totalCount
      }
    }
    `;
      const circuitRoundsCountResponse =
        await this.http.fetchGraphql<CircuitsCountGraphqlResponse>(
          CIRCUIT_ROUNDS_COUNT_QUERY,
          ''
        );

      circuitData.roundCount =
        circuitRoundsCountResponse.data.rounds.totalCount;

      const response: CircuitResponse = {
        code: 200,
        data: {
          circuit: circuitData,
        },
      };

      return response;
    } catch (error) {
      return handleError(error as ErrorType);
    }
  }

  async getCircuits(): Promise<CircuitsResponse> {
    try {
      const circuitsArray: CircuitType[] = Object.values(circuits).sort(
        (a, b) => a.displayName.localeCompare(b.displayName)
      );

      const circuitsWithRoundCount = await Promise.all(
        circuitsArray.map(async (circuit) => {
          const CIRCUIT_ROUNDS_COUNT_QUERY = `
            query {
              rounds(filter: { circuitName: { equalTo: "${circuit.displayName}" } }) {
                totalCount
              }
            }
          `;
          const circuitRoundsCountResponse: CircuitsCountGraphqlResponse =
            await this.http.fetchGraphql(CIRCUIT_ROUNDS_COUNT_QUERY, '');
          return {
            ...circuit,
            roundCount: circuitRoundsCountResponse.data.rounds.totalCount,
          };
        })
      );

      const response: CircuitsResponse = {
        code: 200,
        data: {
          circuits: circuitsWithRoundCount,
        },
      };

      return response;
    } catch (error) {
      return handleError(error as ErrorType);
    }
  }
}
