import { ERROR } from '../errors/types';
import { Http } from '../../libs';
import {
  OperatorsGraphqlResponse,
  RoundsCountGraphqlResponse,
  OperatorResponse,
  OperatorsResponse,
  OperatorDelayOperationsResponse,
  OperatorDelayOperationsGraphqlResponse,
  MissRateResponse,
  MissRateType,
  TransactionsGraphqlResponse,
  RoundsGraphqlResponse,
} from '../../types';
import { isValidAddress } from '../../utils';
import { handleError, ErrorType } from '../errors';

export class Operator {
  public http: Http;
  public amaciRegistryContract: string;

  constructor(http: Http, amaciRegistryContract: string) {
    this.http = http;
    this.amaciRegistryContract = amaciRegistryContract;
  }

  async getOperatorByAddress(address: string): Promise<OperatorResponse> {
    try {
      if (!isValidAddress(address)) {
        return {
          code: 400,
          error: {
            message: 'Invalid operator address format',
            type: ERROR.ERROR_OPERATOR_INVALID_ADDRESS,
          },
        };
      }

      const OPERATORS_QUERY = `query {
    operators(filter: { operatorAddress: { equalTo: "${address}" } }) {
        edges {
          node {
            id
            validatorAddress
            operatorAddress
            coordinatorPubkeyX
            coordinatorPubkeyY
            identity
          }
        }
      }
    }`;

      const response = await this.http.fetchGraphql<OperatorsGraphqlResponse>(
        OPERATORS_QUERY,
        ''
      );

      if (
        !response ||
        !response.data ||
        !response.data.operators ||
        !response.data.operators.edges ||
        response.data.operators.edges.length === 0
      ) {
        return {
          code: 404,
          error: {
            message: `No operator found for address ${address}`,
            type: ERROR.ERROR_OPERATOR_NOT_FOUND,
          },
        };
      }

      const operatorResponse = response.data.operators.edges[0].node;

      if (
        operatorResponse.operatorAddress === '' ||
        operatorResponse.coordinatorPubkeyX === ''
      ) {
        operatorResponse.activeRoundsCount = 0;
        operatorResponse.completedRoundsCount = 0;
      } else {
        const ROUNDS_QUERY = `query {
        activeRoundsCount: rounds(filter: {
          period: {notEqualTo: "Ended"},
          operator: {equalTo: "${operatorResponse.operatorAddress}"},
          caller: {equalTo: "${this.amaciRegistryContract}"}
        }) {
          totalCount
        }
        completedRoundsCount: rounds(filter: {
          period: {equalTo: "Ended"},
          operator: {equalTo: "${operatorResponse.operatorAddress}"},
          caller: {equalTo: "${this.amaciRegistryContract}"}
        }) {
          totalCount
        }
      }`;

        const roundsCount =
          await this.http.fetchGraphql<RoundsCountGraphqlResponse>(
            ROUNDS_QUERY,
            ''
          );
        operatorResponse.activeRoundsCount =
          roundsCount.data.activeRoundsCount.totalCount;
        operatorResponse.completedRoundsCount =
          roundsCount.data.completedRoundsCount.totalCount;
      }

      operatorResponse.logoUrl = '';
      operatorResponse.moniker = '';
      const identity = response.data.operators.edges[0].node.identity;

      const keybaseUrl = `https://keybase.io/_/api/1.0/user/lookup.json?key_suffix=${identity}`;
      const keybaseResponse = await this.http.fetch(keybaseUrl);
      const keybaseData = await keybaseResponse.json();

      if (keybaseData.status.code === 0) {
        if (keybaseData.them[0]?.pictures?.primary?.url) {
          operatorResponse.logoUrl = keybaseData.them[0].pictures.primary.url;
        }
        if (keybaseData.them[0]?.basics?.username_cased) {
          operatorResponse.moniker = keybaseData.them[0].profile.full_name;
        }
      }
      const operator: OperatorResponse = {
        code: 200,
        data: {
          operator: operatorResponse,
        },
      };
      return operator;
    } catch (error) {
      return handleError(error as ErrorType);
    }
  }

  async getOperatorDelayOperationsByAddress(
    address: string,
    after: string,
    limit?: number
  ): Promise<OperatorDelayOperationsResponse> {
    try {
      if (!isValidAddress(address)) {
        return {
          code: 400,
          error: {
            message: 'Invalid operator address format',
            type: ERROR.ERROR_OPERATOR_INVALID_ADDRESS,
          },
        };
      }

      const OPERATORS_QUERY = `query ($limit: Int, $after: Cursor) {
        operatorDelayOperations(first: $limit, after: $after, filter: {operatorAddress: {equalTo: "${address}"}}, orderBy: [TIMESTAMP_DESC]) {
          pageInfo {
            endCursor
            hasNextPage
          }
          totalCount
          edges {
            cursor
            node {
              blockHeight
              delayProcessDmsgCount
              delayDuration
              delayReason
              delayType
              id
              nodeId
              operatorAddress
              timestamp
              roundAddress
            }
          }
        }
      }`;

      const response =
        await this.http.fetchGraphql<OperatorDelayOperationsGraphqlResponse>(
          OPERATORS_QUERY,
          after,
          limit
        );

      if (
        !response ||
        !response.data ||
        !response.data.operatorDelayOperations ||
        !response.data.operatorDelayOperations.edges ||
        response.data.operatorDelayOperations.edges.length === 0
      ) {
        return {
          code: 404,
          error: {
            message: `No operatorDelayOperations found for address ${address}`,
            type: ERROR.ERROR_OPERATOR_DELAY_HISTORY_NOT_FOUND,
          },
        };
      }
      const operator: OperatorDelayOperationsResponse = {
        code: 200,
        data: response.data,
      };
      return operator;
    } catch (error) {
      return handleError(error as ErrorType);
    }
  }

  async getOperators(
    after: string,
    limit?: number
  ): Promise<OperatorsResponse> {
    try {
      const OPERATORS_QUERY = `query ($limit: Int, $after: Cursor) {
          operators(first: $limit, after: $after) {
            pageInfo {
              endCursor
              hasNextPage
            }
            totalCount
            edges {
              cursor
              node {
                id
                validatorAddress
                operatorAddress
                coordinatorPubkeyX
                coordinatorPubkeyY
                identity
              }
            }
          }
        }`;

      const response = await this.http.fetchGraphql<OperatorsGraphqlResponse>(
        OPERATORS_QUERY,
        after,
        limit
      );
      if (
        !response ||
        !response.data ||
        !response.data.operators ||
        !response.data.operators.edges
      ) {
        return {
          code: 404,
          error: {
            message: 'No operators found',
            type: ERROR.ERROR_OPERATORS_NOT_FOUND,
          },
        };
      }
      const operatorsWithRounds = await Promise.all(
        response.data.operators.edges.map(async (edge) => {
          const operator = edge.node;
          if (
            operator.operatorAddress === '' ||
            operator.coordinatorPubkeyX === ''
          ) {
            operator.activeRoundsCount = 0;
            operator.completedRoundsCount = 0;
            return operator;
          }
          const ROUNDS_QUERY = `query {
              activeRoundsCount: rounds(filter: {
                period: {notEqualTo: "Ended"},
                operator: {equalTo: "${operator.operatorAddress}"},
                caller: {equalTo: "${this.amaciRegistryContract}"}
              }) {
                totalCount
              }
              completedRoundsCount: rounds(filter: {
                period: {equalTo: "Ended"},
                operator: {equalTo: "${operator.operatorAddress}"},
                caller: {equalTo: "${this.amaciRegistryContract}"}
              }) {
                totalCount
              }
            }`;

          const roundsCount =
            await this.http.fetchGraphql<RoundsCountGraphqlResponse>(
              ROUNDS_QUERY,
              ''
            );
          operator.activeRoundsCount =
            roundsCount.data.activeRoundsCount.totalCount;
          operator.completedRoundsCount =
            roundsCount.data.completedRoundsCount.totalCount;

          return operator;
        })
      );

      response.data.operators.edges = operatorsWithRounds.map(
        (operator, index) => ({
          cursor: response.data.operators.edges[index].cursor,
          node: operator,
        })
      );

      await Promise.all(
        response.data.operators.edges.map(async (edge) => {
          const operator = edge.node;
          const identity = operator.identity;
          operator.logoUrl = '';
          operator.moniker = '';

          // try {
          const keybaseUrl = `https://keybase.io/_/api/1.0/user/lookup.json?key_suffix=${identity}`;
          const keybaseResponse = await this.http.fetch(keybaseUrl);
          const keybaseData = await keybaseResponse.json();

          if (keybaseData.status.code === 0) {
            if (keybaseData.them[0]?.pictures?.primary?.url) {
              operator.logoUrl = keybaseData.them[0].pictures.primary.url;
            }
            if (keybaseData.them[0]?.basics?.username_cased) {
              operator.moniker = keybaseData.them[0].profile.full_name;
            }
          }
          // } catch (error) {
          //   console.error('Error fetching keybase data:', error);
          // }
          return operator;
        })
      );

      return {
        code: 200,
        data: response.data,
      };
    } catch (error) {
      return handleError(error as ErrorType);
    }
  }

  async queryMissRate(
    address: string,
    durationDay: number
  ): Promise<MissRateResponse> {
    try {
      const now = new Date();
      const startTime = new Date(
        now.getTime() - durationDay * 24 * 60 * 60 * 1000
      );
      const startTimestamp = Math.floor(startTime.getTime() / 1000);
      const endNanosTimestamp = Math.floor(startTime.getTime() * 1000000);
      const txTimestamp = Math.floor(startTime.getTime());

      const QUERY = `query ($limit: Int, $after: Cursor) {
        operatorDelayOperations(
          first: $limit,
          after: $after,
          filter: {
            operatorAddress: {equalTo: "${address}"},
            timestamp: { greaterThanOrEqualTo: "${startTimestamp}" }
          },
          orderBy: [TIMESTAMP_DESC]
        ) {
          edges {
            node {
              blockHeight
              delayProcessDmsgCount
              delayDuration
              delayReason
              delayType
              id
              nodeId
              operatorAddress
              timestamp
              roundAddress
            }
          }
        }
      }`;

      const ROUNDS_QUERY = `query ($limit: Int, $after: Cursor) {
        rounds(first: $limit, after: $after, 
              filter: {
                operator: {equalTo: "${address}"},
                votingEnd: { greaterThanOrEqualTo: "${endNanosTimestamp}" }
              },
              orderBy: [TIMESTAMP_DESC]
            ){
              pageInfo {
                endCursor
                hasNextPage
              }
              totalCount
              edges {
                node {
                  id
                  blockHeight
                  txHash
                  caller
                  admin
                  operator
                  contractAddress
                  circuitName
                  timestamp
                  votingStart
                  votingEnd
                  status
                  period
                  actionType
                  roundTitle
                  roundDescription
                  roundLink
                  coordinatorPubkeyX
                  coordinatorPubkeyY
                  voteOptionMap
                  results
                  allResult
                  gasStationEnable
                  totalGrant
                  baseGrant
                  totalBond
                  circuitType
                  circuitPower
                  certificationSystem
                  codeId
                  maciType
                  voiceCreditAmount
                  preDeactivateRoot
                }
                cursor
              }
            }
          }
      `;

      const roundsResponse =
        await this.http.fetchGraphql<RoundsGraphqlResponse>(
          ROUNDS_QUERY,
          '',
          9999
        );
      const roundContractAddresses =
        roundsResponse?.data?.rounds?.edges?.map(
          (edge) => edge.node.contractAddress
        ) || [];

      const TRANSACTIONS_QUERY = `query transactions($limit: Int, $after: Cursor) {
        transactions(first: $limit, after: $after, 
          filter: {
            timestamp: { greaterThanOrEqualTo: "${txTimestamp}" },
            type: { equalTo: "op:procDeactivate" },
            contractAddress: { in: ${JSON.stringify(roundContractAddresses)} }
          },
          orderBy: [TIMESTAMP_DESC]
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

      const [delayResponse, transactionsResponse] = await Promise.all([
        this.http.fetchGraphql<OperatorDelayOperationsGraphqlResponse>(
          QUERY,
          '',
          9999
        ),
        this.http.fetchGraphql<TransactionsGraphqlResponse>(
          TRANSACTIONS_QUERY,
          '',
          9999
        ),
      ]);

      const dailyStats = new Map<string, MissRateType>();

      const endDate = new Date();
      for (let i = 0; i < durationDay; i++) {
        const date = new Date(endDate.getTime() - i * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];
        dailyStats.set(date, {
          delayCount: 0,
          deactivateDelay: {
            count: 0,
            dmsgCount: 0,
          },
          tallyDelay: {
            count: 0,
          },
          totalDelayDuration: 0,
          avgDelayDuration: 0,
          tallyCount: 0,
          deactivateCount: 0,
          missRate: 0,
        });
      }

      delayResponse.data.operatorDelayOperations.edges.forEach(({ node }) => {
        const date = new Date(parseInt(node.timestamp) * 1000)
          .toISOString()
          .split('T')[0];

        if (dailyStats.has(date)) {
          const stats = dailyStats.get(date)!;
          stats.delayCount++;
          stats.totalDelayDuration += parseInt(node.delayDuration);
          if (node.delayType === 'deactivate_delay') {
            stats.deactivateDelay.count++;
            stats.deactivateDelay.dmsgCount += node.delayProcessDmsgCount;
          } else if (node.delayType === 'tally_delay') {
            stats.tallyDelay.count++;
          }
        }
      });

      if (roundsResponse?.data?.rounds?.edges) {
        roundsResponse.data.rounds.edges.forEach(({ node }) => {
          const date = new Date(parseInt(node.votingEnd) / 1000000)
            .toISOString()
            .split('T')[0];
          if (dailyStats.has(date)) {
            const stats = dailyStats.get(date)!;
            stats.tallyCount++;
          }
        });
      }

      if (transactionsResponse?.data?.transactions?.edges) {
        transactionsResponse.data.transactions.edges.forEach(({ node }) => {
          const date = new Date(parseInt(node.timestamp))
            .toISOString()
            .split('T')[0];
          if (dailyStats.has(date)) {
            const stats = dailyStats.get(date)!;
            stats.deactivateCount++;
          }
        });
      }

      return {
        code: 200,
        data: {
          missRate: Array.from(dailyStats.entries())
            .map(([date, stats]) => ({
              date,
              delayCount: stats.delayCount,
              deactivateDelay: stats.deactivateDelay,
              tallyDelay: stats.tallyDelay,
              totalDelayDuration: stats.totalDelayDuration,
              avgDelayDuration:
                stats.delayCount > 0
                  ? stats.totalDelayDuration / stats.delayCount
                  : 0,
              tallyCount: stats.tallyCount,
              deactivateCount: stats.deactivateCount,
              missRate:
                stats.deactivateCount + stats.tallyCount > 0
                  ? parseFloat(
                      (
                        (stats.deactivateDelay.count + stats.tallyDelay.count) /
                        (stats.deactivateCount + stats.tallyCount)
                      ).toFixed(2)
                    )
                  : 0,
            }))
            .sort((a, b) => b.date.localeCompare(a.date)),
        },
      };
    } catch (error) {
      return {
        code: 404,
        error: {
          message: 'Query miss rate failed',
          type: ERROR.ERROR_QUERY_MISS_RATE_FAILED,
        },
      };
    }
  }
}
