declare module 'gettyimages-api' {
  export interface DisplaySize {
    name: string;
    uri: string;
  }

  export interface GettyVideo {
    id: string;
    title: string;
    display_sizes: DisplaySize[];
  }

  export interface GettyPhoto {
    id: string;
    title: string;
    display_sizes: DisplaySize[];
  }

  export interface GettyVideoResponse {
    videos: GettyVideo[];
  }

  export interface GettyPhotoResponse {
    images: GettyPhoto[];
  }

  export interface AccessTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
  }

  interface SearchBuilder {
    withPhrase(phrase: string): SearchBuilder;
    withPage(page: number): SearchBuilder;
    withPageSize(size: number): SearchBuilder;
    execute(): Promise<GettyVideoResponse | GettyPhotoResponse>;
  }

  interface SearchApi {
    videos(): SearchBuilder;
    images(): SearchBuilder;
  }

  interface CustomRequestBuilder {
    withRoute(route: string): CustomRequestBuilder;
    withMethod(method: string): CustomRequestBuilder;
    withQueryParameters(params: Record<string, any>): CustomRequestBuilder;
    withCustomHeader(name: string, value: string): CustomRequestBuilder;
    withBody(body: string): CustomRequestBuilder;
    execute(): Promise<any>;
  }

  interface GettyCredentials {
    apiKey: string;
    apiSecret: string;
    username?: string;
    password?: string;
  }

  class Api {
    constructor(config: GettyCredentials);
    search(): SearchApi;
    getAccessToken(): Promise<AccessTokenResponse>;
    customrequest(): CustomRequestBuilder;
  }

  export default Api;
} 