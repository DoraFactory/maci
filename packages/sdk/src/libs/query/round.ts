import {
  RoundsResponse,
  RoundResponse,
  RoundGraphqlResponse,
  RoundsGraphqlResponse,
  SelectiveRoundResponse,
  SelectiveRoundGraphqlResponse
} from '../../types';
import { Http } from '../../libs';
import { processTallyResults, isValidAddress } from '../../utils';
import { handleError, ErrorType } from '../errors';
import { ERROR } from '../errors/types';

export class Round {
  public http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  async getRoundById(address: string): Promise<RoundResponse> {
    try {
      if (!isValidAddress(address)) {
        return {
          code: 400,
          error: {
            message: 'Invalid round address format',
            type: ERROR.ERROR_ROUND_INVALID_ADDRESS
          }
        };
      }

      const ROUND_QUERY = `query {
      round(id: "${address}") {
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
        identity
      }
    }`;

      const response = await this.http.fetchGraphql<RoundGraphqlResponse>(ROUND_QUERY, '');

      if (!response || !response.data || !response.data.round) {
        return {
          code: 404,
          error: {
            message: `No round data found for address ${address}`,
            type: ERROR.ERROR_ROUND_NOT_FOUND
          }
        };
      }

      response.data.round.operatorLogoUrl = '';
      response.data.round.operatorMoniker = '';

      const identity = response.data.round.identity;
      // try {
      const keybaseUrl = `https://keybase.io/_/api/1.0/user/lookup.json?key_suffix=${identity}`;
      const keybaseResponse = await this.http.fetch(keybaseUrl);
      const keybaseData = await keybaseResponse.json();

      if (keybaseData.status.code === 0) {
        if (keybaseData.them[0]?.pictures?.primary?.url) {
          response.data.round.operatorLogoUrl = keybaseData.them[0].pictures.primary.url;
        }
        if (keybaseData.them[0]?.basics?.username_cased) {
          response.data.round.operatorMoniker = keybaseData.them[0].profile.full_name;
        }
      }
      // } catch (error) {
      //   console.error('Error fetching keybase data:', error);
      // }

      // Decode tally results and calculate percentages
      // Each result is encoded as: v * (v + MAX_VOTES) where MAX_VOTES = 10^24
      // High bits (÷ 10^24): total vote count
      // Low bits (% 10^24): total voice credits (sum of v^2)
      const results = JSON.parse(response.data.round.results);
      const { percentages } = processTallyResults(results);
      response.data.round.resultsList = percentages;

      return {
        code: 200,
        data: response.data
      };
    } catch (error: any) {
      return handleError(error as ErrorType);
    }
  }

  /**
   * Get round information with selective fields
   * @param address Round address
   * @param fields Array of fields to return, returns all fields if empty
   * @returns Round information response
   */
  async getRoundWithFields(address: string, fields?: string[]): Promise<SelectiveRoundResponse> {
    try {
      if (!isValidAddress(address)) {
        return {
          code: 400,
          error: {
            message: 'Invalid round address format',
            type: ERROR.ERROR_ROUND_INVALID_ADDRESS
          }
        };
      }

      const defaultFields = [
        'id',
        'blockHeight',
        'txHash',
        'caller',
        'admin',
        'operator',
        'contractAddress',
        'circuitName',
        'timestamp',
        'votingStart',
        'votingEnd',
        'status',
        'period',
        'actionType',
        'roundTitle',
        'roundDescription',
        'roundLink',
        'coordinatorPubkeyX',
        'coordinatorPubkeyY',
        'voteOptionMap',
        'results',
        'allResult',
        'gasStationEnable',
        'totalGrant',
        'baseGrant',
        'totalBond',
        'circuitType',
        'circuitPower',
        'certificationSystem',
        'codeId',
        'maciType',
        'voiceCreditAmount',
        'preDeactivateRoot',
        'identity'
        // 'funds',
      ];

      if (fields && fields.length > 0) {
        const invalidFields = fields.filter((field) => !defaultFields.includes(field));
        if (invalidFields.length > 0) {
          return {
            code: 400,
            error: {
              message: `Invalid fields: ${invalidFields.join(', ')}`,
              type: ERROR.ERROR_INVALID_FIELDS
            }
          };
        }
      }

      const selectedFields = fields && fields.length > 0 ? fields : defaultFields;

      const fieldString = selectedFields.join('\n        ');

      const ROUND_QUERY = `query {
          round(id: "${address}") {
            ${fieldString}
          }
        }`;

      const response = await this.http.fetchGraphql<SelectiveRoundGraphqlResponse>(ROUND_QUERY, '');

      if (!response || !response.data || !response.data.round) {
        return {
          code: 404,
          error: {
            message: `No round data found for address ${address}`,
            type: ERROR.ERROR_ROUND_NOT_FOUND
          }
        };
      }

      return {
        code: 200,
        data: response.data
      };
    } catch (error: any) {
      return handleError(error as ErrorType);
    }
  }

  async getRounds(after: string, limit?: number): Promise<RoundsResponse> {
    try {
      const ROUND_HISTORY_QUERY = `query ($limit: Int, $after: Cursor) {
        rounds(first: $limit, after: $after, orderBy: [TIMESTAMP_DESC]){
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

      const response = await this.http.fetchGraphql<RoundsGraphqlResponse>(
        ROUND_HISTORY_QUERY,
        after,
        limit
      );

      if (!response || !response.data || !response.data.rounds || !response.data.rounds.edges) {
        return {
          code: 404,
          error: {
            message: 'No rounds data found',
            type: ERROR.ERROR_ROUNDS_NOT_FOUND
          }
        };
      }

      return {
        code: 200,
        data: response.data
      };
    } catch (error) {
      return handleError(error as ErrorType);
    }
  }

  async getRoundsByCircuitName(
    circuitName: string,
    after: string,
    limit?: number
  ): Promise<RoundsResponse> {
    try {
      const ROUND_HISTORY_QUERY = `query ($limit: Int, $after: Cursor) {
        rounds(first: $limit, after: $after, filter:{
          circuitName:{
            equalTo: "${circuitName}"
          }
         }, orderBy: [TIMESTAMP_DESC]){
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
              }
            }
          }
          `;

      const response = await this.http.fetchGraphql<RoundsGraphqlResponse>(
        ROUND_HISTORY_QUERY,
        after,
        limit
      );

      if (!response || !response.data || !response.data.rounds || !response.data.rounds.edges) {
        return {
          code: 404,
          error: {
            message: `No rounds data found for circuit name ${circuitName}`,
            type: ERROR.ERROR_ROUNDS_NOT_FOUND
          }
        };
      }

      return {
        code: 200,
        data: response.data
      };
    } catch (error: any) {
      return handleError(error as ErrorType);
    }
  }

  async getRoundsByStatus(status: string, after: string, limit?: number): Promise<RoundsResponse> {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      let filterCondition = '';

      switch (status) {
        case 'Created':
          filterCondition = `
          or: [
            { votingStart: { equalTo: "0" } },
            { and: [
              { votingStart: { notEqualTo: "0" } },
              { votingStart: { greaterThan: "${currentTime.toString()}" } }
            ] }
          ]
        `;
          break;
        case 'Ongoing':
          filterCondition = `
          or: [
            { votingStart: { equalTo: "0" }},
            { votingStart: { lessThanOrEqualTo: "${currentTime.toString()}" }, votingEnd: { greaterThan: "${currentTime.toString()}" } }
          ]
        `;
          break;
        case 'Tallying':
          filterCondition = `
          and: [
            { status: { notEqualTo: "Closed" } },
            { votingEnd: { lessThan: "${currentTime.toString()}" } },
            { votingEnd: { notEqualTo: "0" } }
          ]
        `;
          break;
        case 'Closed':
          filterCondition = `status: { equalTo: "Closed" }`;
          break;
        default:
          return {
            code: 400,
            error: {
              message: `Invalid status: ${status}`,
              type: ERROR.ERROR_ROUND_INVALID_STATUS
            }
          };
      }

      const ROUND_HISTORY_QUERY = `query ($limit: Int!, $after: Cursor) {
      rounds(first: $limit, after: $after, filter: { ${filterCondition} }, orderBy: [TIMESTAMP_DESC]) {
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
        }
      }
    }`;

      const response = await this.http.fetchGraphql<RoundsGraphqlResponse>(
        ROUND_HISTORY_QUERY,
        after,
        limit
      );
      if (!response || !response.data || !response.data.rounds || !response.data.rounds.edges) {
        return {
          code: 404,
          error: {
            message: `No rounds data found for status ${status}`,
            type: ERROR.ERROR_ROUNDS_NOT_FOUND
          }
        };
      }

      return {
        code: 200,
        data: response.data
      };
    } catch (error: any) {
      return handleError(error as ErrorType);
    }
  }

  async getRoundsByOperator(
    operator: string,
    after: string,
    limit?: number
  ): Promise<RoundsResponse> {
    try {
      if (!isValidAddress(operator)) {
        return {
          code: 400,
          error: {
            message: 'Invalid operator address format',
            type: ERROR.ERROR_OPERATOR_INVALID_ADDRESS
          }
        };
      }

      const ROUND_HISTORY_QUERY = `query ($limit: Int!, $after: Cursor) {
      rounds(first: $limit, after: $after, filter:{
        operator:{
          equalTo: "${operator}"
        }
       }, orderBy: [TIMESTAMP_DESC]){
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
            }
          }
        }`;

      const response = await this.http.fetchGraphql<RoundsGraphqlResponse>(
        ROUND_HISTORY_QUERY,
        after,
        limit
      );

      if (!response || !response.data || !response.data.rounds || !response.data.rounds.edges) {
        return {
          code: 404,
          error: {
            message: `No rounds data found for operator ${operator}`,
            type: ERROR.ERROR_ROUNDS_NOT_FOUND
          }
        };
      }

      return {
        code: 200,
        data: response.data
      };
    } catch (error: any) {
      return handleError(error as ErrorType);
    }
  }
}
