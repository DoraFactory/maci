import {
  TransactionsResponse,
  TransactionResponse,
  TransactionGraphqlResponse,
  TransactionsGraphqlResponse,
} from '../../types';
import { Http } from '../../libs';
import { isValidAddress } from '../../utils';
import { handleError, ErrorType } from '../errors';
import { ERROR } from '../errors/types';

export class Transaction {
  public http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  async getTransactionByHash(txHash: string): Promise<TransactionResponse> {
    try {
      const TRANSACTION_QUERY = `query {
        transaction(id: "${txHash}") {
          id
          blockHeight
          txHash
          timestamp
          type
          status
          circuitName
          fee
          gasUsed
          gasWanted
          caller
          contractAddress
        }
      }`;

      const response = await this.http.fetchGraphql<TransactionGraphqlResponse>(
        TRANSACTION_QUERY,
        ''
      );

      if (!response || !response.data || !response.data.transaction) {
        return {
          code: 404,
          error: {
            message: `No transaction found for txHash ${txHash}`,
            type: ERROR.ERROR_TRANSACTION_NOT_FOUND,
          },
        };
      }

      return {
        code: 200,
        data: response.data,
      };
    } catch (error: any) {
      return handleError(error as ErrorType);
    }
  }

  async getTransactions(
    after: string,
    limit?: number
  ): Promise<TransactionsResponse> {
    try {
      const TRANSACTION_HISTORY_QUERY = `query transactions($limit: Int, $after: Cursor) {
            transactions(first: $limit, after: $after, orderBy: [TIMESTAMP_DESC]
            ){
              pageInfo {
                endCursor
                hasNextPage
              }
              totalCount
              edges {
                cursor
                node {
                  id
                  blockHeight
                  txHash
                  timestamp
                  type
                  status
                  circuitName
                  fee
                  gasUsed
                  gasWanted
                  caller
                  contractAddress
                }
              }
            }
          }`;

      const response =
        await this.http.fetchGraphql<TransactionsGraphqlResponse>(
          TRANSACTION_HISTORY_QUERY,
          after,
          limit
        );

      if (
        !response ||
        !response.data ||
        !response.data.transactions ||
        !response.data.transactions.edges
      ) {
        return {
          code: 404,
          error: {
            message: 'No transactions data found',
            type: ERROR.ERROR_TRANSACTIONS_NOT_FOUND,
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

  async getTransactionsByContractAddress(
    address: string,
    after: string,
    limit?: number
  ): Promise<TransactionsResponse> {
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

      const TRANSACTION_HISTORY_QUERY = `query transactions($limit: Int!, $after: Cursor) {
          transactions(first: $limit, after: $after, filter:{
            contractAddress:{
              equalTo: "${address}"
            }
           }, orderBy: [TIMESTAMP_DESC]
          ){
            pageInfo {
              endCursor
              hasNextPage
            }
            totalCount
            edges {
              cursor
              node {
                id
                blockHeight
                txHash
                timestamp
                type
                status
                circuitName
                fee
                gasUsed
                gasWanted
                caller
                contractAddress
              }
            }
          }
        }`;

      const response =
        await this.http.fetchGraphql<TransactionsGraphqlResponse>(
          TRANSACTION_HISTORY_QUERY,
          after,
          limit
        );

      if (
        !response ||
        !response.data ||
        !response.data.transactions ||
        !response.data.transactions.edges
      ) {
        return {
          code: 404,
          error: {
            message: 'No transactions data found',
            type: ERROR.ERROR_TRANSACTIONS_NOT_FOUND,
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
