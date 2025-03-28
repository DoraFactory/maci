import { FetchOptions, Http } from '../http/http';

export type IndexerParams = {
  restEndpoint: string;
  apiEndpoint: string;
  registryAddress: string;
  http: Http;
};
