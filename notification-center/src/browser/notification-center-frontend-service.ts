import { DisposableCollection, Emitter, Event } from '@theia/core';
import {
    RemoteConnectionProvider,
    ServiceConnectionProvider
} from '@theia/core/lib/browser/messaging/service-connection-provider';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { RpcProxy } from '@theia/core/lib/common/messaging/proxy-factory';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ActionInvocation,
    NOTIFICATION_HISTORY_LIMIT,
    NOTIFICATION_SERVICE_PATH,
    Notification,
    NotificationClient,
    NotificationRecord,
    NotificationService
} from '../common/notification-protocol';

@injectable()
export class NotificationCenterFrontendService implements NotificationClient, FrontendApplicationContribution {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly onDidChangeToastsEmitter = new Emitter<void>();
    readonly onDidChangeToasts: Event<void> = this.onDidChangeToastsEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeEmitter,
        this.onDidChangeToastsEmitter
    );
    protected readonly service: RpcProxy<NotificationService>;
    protected historyRecords: NotificationRecord[] = [];
    protected toastRecords: NotificationRecord[] = [];
    protected readonly toastTimeouts = new Map<string, number>();
    protected historyEpoch = 0;
    protected started = false;
    protected disposed = false;

    constructor(
        @inject(RemoteConnectionProvider) connectionProvider: ServiceConnectionProvider
    ) {
        this.service = connectionProvider.createProxy<NotificationService>(
            NOTIFICATION_SERVICE_PATH,
            this
        );
        this.toDispose.push(this.service.onDidOpenConnection(() => {
            if (this.started) {
                void this.loadHistory();
            }
        }));
    }

    get history(): readonly NotificationRecord[] {
        return this.historyRecords.slice();
    }

    get toasts(): readonly NotificationRecord[] {
        return this.toastRecords.slice();
    }

    async initialize(): Promise<void> {
        this.started = true;
        await this.loadHistory();
    }

    onStop(_app: FrontendApplication): void {
        this.dispose();
    }

    async push(notification: Notification): Promise<void> {
        await this.service.push(notification);
    }

    async clearHistory(): Promise<void> {
        await this.service.clearHistory();
    }

    async invokeAction(notificationId: string, actionId: string): Promise<void> {
        const invocation: ActionInvocation = { notificationId, actionId };
        await this.service.actionInvoked(invocation);
    }

    async invokeToastAction(notificationId: string, actionId: string): Promise<void> {
        await this.invokeAction(notificationId, actionId);
        this.dismissToast(notificationId);
    }

    dismissToast(notificationId: string): void {
        const timeout = this.toastTimeouts.get(notificationId);
        if (timeout !== undefined) {
            window.clearTimeout(timeout);
            this.toastTimeouts.delete(notificationId);
        }

        const nextRecords = this.toastRecords.filter(record => record.id !== notificationId);
        if (nextRecords.length !== this.toastRecords.length) {
            this.toastRecords = nextRecords;
            this.onDidChangeToastsEmitter.fire(undefined);
        }
    }

    onNotification(notification: NotificationRecord): void {
        if (this.disposed) {
            return;
        }

        const existingIndex = this.historyRecords.findIndex(record => record.id === notification.id);
        if (existingIndex !== -1) {
            this.historyRecords[existingIndex] = notification;
            this.onDidChangeEmitter.fire(undefined);
            return;
        }

        this.historyRecords.push(notification);
        this.trimHistory();
        this.onDidChangeEmitter.fire(undefined);
        this.showToast(notification);
    }

    onHistoryCleared(): void {
        if (this.disposed) {
            return;
        }
        this.historyEpoch++;
        this.historyRecords = [];
        this.onDidChangeEmitter.fire(undefined);
        this.clearToasts();
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.clearToastTimeouts();
        this.toastRecords = [];
        this.toDispose.dispose();
    }

    protected async loadHistory(): Promise<void> {
        const epoch = this.historyEpoch;
        try {
            const snapshot = await this.service.getHistory();
            if (this.disposed || epoch !== this.historyEpoch) {
                return;
            }
            this.mergeHistory(snapshot);
            this.onDidChangeEmitter.fire(undefined);
        } catch (error) {
            console.error('Failed to load notification history.', error);
        }
    }

    protected mergeHistory(snapshot: readonly NotificationRecord[]): void {
        const recordsById = new Map<string, NotificationRecord>();
        for (const record of snapshot) {
            recordsById.set(record.id, record);
        }
        for (const record of this.historyRecords) {
            recordsById.set(record.id, record);
        }
        this.historyRecords = Array.from(recordsById.values())
            .sort((left, right) => left.createdAt - right.createdAt)
            .slice(-NOTIFICATION_HISTORY_LIMIT);
    }

    protected trimHistory(): void {
        if (this.historyRecords.length > NOTIFICATION_HISTORY_LIMIT) {
            this.historyRecords.splice(0, this.historyRecords.length - NOTIFICATION_HISTORY_LIMIT);
        }
    }

    protected showToast(notification: NotificationRecord): void {
        this.toastRecords.push(notification);
        if (notification.severity !== 'error') {
            const timeout = window.setTimeout(() => {
                this.dismissToast(notification.id);
            }, 5000);
            this.toastTimeouts.set(notification.id, timeout);
        }
        this.onDidChangeToastsEmitter.fire(undefined);
    }

    protected clearToasts(): void {
        this.clearToastTimeouts();
        if (this.toastRecords.length > 0) {
            this.toastRecords = [];
            this.onDidChangeToastsEmitter.fire(undefined);
        }
    }

    protected clearToastTimeouts(): void {
        for (const timeout of this.toastTimeouts.values()) {
            window.clearTimeout(timeout);
        }
        this.toastTimeouts.clear();
    }
}
