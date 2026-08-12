import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { ILogger } from '@theia/core/lib/common/logger';
import { RpcConnectionEventEmitter } from '@theia/core/lib/common/messaging';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ActionInvocation,
    Notification,
    NotificationAction,
    NotificationClient,
    NotificationRecord,
    NotificationService,
    NOTIFICATION_HISTORY_LIMIT
} from '../common/notification-protocol';

export type NotificationClientConnection = NotificationClient & Pick<RpcConnectionEventEmitter, 'onDidCloseConnection'>;

@injectable()
export class NotificationServiceImpl implements NotificationService, Disposable {
    protected readonly history: NotificationRecord[] = [];
    protected readonly clients = new Map<NotificationClientConnection, Disposable>();
    protected readonly actionInvokedEmitter = new Emitter<ActionInvocation>();
    protected disposed = false;

    readonly onDidInvokeAction: Event<ActionInvocation> = this.actionInvokedEmitter.event;

    constructor(
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    registerClient(client: NotificationClientConnection): Disposable {
        this.assertNotDisposed();

        const existingRegistration = this.clients.get(client);
        if (existingRegistration) {
            return existingRegistration;
        }

        const registration = new DisposableCollection();
        this.clients.set(client, registration);
        registration.push(Disposable.create(() => this.clients.delete(client)));
        registration.push(client.onDidCloseConnection(() => registration.dispose()));
        return registration;
    }

    async push(notification: Notification): Promise<void> {
        this.assertNotDisposed();
        const validatedNotification = cloneNotification(notification);
        const record: NotificationRecord = {
            ...validatedNotification,
            createdAt: Date.now()
        };

        this.history.push(record);
        const overflow = this.history.length - NOTIFICATION_HISTORY_LIMIT;
        if (overflow > 0) {
            this.history.splice(0, overflow);
        }

        for (const client of [...this.clients.keys()]) {
            try {
                client.onNotification(cloneNotificationRecord(record));
            } catch (error) {
                this.logClientCallbackError('onNotification', error);
            }
        }
    }

    async getHistory(): Promise<NotificationRecord[]> {
        this.assertNotDisposed();
        return this.history.map(cloneNotificationRecord);
    }

    async clearHistory(): Promise<void> {
        this.assertNotDisposed();
        this.history.length = 0;

        for (const client of [...this.clients.keys()]) {
            try {
                client.onHistoryCleared();
            } catch (error) {
                this.logClientCallbackError('onHistoryCleared', error);
            }
        }
    }

    async actionInvoked(invocation: ActionInvocation): Promise<void> {
        this.assertNotDisposed();
        const validatedInvocation = cloneActionInvocation(invocation);
        const invocationForEvent = cloneActionInvocation(validatedInvocation);
        this.actionInvokedEmitter.fire(invocationForEvent);
        await this.logger.info(
            `[notification-center] Action invoked: notificationId=${JSON.stringify(validatedInvocation.notificationId)}, `
            + `actionId=${JSON.stringify(validatedInvocation.actionId)}`
        );
    }

    onStop(): void {
        this.dispose();
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const registration of [...this.clients.values()]) {
            registration.dispose();
        }
        this.clients.clear();
        this.actionInvokedEmitter.dispose();
        this.history.length = 0;
    }

    protected assertNotDisposed(): void {
        if (this.disposed) {
            throw new Error('Notification service has been disposed.');
        }
    }

    protected logClientCallbackError(callback: keyof NotificationClient, error: unknown): void {
        const detail = error instanceof Error ? error.message : String(error);
        void this.logger.error(`[notification-center] Client callback ${callback} failed: ${detail}`);
    }
}

function cloneNotification(notification: Notification): Notification {
    assertObject(notification, 'notification');
    assertNonEmptyString(notification.id, 'notification.id');
    assertSeverity(notification.severity);
    assertNonEmptyString(notification.title, 'notification.title');
    assertNonEmptyString(notification.message, 'notification.message');

    let actions: NotificationAction[] | undefined;
    if (notification.actions !== undefined) {
        if (!Array.isArray(notification.actions)) {
            throw new TypeError('notification.actions must be an array when provided.');
        }
        actions = notification.actions.map((action, index) => cloneNotificationAction(action, index));
        const actionIds = new Set<string>();
        const actionLabels = new Set<string>();
        for (const action of actions) {
            if (actionIds.has(action.id)) {
                throw new TypeError(`notification.actions contains duplicate id ${JSON.stringify(action.id)}.`);
            }
            if (actionLabels.has(action.label)) {
                throw new TypeError(`notification.actions contains duplicate label ${JSON.stringify(action.label)}.`);
            }
            actionIds.add(action.id);
            actionLabels.add(action.label);
        }
    }

    return {
        id: notification.id,
        severity: notification.severity,
        title: notification.title,
        message: notification.message,
        ...(actions === undefined ? {} : { actions })
    };
}

function cloneNotificationAction(action: NotificationAction, index: number): NotificationAction {
    assertObject(action, `notification.actions[${index}]`);
    assertNonEmptyString(action.id, `notification.actions[${index}].id`);
    assertNonEmptyString(action.label, `notification.actions[${index}].label`);
    return {
        id: action.id,
        label: action.label
    };
}

function cloneNotificationRecord(record: NotificationRecord): NotificationRecord {
    const notification = cloneNotification(record);
    return {
        ...notification,
        createdAt: record.createdAt
    };
}

function cloneActionInvocation(invocation: ActionInvocation): ActionInvocation {
    assertObject(invocation, 'invocation');
    assertNonEmptyString(invocation.notificationId, 'invocation.notificationId');
    assertNonEmptyString(invocation.actionId, 'invocation.actionId');
    return {
        notificationId: invocation.notificationId,
        actionId: invocation.actionId
    };
}

function assertObject(value: unknown, path: string): asserts value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path} must be an object.`);
    }
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${path} must be a non-empty string.`);
    }
}

function assertSeverity(value: unknown): asserts value is Notification['severity'] {
    if (value !== 'info' && value !== 'warning' && value !== 'error') {
        throw new TypeError('notification.severity must be info, warning, or error.');
    }
}
