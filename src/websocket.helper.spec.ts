import WebSocket from 'ws';
import { DEFAULT_MAX_PAYLOAD, DEFAULT_RECONNECT_ATTEMPTS, DEFAULT_RECONNECT_DELAY, IClientConfig, WebsocketClient } from './websocket.helper';

describe('WebSocketHelper', () => {
  const wss = new WebSocket.Server({ port: 8080 });
  const url = 'ws://localhost:8080/';

  beforeAll(() => {
    /** 메시지를 그대로 반환하는 테스트용 웹소켓 서버 생성 */
    wss.on('connection', (websocket) => {
      websocket.on('message', (message: any) => {
        const data = JSON.parse(message);
        websocket.send(JSON.stringify(data));
      })
    });
  });

  afterAll(() => {
    wss.close();
  });

  describe('Websocket created constructor', () => {
    describe('clientConfig 설정', () => {
      it('config가 없어도 인스턴스 생성이 된다', () => {
        const result = new WebsocketClient(url);

        expect(result).toBeInstanceOf(WebsocketClient);
        expect(result.isConnected()).not.toBeTruthy();

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.url).toEqual(url);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.clientConfig.maxPayload).toEqual(DEFAULT_MAX_PAYLOAD);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.reconnectConfig.reconnect).not.toBeTruthy();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.reconnectConfig.delay).toEqual(DEFAULT_RECONNECT_DELAY);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.reconnectConfig.attempts).toEqual(DEFAULT_RECONNECT_ATTEMPTS);
      });
      it('config 정보를 기입하면 해당 정보가 반영된다', async () => {
        const config: IClientConfig = {
          maxPayload: 100 * 1024,
          autoPong: false,
          perMessageDeflate: false,
          protocolVersion: 8,
          handshakeTimeout: 30000,
        };
        const result = new WebsocketClient(url, config);
        await result.createConnection();

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.client._receiver._maxPayload).toEqual(config.maxPayload);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.client._autoPong).toEqual(config.autoPong);
      });
    });
    describe('client 생성', () => {
      it('connection이 이뤄지지 않았기 때문에 client 정보가 없다', () => {
        const result = new WebsocketClient(url);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.client).toBeNull();
        expect(result.isConnected()).not.toBeTruthy();
      });
      it('connection이 발생하면 receiver 정보가 반영되고, 기본으로 설정된 config가 반영된다.', async () => {
        const result = new WebsocketClient(url);
        await result.createConnection();

        expect(result.isConnected()).toBeTruthy();

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.client._receiver).not.toBeNull();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.client._eventsCount).not.toEqual(0);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.client._receiver._maxPayload).toEqual(DEFAULT_MAX_PAYLOAD);
      });
    });
    describe('메시지 요청 및 응답', () => {
      it('메시지 요청에 성공하면 requestId가 1로 할당되고, 요청과 같은 응답 메시지를 받는다', async () => {
        const client = new WebsocketClient(url);
        await client.createConnection();

        const payload = { message: 'Hello, World!' };
        const result = await client.sendReceiveMessage(payload);

        expect(result).toEqual({ ...payload, id: 1 });
      });
      it('requestId를 작접 할당하고, 메시지를 보내면 할당된 requestId로 응답을 받는다.', async () => {
        const client = new WebsocketClient(url);
        await client.createConnection();

        const payload = { message: 'assigned request id.', id: 4 };
        const result = await client.sendReceiveMessage(payload);

        expect(result).toEqual(payload);
      });
      it('여러 메시지를 일괄 요청하고 응답을 받을 수 있다.', async () => {
        const client = new WebsocketClient(url);
        await client.createConnection();

        const payloads = [
          { message: '1st message', id: 1 },
          { message: '2nd message', id: 2 },
          { message: '3rd message', id: 3 },
        ];
        const result = await client.sendReceiveMessage(payloads);

        expect(result).toEqual(payloads);
      });
      it('메시지를 여러번 보낼때, 응답의 순서가 꼬이지 않게 수신한다. (Promise.all / Batch)', async () => {
        const client = new WebsocketClient(url);
        await client.createConnection();

        const payloads = [
          { message: '1st message', id: 1 },
          { message: '3rd message', id: 3 },
          { message: '2nd message', id: 2 },
        ];

        // Promise.all
        const promiseAllResult = await Promise.all(payloads.map((payload) => client.sendReceiveMessage(payload)));
        for (let i = 0; i < payloads.length; i += 1) {
          expect(promiseAllResult[i].id).toEqual(payloads[i].id);
        }

        // Batch
        const batchResult = await client.sendReceiveMessage(payloads);
        for (let i = 0; i < payloads.length; i += 1) {
          expect(batchResult[i].id).toEqual(payloads[i].id);
        }
      });
    });
  });

  describe('Websocket created static createWithConnection function', () => {
    it('connection이 올바르게 형성된다', async () => {
      const result = await WebsocketClient.createWithConnection(url);

      expect(result).toBeInstanceOf(WebsocketClient);
      expect(result.isConnected()).toBeTruthy();

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      expect(result.client).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      expect(result.client.url).toEqual(url);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      expect(result.client._receiver).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      expect(result.client._eventsCount).not.toEqual(0);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      expect(result.client._receiver._maxPayload).toEqual(DEFAULT_MAX_PAYLOAD);
    });
    it('config 정보를 기입하면 해당 정보가 반영된다', async () => {
      const config: IClientConfig = {
        maxPayload: 100 * 1024,
        autoPong: false,
      };
      const result = await WebsocketClient.createWithConnection(url, config);

      expect(result.isConnected()).toBeTruthy();

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      expect(result.client._receiver._maxPayload).toEqual(config.maxPayload);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      expect(result.client._autoPong).toEqual(config.autoPong);
    });
  });

  describe('Websocket reconnect', () => {
    describe('reconnectConfig 설정', () => {
      it('reconnectConfig를 설정하지 않으면, 기본값으로 설정된다', () => {
        const result = new WebsocketClient(url);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.reconnectConfig.reconnect).not.toBeTruthy();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.reconnectConfig.delay).toEqual(DEFAULT_RECONNECT_DELAY);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.reconnectConfig.attempts).toEqual(DEFAULT_RECONNECT_ATTEMPTS);
      });
      it('reconnectConfig를 설정하면, 해당 값으로 설정된다', () => {
        const reconnectConfig = {
          reconnect: true,
          delay: 10000,
          attempts: 50,
        };
        const clientConfig = { reconnectConfig };
        const result = new WebsocketClient(url, clientConfig);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.reconnectConfig.reconnect).toBeTruthy();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.reconnectConfig.delay).toEqual(reconnectConfig.delay);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(result.reconnectConfig.attempts).toEqual(reconnectConfig.attempts);
      });
    });
  });
});
