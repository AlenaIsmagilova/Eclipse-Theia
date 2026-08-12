export const NOTIFICATION_SERVICE_PATH = '/services/notification-center';
export const NOTIFICATION_HISTORY_LIMIT = 100;

export type NotificationSeverity = 'info' | 'warning' | 'error';

export interface NotificationAction {
    readonly id: string;
    readonly label: string;
}

export interface Notification {
    readonly id: string;
    readonly severity: NotificationSeverity;
    readonly title: string;
    readonly message: string;
    readonly actions?: readonly NotificationAction[];
}

export interface NotificationRecord extends Notification {
    readonly createdAt: number;
}

export interface ActionInvocation {
    readonly notificationId: string;
    readonly actionId: string;
}

export const NotificationService = Symbol('NotificationService');

export interface NotificationService {
    push(notification: Notification): Promise<void>;
    getHistory(): Promise<NotificationRecord[]>;
    clearHistory(): Promise<void>;
    actionInvoked(invocation: ActionInvocation): Promise<void>;
}

export interface NotificationClient {
    onNotification(notification: NotificationRecord): void;
    onHistoryCleared(): void;
}
