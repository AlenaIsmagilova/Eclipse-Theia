import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common/event';
import { ILogger } from '@theia/core/lib/common/logger';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { Container } from '@theia/core/shared/inversify';
import * as sinon from 'sinon';
import {
    ActionInvocation,
    Notification,
    NotificationRecord,
    NotificationService,
    NOTIFICATION_SERVICE_PATH,
    NOTIFICATION_HISTORY_LIMIT
} from '../common/notification-protocol';
import backendModule from './notification-center-backend-module';
import { NotificationClientConnection, NotificationServiceImpl } from './notification-service-impl';

describe('NotificationServiceImpl', () => {
    let clock: sinon.SinonFakeTimers;
    let logger: ILogger;
    let loggerInfo: sinon.SinonStub;
    let loggerError: sinon.SinonStub;
    let service: NotificationServiceImpl;

    beforeEach(() => {
        clock = sinon.useFakeTimers({ now: 1_700_000_000_000 });
        loggerInfo = sinon.stub().resolves();
        loggerError = sinon.stub().resolves();
        logger = {
            info: loggerInfo,
            error: loggerError
        } as unknown as ILogger;
        service = new NotificationServiceImpl(logger);
    });

    afterEach(() => {
        service.dispose();
        sinon.restore();
    });

    it('starts with an empty history', async () => {
        expect(await service.getHistory()).to.deep.equal([]);
    });

    it('stores a push with a backend timestamp and broadcasts it immediately', async () => {
        const connected = createClient();
        service.registerClient(connected.client);
        const notification = makeNotification('first', 'warning');

        await service.push(notification);

        sinon.assert.calledOnce(connected.onNotification);
        expect(connected.onNotification.firstCall.args[0]).to.deep.equal({
            ...notification,
            createdAt: 1_700_000_000_000
        });
        expect(await service.getHistory()).to.deep.equal([{
            ...notification,
            createdAt: 1_700_000_000_000
        }]);
        connected.dispose();
    });

    it('keeps only the latest 100 records in chronological order', async () => {
        for (let index = 1; index <= NOTIFICATION_HISTORY_LIMIT + 1; index++) {
            await service.push(makeNotification(String(index)));
            clock.tick(1);
        }

        const history = await service.getHistory();
        expect(history).to.have.length(NOTIFICATION_HISTORY_LIMIT);
        expect(history.map(record => record.id)).to.deep.equal(
            Array.from({ length: NOTIFICATION_HISTORY_LIMIT }, (_, index) => String(index + 2))
        );
        expect(history.map(record => record.createdAt)).to.deep.equal(
            Array.from({ length: NOTIFICATION_HISTORY_LIMIT }, (_, index) => 1_700_000_000_001 + index)
        );
    });

    it('defensively copies pushed data, history results, and each client payload', async () => {
        const firstClient = createClient();
        const secondClient = createClient();
        service.registerClient(firstClient.client);
        service.registerClient(secondClient.client);

        const mutableAction = { id: 'open', label: 'Open' };
        const mutableActions = [mutableAction];
        const notification: Notification = {
            ...makeNotification('copy'),
            actions: mutableActions
        };
        firstClient.onNotification.callsFake((record: NotificationRecord) => {
            (record as { title: string }).title = 'changed by client';
            (record.actions?.[0] as { label: string }).label = 'changed by client';
        });

        await service.push(notification);
        mutableAction.label = 'changed by caller';
        mutableActions.push({ id: 'later', label: 'Later' });

        const secondPayload = secondClient.onNotification.firstCall.args[0] as NotificationRecord;
        expect(secondPayload.title).to.equal('Title copy');
        expect(secondPayload.actions).to.deep.equal([{ id: 'open', label: 'Open' }]);

        const firstRead = await service.getHistory();
        (firstRead[0] as { message: string }).message = 'changed after read';
        (firstRead[0].actions?.[0] as { label: string }).label = 'changed after read';
        firstRead.push({ ...makeNotification('injected'), createdAt: 0 });

        expect(await service.getHistory()).to.deep.equal([{
            ...makeNotification('copy'),
            actions: [{ id: 'open', label: 'Open' }],
            createdAt: 1_700_000_000_000
        }]);
        firstClient.dispose();
        secondClient.dispose();
    });

    it('clears history and broadcasts the clear event to every connected client', async () => {
        const firstClient = createClient();
        const secondClient = createClient();
        service.registerClient(firstClient.client);
        service.registerClient(secondClient.client);
        await service.push(makeNotification('to-clear'));

        await service.clearHistory();

        expect(await service.getHistory()).to.deep.equal([]);
        sinon.assert.calledOnce(firstClient.onHistoryCleared);
        sinon.assert.calledOnce(secondClient.onHistoryCleared);
        firstClient.dispose();
        secondClient.dispose();
    });

    it('broadcasts pushes to multiple connected clients', async () => {
        const firstClient = createClient();
        const secondClient = createClient();
        service.registerClient(firstClient.client);
        service.registerClient(secondClient.client);

        await service.push(makeNotification('shared', 'error'));

        sinon.assert.calledOnce(firstClient.onNotification);
        sinon.assert.calledOnce(secondClient.onNotification);
        expect(firstClient.onNotification.firstCall.args[0]).to.deep.equal(secondClient.onNotification.firstCall.args[0]);
        firstClient.dispose();
        secondClient.dispose();
    });

    it('removes a client when its RPC connection closes', async () => {
        const connected = createClient();
        service.registerClient(connected.client);

        connected.close();
        await service.push(makeNotification('after-close'));
        await service.clearHistory();

        sinon.assert.notCalled(connected.onNotification);
        sinon.assert.notCalled(connected.onHistoryCleared);
        connected.dispose();
    });

    it('allows an explicit registration disposal to remove a client', async () => {
        const connected = createClient();
        const registration = service.registerClient(connected.client);

        registration.dispose();
        await service.push(makeNotification('after-dispose'));

        sinon.assert.notCalled(connected.onNotification);
        connected.dispose();
    });

    it('publishes and logs action invocations with defensive event data', async () => {
        const seen: ActionInvocation[] = [];
        service.onDidInvokeAction(invocation => {
            seen.push({ ...invocation });
            (invocation as { actionId: string }).actionId = 'mutated-by-listener';
        });
        const invocation: ActionInvocation = {
            notificationId: 'notification-1',
            actionId: 'retry'
        };

        await service.actionInvoked(invocation);

        expect(seen).to.deep.equal([invocation]);
        sinon.assert.calledOnceWithExactly(
            loggerInfo,
            '[notification-center] Action invoked: notificationId="notification-1", actionId="retry"'
        );
    });

    it('rejects malformed notifications without changing history or notifying clients', async () => {
        const connected = createClient();
        service.registerClient(connected.client);
        const invalidNotifications: unknown[] = [
            null,
            [],
            { id: 1, severity: 'info', title: 'Title', message: 'Message' },
            { id: 'id', severity: 'debug', title: 'Title', message: 'Message' },
            { id: 'id', severity: 'info', title: 1, message: 'Message' },
            { id: 'id', severity: 'info', title: 'Title', message: 1 },
            { id: 'id', severity: 'info', title: 'Title', message: 'Message', actions: {} },
            { id: 'id', severity: 'info', title: 'Title', message: 'Message', actions: [null] },
            { id: 'id', severity: 'info', title: 'Title', message: 'Message', actions: [{ id: 'action', label: 1 }] },
            { id: '', severity: 'info', title: 'Title', message: 'Message' },
            { id: 'id', severity: 'info', title: '  ', message: 'Message' },
            { id: 'id', severity: 'info', title: 'Title', message: '\t' },
            { id: 'id', severity: 'info', title: 'Title', message: 'Message', actions: [{ id: '', label: 'Open' }] },
            { id: 'id', severity: 'info', title: 'Title', message: 'Message', actions: [{ id: 'open', label: ' ' }] },
            {
                id: 'id', severity: 'info', title: 'Title', message: 'Message', actions: [
                    { id: 'open', label: 'Open' },
                    { id: 'open', label: 'Open another way' }
                ]
            },
            {
                id: 'id', severity: 'info', title: 'Title', message: 'Message', actions: [
                    { id: 'open', label: 'Open' },
                    { id: 'open-another-way', label: 'Open' }
                ]
            }
        ];

        for (const invalid of invalidNotifications) {
            await expectTypeError(service.push(invalid as Notification));
        }

        expect(await service.getHistory()).to.deep.equal([]);
        sinon.assert.notCalled(connected.onNotification);
        connected.dispose();
    });

    it('rejects malformed action invocations without firing or logging', async () => {
        const listener = sinon.spy();
        service.onDidInvokeAction(listener);

        await expectTypeError(service.actionInvoked({ notificationId: 1, actionId: 'retry' } as unknown as ActionInvocation));
        await expectTypeError(service.actionInvoked({ notificationId: 'id', actionId: null } as unknown as ActionInvocation));
        await expectTypeError(service.actionInvoked({ notificationId: ' ', actionId: 'retry' }));
        await expectTypeError(service.actionInvoked({ notificationId: 'id', actionId: '' }));

        sinon.assert.notCalled(listener);
        sinon.assert.notCalled(loggerInfo);
    });

    it('continues broadcasting when one client callback fails', async () => {
        const failingClient = createClient();
        const healthyClient = createClient();
        failingClient.onNotification.throws(new Error('connection failed'));
        service.registerClient(failingClient.client);
        service.registerClient(healthyClient.client);

        await service.push(makeNotification('resilient'));

        sinon.assert.calledOnce(healthyClient.onNotification);
        sinon.assert.calledOnceWithExactly(
            loggerError,
            '[notification-center] Client callback onNotification failed: connection failed'
        );
        failingClient.dispose();
        healthyClient.dispose();
    });

    it('binds one service instance to the RPC handler and backend lifecycle', () => {
        const container = new Container();
        container.bind(ILogger).toConstantValue(logger);
        container.load(backendModule);

        const implementation = container.get(NotificationServiceImpl);
        const publicService = container.get<NotificationService>(NotificationService);
        const lifecycle = container.get<BackendApplicationContribution>(BackendApplicationContribution);
        const connectionHandler = container.get<ConnectionHandler>(ConnectionHandler);

        expect(publicService).to.equal(implementation);
        expect(lifecycle).to.equal(implementation);
        expect(connectionHandler).to.be.instanceOf(RpcConnectionHandler);
        expect(connectionHandler.path).to.equal(NOTIFICATION_SERVICE_PATH);
        implementation.dispose();
    });
});

function makeNotification(id: string, severity: Notification['severity'] = 'info'): Notification {
    return {
        id,
        severity,
        title: `Title ${id}`,
        message: `Message ${id}`
    };
}

function createClient(): {
    client: NotificationClientConnection;
    onNotification: sinon.SinonStub;
    onHistoryCleared: sinon.SinonStub;
    close: () => void;
    dispose: () => void;
} {
    const closeEmitter = new Emitter<void>();
    const onNotification = sinon.stub();
    const onHistoryCleared = sinon.stub();
    const client: NotificationClientConnection = {
        onNotification,
        onHistoryCleared,
        onDidCloseConnection: closeEmitter.event
    };
    return {
        client,
        onNotification,
        onHistoryCleared,
        close: () => closeEmitter.fire(undefined),
        dispose: () => closeEmitter.dispose()
    };
}

async function expectTypeError(promise: Promise<unknown>): Promise<void> {
    let thrown: unknown;
    try {
        await promise;
    } catch (error) {
        thrown = error;
    }
    expect(thrown).to.be.instanceOf(TypeError);
}
