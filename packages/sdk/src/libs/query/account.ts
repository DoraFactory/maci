import { Http } from '../http';
import { BalanceResponse } from '../../types';
import { handleError, ErrorType } from '../errors';
import { ERROR } from '../errors/types';

export class UserAccount {
  public http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  async balanceOf(address: string): Promise<BalanceResponse> {
    try {
      const path = `/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=peaka`;
      const data = await this.http.fetchRest(path);

      if (data['code'] === undefined) {
        const response: BalanceResponse = {
          code: 200,
          data: {
            balance: data['balance']['amount'],
          },
        };
        return response;
      } else {
        return {
          code: 404,
          error: {
            message: 'Address not found',
            type: ERROR.ERROR_ADDRESS_NOT_FOUND,
          },
        };
      }
    } catch (error) {
      return handleError(error as ErrorType);
    }
  }
}
