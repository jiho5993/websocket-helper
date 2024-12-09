import WebSocket, { PerMessageDeflateOptions } from 'ws';
import http from 'http';
import * as _ from 'lodash';

export type WebsocketState = 0 | 1 | 2 | 3;

export const DEFAULT_MAX_PAYLOAD = 100 * 1024 * 1024;
export const DEFAULT_RECONNECT_DELAY = 1000;
export const DEFAULT_RECONNECT_ATTEMPTS = 5;

export interface IReconnectConfig {
  reconnect?: boolean;
  delay?: number;
  attempts?: number;
}

export interface IClientConfig {
  agent?: http.Agent;
  autoPong?: boolean;
  maxPayload?: number;
  protocolVersion?: number;
  perMessageDeflate?: boolean | PerMessageDeflateOptions;
  handshakeTimeout?: number;
  reconnectConfig?: IReconnectConfig;
}

export class WebsocketClient {
  private client: WebSocket | null = null;
  private readonly url: string;
  private readonly clientConfig: IClientConfig;
  private readonly reconnectConfig: IReconnectConfig;
  private reconnectAttempts = 0;

  private requestId = 0;
  private promiseAwaitingResponse = new Map<string | number, any>();

  constructor(url: string, config: IClientConfig = {}) {
    if (!WebsocketClient.isValidUrl(url)) {
      throw new Error('Url must start with `wss://`, `ws://`, `wss+unix://`, or `ws+unix://`.');
    }

    this.url = url;
    this.reconnectConfig = WebsocketClient.getReconnectConfig(config);
    this.clientConfig = WebsocketClient.getClientConfig(config);
  }

  static async createWithConnection(url: string, config: IClientConfig = {}): Promise<WebsocketClient> {
    const websocketClient = new WebsocketClient(url, config);
    await websocketClient.createConnection();
    return websocketClient;
  }

  static isValidUrl(url: string): boolean {
    return url.startsWith('wss://') || url.startsWith('ws://') || url.startsWith('wss+unix://') || url.startsWith('ws+unix://');
  }

  isConnected(): boolean {
    return this.state === WebSocket.OPEN;
  }

  isEmptyAwaitingResponse(): boolean {
    return this.promiseAwaitingResponse.size === 0;
  }

  createRequestId(payload?: any): string | number {
    if (Array.isArray(payload) && payload.length > 0) {
      if (payload[0]?.id) {
        return payload[0].id;
      }
    }

    if (payload?.id) {
      return payload.id;
    }

    this.requestId += 1;
    return this.requestId;
  }

  createRequestMessage(requestId: string | number, payload: any): string {
    if (Array.isArray(payload) && payload.length > 0) {
      payload[0].id = requestId;
      return JSON.stringify(payload);
    }

    return JSON.stringify({ ...payload, id: requestId });
  }

  async createConnection(): Promise<void> {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    /**
     * new WebSocket()이 실행될 경우, WebSocket 객체가 만들어지고, connection을 비동기적으로 시도한다.
     *
     * connection 성공 여부
     * 1. 실패시 : 연결이 실페해서 error 이벤트가 발생한다면, onConnectionFailed 메소드가 호출된다.
     * 2. 성공시 : open event가 발생하고, 이후부터 error, close, message 등 새로운 이벤트 함수를 등록한다.
     */
    this.client = new WebSocket(this.url, this.clientConfig);
    this.client.on('error', this.onConnectionFailed.bind(this));

    return new Promise((resolve) => {
      this.client.once('open', () => {
        /** 이벤트가 중복으로 생성되는 것을 방지 */
        this.client.removeAllListeners();

        this.client.on('error', this.onError.bind(this));
        this.client.on('close', this.onClose.bind(this));
        this.client.on('message', this.onMessage.bind(this));

        resolve();
      });
    });
  }

  async sendReceiveMessage(payload: any): Promise<any> {
    if (!this.isConnected() || _.isNull(this.client)) {
      throw new Error('Websocket is not connected');
    }

    const id = this.createRequestId(payload);
    const message = this.createRequestMessage(id, payload);

    if (this.promiseAwaitingResponse.has(id)) {
      throw new Error(`Request with id "${id}" is already pending`);
    }

    const promise = new Promise((resolve, reject) => this.promiseAwaitingResponse.set(id, { resolve, reject }));

    this.client.send(message, (err) => {
      if (err) {
        throw new Error(`Failed to send message: ${err}`);
      }
    });

    return promise;
  }

  private onConnectionFailed(error: Error): void {
    if (this.client) {
      this.client.removeAllListeners();
      this.client = null;
    }

    if (this.reconnectConfig?.reconnect && this.reconnectAttempts < this.reconnectConfig.attempts) {
      this.reconnect();
      return;
    }

    throw new Error(`Websocket connection error: ${error.message}`);
  }

  private onMessage(data: any) {
    const result = JSON.parse(data);

    let id;
    if (Array.isArray(result)) {
      id = result[0].id;
    } else {
      id = result.id;
    }

    if (!this.promiseAwaitingResponse.has(id)) {
      throw new Error(`No existing promise: ${JSON.stringify(result)}`);
    }

    const promise = this.promiseAwaitingResponse.get(id);
    promise.resolve(result);

    this.promiseAwaitingResponse.delete(id);
  }

  private onError(error: any): void {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`WebSocket error: ${error}`);
  }

  private onClose(code: number, reason: any): void {
    this.client.removeAllListeners();
    this.client = null;
  }

  private reconnect(): void {
    if (_.isUndefined(this.reconnectConfig.attempts)) {
      throw new Error('Reconnect attempts is not defined');
    }

    if (this.reconnectAttempts >= this.reconnectConfig.attempts) {
      throw new Error('Reconnect attempts exceeded');
    }

    setTimeout(async () => {
      this.reconnectAttempts += 1;
      await this.createConnection();

      if (this.isConnected()) {
        this.reconnectAttempts = 0;
      }
    }, this.reconnectConfig.delay);
  }

  private get state(): WebsocketState {
    return this.client ? this.client.readyState : WebSocket.CLOSED;
  }

  private static getReconnectConfig(config: IClientConfig): IReconnectConfig {
    const reconnectConfig: IReconnectConfig = {
      reconnect: false,
      delay: DEFAULT_RECONNECT_DELAY,
      attempts: DEFAULT_RECONNECT_ATTEMPTS,
    };

    if (!_.isUndefined(config?.reconnectConfig)) {
      if (_.isBoolean(config.reconnectConfig?.reconnect)) {
        reconnectConfig.reconnect = config.reconnectConfig.reconnect;
      }
      if (_.isNumber(config.reconnectConfig?.delay) && config.reconnectConfig?.delay > 0) {
        reconnectConfig.delay = config.reconnectConfig.delay;
      }
      if (_.isNumber(config.reconnectConfig?.attempts) && config.reconnectConfig?.attempts > 0) {
        reconnectConfig.attempts = config.reconnectConfig.attempts;
      }
    }

    return reconnectConfig;
  }

  private static getClientConfig(config: IClientConfig): IClientConfig {
    const clientConfig: IClientConfig = {
      maxPayload: _.isNumber(config.maxPayload) && config.maxPayload > 0 ? config.maxPayload : DEFAULT_MAX_PAYLOAD,
      ...config,
    };

    return clientConfig;
  }
}
