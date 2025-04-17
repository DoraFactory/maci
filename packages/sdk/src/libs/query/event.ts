import { Http } from '../../libs';
import {
  DeactivateMessage,
  SignUpEventsGraphqlResponse,
  SignUpEventsResponse,
} from '../../types';
import { handleError, ErrorType } from '../errors';
import { ERROR } from '../errors/types';

export class Event {
  public http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  async getSignUpEventByPubKey(
    contractAddress: string,
    pubKey: bigint[]
  ): Promise<SignUpEventsResponse> {
    try {
      const STATE_IDX_BY_PUB_KEY_QUERY = `
query signUpEvents($limit: Int, $after: Cursor) {
	signUpEvents(
    first: $limit, after: $after,
		filter: {
			contractAddress: {
				equalTo: "${contractAddress}"
			}
			pubKey: {
				equalTo: "${pubKey.map((n) => `\\"${n}\\"`).join(',')}"
			}
		}) {
		nodes {
			id
			blockHeight
			txHash
			contractAddress
			timestamp
			pubKey
			stateIdx
			balance
		}
	}
}
    `;

      const response =
        await this.http.fetchGraphql<SignUpEventsGraphqlResponse>(
          STATE_IDX_BY_PUB_KEY_QUERY,
          ''
        );

      if (
        !response ||
        !response.data ||
        !response.data.signUpEvents ||
        !response.data.signUpEvents.nodes ||
        response.data.signUpEvents.nodes.length === 0
      ) {
        return {
          code: 404,
          error: {
            message: `No signUpEvents found for pubKey ${pubKey
              .map((n) => `"${n}"`)
              .join(',')}`,
            type: ERROR.ERROR_SIGN_UP_EVENTS_NOT_FOUND,
          },
        };
      }

      return {
        code: 200,
        data: {
          signUpEvents: response.data.signUpEvents.nodes,
        },
      };
    } catch (error: any) {
      return handleError(error as ErrorType);
    }
  }

  async fetchAllDeactivateLogs(contractAddress: string) {
    const DEACTIVATE_MESSAGE_QUERY = `query ($limit: Int, $offset: Int) {
  deactivateMessages(
    first: $limit,
    offset: $offset,
    orderBy: [BLOCK_HEIGHT_ASC],
    filter: {
      maciContractAddress: { 
        equalTo: "${contractAddress}" 
      },
    }
  ) {
	  totalCount
	  pageInfo {
      endCursor
      hasNextPage
	  }
    nodes {
      id
      blockHeight
      timestamp
      txHash
      deactivateMessage
      maciContractAddress
      maciOperator
    }
  }
}`;
    const ds = await this.http.fetchAllGraphqlPages<DeactivateMessage>(
      DEACTIVATE_MESSAGE_QUERY,
      {}
    );

    return ds.reduce(
      (s, c) => [...s, ...JSON.parse(c.deactivateMessage)],
      [] as string[][]
    );
  }
}
